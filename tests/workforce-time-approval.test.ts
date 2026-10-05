import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import {
  timeReviewSchema,
  timeApprovalResultSchema,
  timeApprovalFormSchema,
  timeApprovalError,
} from "../src/lib/workforce-time-approval";

test("Encargado approves unchanged direct-team shifts with private receipts and current permissions", async (t) => {
  const { db } = await fullDatabase("202610050078_clock_minutes.sql");
  const owner = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const identities = Array.from({ length: 9 }, () => ({
    user: randomUUID(),
    worker: randomUUID(),
    entry: randomUUID(),
  }));
  const [
    foreman,
    worker,
    nested,
    indirect,
    office,
    outsider,
    unprofiled,
    inactive,
    disabled,
  ] = identities;
  const entries = Object.fromEntries(
    [
      "manual",
      "clock",
      "open",
      "void",
      "locked",
      "span",
      "correction",
      "approved",
      "foreign",
    ].map((k) => [k, randomUUID()]),
  );
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const snapshot = async () => {
    await db.exec("reset role");
    const tables = (
      await db.query<{ schemaname: string; tablename: string }>(
        "select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth','storage') order by schemaname,tablename",
      )
    ).rows;
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      const qualified = `"${table.schemaname}"."${table.tablename.replaceAll('"', '""')}"`;
      result[`${table.schemaname}.${table.tablename}`] = (
        await db.query(
          `select to_jsonb(t) data from ${qualified} t order by to_jsonb(t)::text`,
        )
      ).rows;
    }
    return result;
  };
  const review = async (
    tenant = company,
    from = "2026-10-01",
    to = "2026-10-19",
    who: string | null = null,
    page = 1,
  ) =>
    timeReviewSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select public.workforce_time_review($1,$2,$3,$4,$5) data",
          [tenant, from, to, who, page],
        )
      ).rows[0].data,
    );
  const approve = async (
    entry = worker.entry,
    version = 1,
    request = randomUUID(),
    tenant = company,
  ) =>
    timeApprovalResultSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select public.approve_workforce_time($1,$2,$3,$4) data",
          [tenant, request, entry, version],
        )
      ).rows[0].data,
    );
  let inTransaction = false;
  const expectRejected = async (
    run: () => Promise<unknown>,
    message: RegExp,
  ) => {
    if (inTransaction) await db.exec("savepoint expected_failure");
    try {
      await assert.rejects(run, message);
    } finally {
      if (inTransaction)
        await db.exec("rollback to expected_failure; release expected_failure");
    }
  };
  const transaction = async (run: () => Promise<void>) => {
    await db.exec("reset role; begin");
    inTransaction = true;
    try {
      await run();
    } finally {
      await db.exec("rollback; reset role");
      inTransaction = false;
    }
  };
  const blocked = async (
    user: string,
    run: () => Promise<unknown>,
    message: RegExp,
  ) => {
    const before = await snapshot();
    await as(user);
    await expectRejected(run, message);
    assert.deepEqual(
      await snapshot(),
      before,
      "denied request must leave every stored row unchanged",
    );
  };
  try {
    for (const user of [owner, ...identities.map((x) => x.user)])
      await db.query("insert into auth.users values($1,$2,now())", [
        user,
        user + "@example.test",
      ]);
    await as(owner);
    for (const id of [company, foreign])
      await db.query(
        "select public.create_company($1,'Synthetic shift approval')",
        [id],
      );
    for (const x of identities) {
      await db.query("select public.add_company_member($1,$2)", [
        company,
        x.user + "@example.test",
      ]);
      await db.query(
        "select public.set_member_access($1,$2,'member',true,$3)",
        [
          company,
          x.user,
          JSON.stringify({ horasfix: ["read", "write"], activity: ["read"] }),
        ],
      );
      await db.query("select public.save_worker($1,$2,0,$3)", [
        company,
        x.worker,
        JSON.stringify({
          name: "Synthetic " + identities.indexOf(x),
          email: "private@example.test",
          phone: "private phone",
          hourly_rate: "12.34",
          weekly_target: 40,
          active: true,
          notes: "private employment note",
        }),
      ]);
      await db.query("select public.link_worker_login($1,$2,1,$3)", [
        company,
        x.worker,
        x.user + "@example.test",
      ]);
    }
    for (const [x, role, supervisor] of [
      [foreman, "FOREMAN", null],
      [worker, "WORKER", foreman.worker],
      [nested, "FOREMAN", foreman.worker],
      [indirect, "WORKER", nested.worker],
      [office, "OFFICE", null],
      [outsider, "WORKER", null],
      [inactive, "WORKER", foreman.worker],
      [disabled, "WORKER", foreman.worker],
    ] as const)
      await db.query(
        "select public.configure_workforce($1,$2,$3,0,$4,$5,true,'Synthetic approval scope')",
        [company, randomUUID(), x.worker, role, supervisor],
      );
    await db.exec("reset role");
    await db.query("update public.workers set active=false where id=$1", [
      inactive.worker,
    ]);
    await db.query(
      "update public.workforce_profiles set enabled=false where id=$1",
      [disabled.worker],
    );
    for (const x of identities)
      await db.query(
        "insert into public.time_entries(id,company_id,worker_id,starts_at,ends_at,source,notes,reason,created_by,updated_by) values($1,$2,$3,'2026-10-05T13:00:00Z','2026-10-05T14:00:00Z','MANUAL','private shift note','original reason',$4,$4)",
        [x.entry, company, x.worker, owner],
      );
    const insert = async (
      key: string,
      start: string,
      end: string | null,
      status = "PENDIENTE",
      rule: string | null = null,
    ) =>
      db.query(
        "insert into public.time_entries(id,company_id,worker_id,starts_at,ends_at,break_minutes,status,source,minute_rule,notes,reason,gps_in,gps_out,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'private shift note','original reason',$10,$11,$12,$12)",
        [
          entries[key],
          company,
          worker.worker,
          start,
          end,
          key === "manual" ? 5 : 0,
          status,
          rule ? "RELOJ" : "MANUAL",
          rule,
          rule
            ? JSON.stringify({
                lat: 25.7,
                lng: -80.2,
                acc: 10,
                ts: 1791291600000,
              })
            : null,
          rule
            ? JSON.stringify({
                lat: 25.7,
                lng: -80.2,
                acc: 10,
                ts: 1791291630000,
              })
            : null,
          owner,
        ],
      );
    await insert("manual", "2026-10-02T17:00:00Z", "2026-10-02T18:00:00Z");
    await insert(
      "clock",
      "2026-10-06T13:00:00Z",
      "2026-10-06T13:00:30Z",
      "PENDIENTE",
      "CAMPO_CLOCK_V1",
    );
    await insert("open", "2026-10-07T13:00:00Z", null);
    await insert(
      "void",
      "2026-10-08T13:00:00Z",
      "2026-10-08T14:00:00Z",
      "ANULADO",
    );
    await insert("locked", "2026-10-12T13:00:00Z", "2026-10-12T14:00:00Z");
    await insert("span", "2026-10-12T03:30:00Z", "2026-10-12T04:30:00Z");
    await insert("correction", "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z");
    await insert(
      "approved",
      "2026-10-09T13:00:00Z",
      "2026-10-09T14:00:00Z",
      "APROBADO",
    );
    await db.query(
      "insert into public.time_periods(id,company_id,week_start,locked,reason,created_by,updated_by) values($1,$2,'2026-10-12',true,'Synthetic locked week',$3,$3)",
      [randomUUID(), company, owner],
    );
    await db.query(
      "insert into public.time_requests(id,company_id,entry_id,entry_version,starts_at,ends_at,break_minutes,reason,created_by,updated_by) values($1,$2,$3,1,'2026-10-08T15:00:00Z','2026-10-08T17:00:00Z',0,'Synthetic requested correction',$4,$4)",
      [randomUUID(), company, entries.correction, owner],
    );
    const foreignWorker = randomUUID();
    await as(owner);
    await db.query("select public.save_worker($1,$2,0,$3)", [
      foreign,
      foreignWorker,
      JSON.stringify({
        name: "Synthetic foreign",
        email: "",
        phone: "",
        hourly_rate: "0",
        weekly_target: 40,
        active: true,
        notes: "",
      }),
    ]);
    await db.exec("reset role");
    await db.query(
      "insert into public.time_entries(id,company_id,worker_id,starts_at,ends_at,source,created_by,updated_by) values($1,$2,$3,'2026-10-05T13:00:00Z','2026-10-05T14:00:00Z','MANUAL',$4,$4)",
      [entries.foreign, foreign, foreignWorker, owner],
    );

    await t.test(
      "additive migration retains every previous row and creates only an empty private receipt table",
      async () => {
        const before = await snapshot();
        await db.exec(
          await readFile(
            new URL(
              "../supabase/migrations/202610050079_workforce_time_approval.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        const after = await snapshot();
        assert.deepEqual(after["app_private.workforce_time_approvals"], []);
        delete after["app_private.workforce_time_approvals"];
        assert.deepEqual(after, before);
      },
    );
    await t.test(
      "minimal review lists direct active enabled children, excludes self, indirect, foreign, disabled and void",
      async () => {
        const before = await snapshot();
        await as(foreman.user);
        const report = await review();
        assert.deepEqual(
          [...new Set(report.rows.map((r) => r.worker_id))].sort(),
          [worker.worker, nested.worker].sort(),
        );
        assert.equal(
          report.rows.some((r) => r.id === entries.void),
          false,
        );
        const raw = (
          await db.query<{ data: unknown }>(
            "select public.workforce_time_review($1,'2026-10-01','2026-10-19') data",
            [company],
          )
        ).rows[0].data;
        for (const forbidden of [
          "gps_in",
          "gps_out",
          "user_id",
          "hourly_rate",
          "private",
          "created_by",
          "updated_by",
          "notes",
          "reason",
          "supervisor_id",
        ])
          assert.equal(
            JSON.stringify(raw).includes(forbidden),
            false,
            forbidden,
          );
        for (const key of ["open", "locked", "span", "correction", "approved"])
          assert.equal(
            report.rows.find((r) => r.id === entries[key])!.can_approve,
            false,
            key,
          );
        for (const key of ["manual", "clock"])
          assert.equal(
            report.rows.find((r) => r.id === entries[key])!.can_approve,
            true,
            key,
          );
        assert.equal(
          (await review(company, "2026-10-01", "2026-10-19", foreman.worker))
            .count,
          0,
        );
        assert.equal(
          (await review(company, "2026-10-01", "2026-10-19", indirect.worker))
            .count,
          0,
        );
        assert.equal(
          (await review(company, "2026-10-01", "2026-10-19", foreignWorker))
            .count,
          0,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
    for (const key of ["manual", "clock"] as const)
      await t.test(
        `${key} approval preserves clock data and minutes; retry adds no second audit`,
        () =>
          transaction(async () => {
            const before = await snapshot();
            await as(foreman.user);
            const request = randomUUID();
            const result = await approve(entries[key], 1, request);
            assert.deepEqual(result, {
              entry: entries[key],
              version: 2,
              minutes: key === "manual" ? 55 : 1,
              status: "APROBADO",
            });
            const after = await snapshot();
            const beforeRows = before["public.time_entries"] as Array<{
              data: Record<string, unknown>;
            }>;
            const afterRows = after["public.time_entries"] as Array<{
              data: Record<string, unknown>;
            }>;
            const original = beforeRows.find(
              (r) => r.data.id === entries[key],
            )!.data;
            const saved = afterRows.find(
              (r) => r.data.id === entries[key],
            )!.data;
            for (const field of Object.keys(original))
              if (
                !["status", "version", "updated_by", "updated_at"].includes(
                  field,
                )
              )
                assert.deepEqual(saved[field], original[field], field);
            assert.equal(saved.updated_by, foreman.user);
            const changed = Object.keys(before).filter(
              (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
            );
            assert.deepEqual(
              changed.sort(),
              [
                "public.time_entries",
                "public.audit_events",
                "app_private.workforce_time_approvals",
              ].sort(),
            );
            const audit = (
              after["public.audit_events"] as Array<{
                data: Record<string, unknown>;
              }>
            ).find(
              (r) =>
                r.data.entity_id === entries[key] &&
                r.data.operation === "UPDATE",
            )!.data;
            assert.equal(audit.actor_id, foreman.user);
            assert.deepEqual(audit.before_data, original);
            assert.deepEqual(audit.after_data, saved);
            await as(foreman.user);
            assert.deepEqual(await approve(entries[key], 1, request), result);
            assert.deepEqual(await snapshot(), after);
            await as(foreman.user);
            await expectRejected(
              () => approve(nested.entry, 1, request),
              /request_conflict/,
            );
            assert.deepEqual(await snapshot(), after);
          }),
      );
    await t.test(
      "nested Foreman is a direct child eligible for review, but their children remain outside",
      () =>
        transaction(async () => {
          await as(foreman.user);
          assert.equal((await approve(nested.entry)).status, "APROBADO");
          await expectRejected(
            () => approve(indirect.entry),
            /entry_unavailable/,
          );
        }),
    );
    await t.test(
      "administrator uses existing company authority without requiring a Workforce profile",
      () =>
        transaction(async () => {
          await as(owner);
          assert.equal((await review()).role, "ADMIN");
          assert.equal((await approve(unprofiled.entry)).status, "APROBADO");
        }),
    );
    for (const [label, user] of [
      ["Worker", worker.user],
      ["Office", office.user],
      ["unprofiled", unprofiled.user],
      ["disabled", disabled.user],
      ["inactive", inactive.user],
    ] as const)
      await t.test(
        `${label} cannot review or approve team shifts`,
        async () => {
          await blocked(user, () => review(), /foreman_required/);
          await blocked(user, () => approve(), /foreman_required/);
        },
      );
    for (const [label, entry] of [
      ["self", foreman.entry],
      ["indirect", indirect.entry],
      ["unassigned", outsider.entry],
      ["inactive", inactive.entry],
      ["disabled", disabled.entry],
      ["foreign entry", entries.foreign],
      ["missing entry", randomUUID()],
    ] as const)
      await t.test(`Foreman cannot approve ${label}`, () =>
        blocked(foreman.user, () => approve(entry), /entry_unavailable/),
      );
    for (const [key, message] of [
      ["open", /shift_open/],
      ["void", /entry_unavailable/],
      ["locked", /period_locked/],
      ["span", /period_locked/],
      ["correction", /correction_pending/],
      ["approved", /shift_already_approved/],
    ] as const)
      await t.test(`reject ${key} shift without writes`, () =>
        blocked(foreman.user, () => approve(entries[key]), message),
      );
    await t.test(
      "foreign company and stale versions cannot be approved",
      async () => {
        await blocked(
          foreman.user,
          () => approve(entries.foreign, 1, randomUUID(), foreign),
          /permission_denied/,
        );
        await blocked(
          foreman.user,
          () => approve(worker.entry, 99),
          /record_conflict/,
        );
        await blocked(
          foreman.user,
          () => approve(worker.entry, 0),
          /invalid_time_approval/,
        );
        await blocked(foreman.user, () => review(foreign), /permission_denied/);
      },
    );
    for (const [label, sql, args, message] of [
      [
        "read-only module",
        "update public.memberships set permissions=$1::jsonb where company_id=$2 and user_id=$3",
        [JSON.stringify({ horasfix: ["read"] }), company, foreman.user],
        /permission_denied/,
      ],
      [
        "module revoked",
        "update public.memberships set permissions='{}' where company_id=$1 and user_id=$2",
        [company, foreman.user],
        /permission_denied/,
      ],
      [
        "membership disabled",
        "update public.memberships set active=false where company_id=$1 and user_id=$2",
        [company, foreman.user],
        /permission_denied/,
      ],
      [
        "actor profile disabled",
        "update public.workforce_profiles set enabled=false where id=$1",
        [foreman.worker],
        /foreman_required/,
      ],
      [
        "actor becomes Office",
        "update public.workforce_profiles set role='OFFICE' where id=$1",
        [foreman.worker],
        /foreman_required/,
      ],
      [
        "actor becomes inactive",
        "update public.workers set active=false where id=$1",
        [foreman.worker],
        /foreman_required/,
      ],
      [
        "child reassigned",
        "update public.workforce_profiles set supervisor_id=null where id=$1",
        [worker.worker],
        /entry_unavailable/,
      ],
      [
        "child disabled",
        "update public.workforce_profiles set enabled=false where id=$1",
        [worker.worker],
        /entry_unavailable/,
      ],
    ] as const)
      await t.test(`a receipt does not bypass ${label}`, () =>
        transaction(async () => {
          const request = randomUUID();
          await as(foreman.user);
          await approve(worker.entry, 1, request);
          await db.exec("reset role");
          await db.query(sql, [...args]);
          await blocked(
            foreman.user,
            () => approve(worker.entry, 1, request),
            message,
          );
          if (label === "read-only module") {
            await as(foreman.user);
            assert.equal(
              (await review()).rows.some((r) => r.can_approve),
              false,
            );
          }
        }),
      );
    await t.test(
      "read range, timezone boundary and pagination remain scoped",
      () =>
        transaction(async () => {
          await as(foreman.user);
          assert.equal(
            (await review(company, "2026-10-05", "2026-10-05")).count,
            2,
          );
          await expectRejected(
            () => review(company, "2026-10-05", "2026-10-01"),
            /invalid_time_range/,
          );
          await expectRejected(
            () => review(company, "2026-01-01", "2026-12-31"),
            /time_range_too_long/,
          );
          await db.exec("reset role");
          for (let i = 0; i < 25; i++)
            await db.query(
              "insert into public.time_entries(id,company_id,worker_id,starts_at,ends_at,source,created_by,updated_by) values($1,$2,$3,'2026-10-15T13:00:00Z'::timestamptz+($4||' hours')::interval,'2026-10-15T13:30:00Z'::timestamptz+($4||' hours')::interval,'MANUAL',$5,$5)",
              [randomUUID(), company, worker.worker, String(i), owner],
            );
          await as(foreman.user);
          const first = await review(),
            second = await review(company, "2026-10-01", "2026-10-19", null, 2);
          assert.equal(first.rows.length, 20);
          assert.equal(second.rows.length, first.count - 20);
          assert.equal(
            second.rows.some((r) => first.rows.some((x) => x.id === r.id)),
            false,
          );
          assert.equal(
            (await review(company, "2026-10-01", "2026-10-19", null, 999)).page,
            2,
          );
        }),
    );
    await t.test(
      "no direct table, private helper or anonymous RPC access is granted",
      async () => {
        const before = await snapshot();
        await as(foreman.user);
        assert.equal(
          (
            await db.query(
              "select * from public.time_entries where worker_id=$1",
              [worker.worker],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.audit_events")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.workforce_profiles")).rows
            .length,
          0,
        );
        for (const sql of [
          "select * from app_private.workforce_time_approvals",
          "select app_private.can_review_workforce_time(null,null)",
          "update public.time_entries set status='APROBADO'",
        ])
          await expectRejected(() => db.exec(sql), /permission denied/);
        await db.exec("reset role; set role anon");
        await expectRejected(() => review(), /permission denied/);
        await expectRejected(() => approve(), /permission denied/);
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "form rejects missing identifiers and errors explain recovery without SQL details",
      () => {
        assert.equal(
          timeApprovalFormSchema.safeParse({
            request: randomUUID(),
            entry: worker.entry,
            version: "1",
          }).success,
          true,
        );
        assert.equal(
          timeApprovalFormSchema.safeParse({
            request: "",
            entry: worker.entry,
            version: "0",
          }).success,
          false,
        );
        assert.match(
          timeApprovalError({ message: "record_conflict" }),
          /Recarga/,
        );
        assert.match(
          timeApprovalError({ message: "correction_pending" }),
          /administrador/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
