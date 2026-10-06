import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { receiptReviewFixture } from "./helpers/receipt-review-fixture";
import { laborContextSchema, laborReport } from "../src/lib/labor-report";
import { previewLabor } from "../src/lib/labor-costs";
import { timeReviewSchema } from "../src/lib/workforce-time-approval";
import {
  fieldTimeFormSchema,
  fieldTimeReviewFormSchema,
  fieldTimeSubmitResultSchema,
  fieldTimeReviewResultSchema,
  fieldTimeStatusSchema,
  fieldTimeError,
} from "../src/lib/field-time";

test("Campo proposals preserve effective minutes and distinguish team review from applying a requested clock", async (t) => {
  const { db } = await fullDatabase("202610050079_workforce_time_approval.sql");
  const f = await receiptReviewFixture(db);
  const foreman = f.office;
  const entries = Object.fromEntries(
    [
      "closed",
      "open",
      "short",
      "void",
      "locked",
      "foreign",
      "self",
      "other",
    ].map((k) => [k, randomUUID()]),
  );
  let inTransaction = false;
  const snapshot = async () => {
    await db.exec("reset role");
    const tables = (
      await db.query<{ schemaname: string; tablename: string }>(
        "select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth','storage') order by schemaname,tablename",
      )
    ).rows;
    const out: Record<string, unknown> = {};
    for (const table of tables)
      out[table.schemaname + "." + table.tablename] = (
        await db.query(
          `select to_jsonb(t) data from "${table.schemaname}"."${table.tablename}" t order by to_jsonb(t)::text`,
        )
      ).rows;
    return out;
  };
  const reject = async (run: () => Promise<unknown>, message: RegExp) => {
    if (inTransaction) await db.exec("savepoint expected_failure");
    try {
      await assert.rejects(run, message);
    } finally {
      if (inTransaction)
        await db.exec("rollback to expected_failure;release expected_failure");
    }
  };
  const tx = async (run: () => Promise<void>) => {
    await db.exec("reset role;begin");
    inTransaction = true;
    try {
      await run();
    } finally {
      await db.exec("rollback;reset role");
      inTransaction = false;
    }
  };
  const denied = async (
    user: string,
    run: () => Promise<unknown>,
    message: RegExp,
  ) => {
    const before = await snapshot();
    await f.as(user);
    await reject(run, message);
    assert.deepEqual(await snapshot(), before);
  };
  const row = async (id = entries.closed) => {
    await db.exec("reset role");
    return JSON.parse(
      JSON.stringify(
        (
          await db.query<Record<string, unknown>>(
            "select * from time_entries where id=$1",
            [id],
          )
        ).rows[0],
      ),
    ) as Record<string, unknown>;
  };
  const submit = async (
    kind = "REQUEST",
    id = entries.closed,
    version = 1,
    data: unknown = {
      start_hour: "09:00",
      end_hour: "11:00",
      reason: "Synthetic proposal",
    },
    request = randomUUID(),
    company = f.a,
  ) =>
    fieldTimeSubmitResultSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select submit_field_time($1,$2,$3,$4,$5,$6) data",
          [company, request, id, version, kind, JSON.stringify(data)],
        )
      ).rows[0].data,
    );
  const decide = async (
    id = entries.closed,
    version = 2,
    approve = true,
    note = "",
    request = randomUUID(),
    company = f.a,
  ) =>
    fieldTimeReviewResultSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select review_field_time($1,$2,$3,$4,$5,$6) data",
          [company, request, id, version, approve, note],
        )
      ).rows[0].data,
    );
  const status = async (id = entries.closed, company = f.a) =>
    fieldTimeStatusSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select field_time_status($1,$2) data",
          [company, id],
        )
      ).rows[0].data,
    );
  const team = async () =>
    timeReviewSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select workforce_time_review($1,'2026-10-01','2026-10-19') data",
          [f.a],
        )
      ).rows[0].data,
    );
  const fieldRow = async (table: string, id: string) => {
    await db.exec("reset role");
    return JSON.parse(
      JSON.stringify(
        (
          await db.query<Record<string, unknown>>(
            `select * from ${table} where id=$1`,
            [id],
          )
        ).rows[0],
      ),
    ) as Record<string, unknown>;
  };
  const cost = async (id = entries.closed) => {
    await f.as(f.owner);
    const c = laborContextSchema.parse(
      (
        await db.query<{ data: unknown }>("select labor_context($1) data", [
          f.a,
        ])
      ).rows[0].data,
    );
    return laborReport({
      ...c,
      entries: c.entries.filter((e) => e.external_id === id),
    });
  };
  try {
    await f.as(f.owner);
    await db.query(
      "select configure_workforce($1,$2,$3,1,'FOREMAN',null,true,'Synthetic direct supervisor')",
      [f.a, randomUUID(), foreman.id],
    );
    await db.query(
      "select configure_workforce($1,$2,$3,1,'WORKER',$4,true,'Synthetic direct worker')",
      [f.a, randomUUID(), f.worker.id, foreman.id],
    );
    for (const who of [f.worker, foreman])
      await db.query("select set_member_access($1,$2,'member',true,$3)", [
        f.a,
        who.user,
        JSON.stringify({ horasfix: ["read", "write"], activity: ["read"] }),
      ]);
    await db.query(
      "select save_labor_config($1,$2,$3,0,'RATE',$4,'Synthetic dated rate')",
      [
        f.a,
        randomUUID(),
        randomUUID(),
        JSON.stringify({
          worker: f.worker.id,
          from: "2026-01-01",
          to: "",
          amount: "250.00",
          active: true,
        }),
      ],
    );
    await db.query(
      "select save_labor_config($1,$2,$3,0,'PROJECT',$4,'Synthetic project mode')",
      [
        f.a,
        randomUUID(),
        f.project,
        JSON.stringify({ mode: "day", active: true }),
      ],
    );
    await db.exec("reset role");
    await db.query(
      "update workforce_assignments set starts_at='2026-01-01T00:00:00Z' where company_id=$1",
      [f.a],
    );
    for (const [key, worker, company, project, start, end, st, br] of [
      [
        "closed",
        f.worker.id,
        f.a,
        f.project,
        "2026-10-05T13:00:00Z",
        "2026-10-05T14:00:00Z",
        "PENDIENTE",
        5,
      ],
      [
        "open",
        f.worker.id,
        f.a,
        f.project,
        "2026-10-06T13:00:00Z",
        "2026-10-06T14:00:00Z",
        "PENDIENTE",
        0,
      ],
      [
        "short",
        f.worker.id,
        f.a,
        f.project,
        "2026-10-07T13:00:40Z",
        "2026-10-07T13:01:00Z",
        "PENDIENTE",
        0,
      ],
      [
        "void",
        f.worker.id,
        f.a,
        f.project,
        "2026-10-08T13:00:00Z",
        "2026-10-08T14:00:00Z",
        "ANULADO",
        0,
      ],
      [
        "locked",
        f.worker.id,
        f.a,
        f.project,
        "2026-10-12T13:00:00Z",
        "2026-10-12T14:00:00Z",
        "PENDIENTE",
        0,
      ],
      [
        "foreign",
        f.foreignWorker.id,
        f.b,
        f.foreignProject,
        "2026-10-05T13:00:00Z",
        "2026-10-05T14:00:00Z",
        "PENDIENTE",
        0,
      ],
      [
        "self",
        foreman.id,
        f.a,
        f.project,
        "2026-10-05T13:00:00Z",
        "2026-10-05T14:00:00Z",
        "PENDIENTE",
        0,
      ],
      [
        "other",
        f.worker.id,
        f.a,
        f.project,
        "2026-10-09T13:00:00Z",
        "2026-10-09T14:00:00Z",
        "PENDIENTE",
        0,
      ],
    ] as const)
      await db.query(
        "insert into time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,status,source,break_minutes,notes,reason,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,'MANUAL',$8,'private shift note','private shift reason',$9,$9)",
        [entries[key], company, worker, project, start, end, st, br, f.owner],
      );
    await db.query(
      "insert into time_periods(id,company_id,week_start,locked,reason,created_by,updated_by) values($1,$2,'2026-10-12',true,'Synthetic closed week',$3,$3)",
      [randomUUID(), f.a, f.owner],
    );
    await t.test(
      "migration adds four empty tables without changing any preexisting stored row",
      async () => {
        const before = await snapshot();
        await db.exec(
          await readFile(
            new URL(
              "../supabase/migrations/202610050080_field_time.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        const after = await snapshot();
        for (const name of [
          "public.time_field_proposals",
          "public.time_field_declarations",
          "app_private.time_field_values",
          "app_private.time_field_requests",
        ]) {
          assert.deepEqual(after[name], []);
          delete after[name];
        }
        assert.deepEqual(after, before);
      },
    );
    await t.test(
      "REQUEST changes only review metadata and retains clock, break, effective minutes, GPS and original snapshots",
      () =>
        tx(async () => {
          const before = await row();
          await f.as(f.worker.user);
          const request = randomUUID();
          const result = await submit(
            "REQUEST",
            entries.closed,
            1,
            undefined,
            request,
          );
          assert.equal(result.proposed_minutes, 120);
          assert.equal(result.minutes, 55);
          assert.equal(result.version, 2);
          const saved = await row();
          for (const k of Object.keys(before))
            if (!["status", "version", "updated_by", "updated_at"].includes(k))
              assert.deepEqual(saved[k], before[k], k);
          const proposal = await fieldRow(
            "time_field_proposals",
            result.record,
          );
          assert.equal(proposal.original_minutes, 55);
          assert.equal(proposal.original_starts_at, before.starts_at);
          assert.equal(proposal.original_ends_at, before.ends_at);
          const after = await snapshot();
          await f.as(f.worker.user);
          assert.deepEqual(
            await submit("REQUEST", entries.closed, 1, undefined, request),
            result,
          );
          assert.deepEqual(await snapshot(), after);
          await f.as(f.worker.user);
          await reject(
            () =>
              submit(
                "REQUEST",
                entries.closed,
                1,
                { end_hour: "12:00", reason: "changed" },
                request,
              ),
            /request_conflict/,
          );
          assert.deepEqual(await snapshot(), after);
        }),
    );
    await t.test(
      "DECLARE closes an open shift while preserving zero effective minutes and storing a separate declaration",
      () =>
        tx(async () => {
          await db.exec("reset role");
          await db.query("update time_entries set ends_at=null where id=$1", [
            entries.open,
          ]);
          const before = await row(entries.open);
          assert.equal(before.minutes, null);
          await f.as(f.worker.user);
          const result = await submit("DECLARE", entries.open, 1, {
            end_hour: "11:00",
          });
          assert.equal(result.proposed_minutes, 120);
          assert.equal(result.minutes, 0);
          const saved = await row(entries.open);
          assert.equal(saved.ends_at, "2026-10-06T15:00:00.000Z");
          assert.equal(saved.gps_out, before.gps_out);
          assert.equal(saved.minute_rule, before.minute_rule);
          assert.equal(saved.break_minutes, before.break_minutes);
          const declaration = await fieldRow(
            "time_field_declarations",
            result.record,
          );
          assert.equal(declaration.original_minutes, 0);
          assert.equal(declaration.reason, "Olvidé marcar la salida");
          const report = await cost(entries.open);
          assert.equal(report.knownCostCents, 0);
          assert.equal(report.posted, false);
          assert.equal(report.complete, false);
          await f.as(f.owner);
          await decide(entries.open, 2, false, "Synthetic rejection");
          const rejected = await row(entries.open);
          assert.equal(rejected.minutes, 0);
          assert.equal(rejected.status, "APROBADO");
          const rejectedCost = await cost(entries.open);
          assert.equal(rejectedCost.knownCostCents, 0);
          assert.equal(rejectedCost.attendance[0].minutes, 0);
          assert.equal(rejectedCost.pending[0].reason, "SHIFT_REVIEW_REQUIRED");
        }),
    );
    await t.test(
      "Foreman approves proposed minutes only; formal requested endpoints remain for Administration and block Labor and weekly close",
      () =>
        tx(async () => {
          const before = await row();
          await f.as(f.worker.user);
          const proposal = await submit();
          await f.as(foreman.user);
          const report = await team();
          const pending = report.rows.find((r) => r.id === entries.closed)!;
          assert.equal(pending.can_approve, false);
          assert.equal(pending.can_approve_field, true);
          assert.equal(pending.can_reject_field, false);
          assert.equal(pending.field_in_local, null);
          assert.equal(pending.field_out_local, null);
          assert.equal(pending.field_minutes, 120);
          const request = randomUUID();
          const result = await decide(entries.closed, 2, true, "", request);
          assert.equal(result.minutes, 120);
          assert.equal(result.formal_pending, true);
          const saved = await row();
          assert.equal(saved.starts_at, before.starts_at);
          assert.equal(saved.ends_at, before.ends_at);
          assert.equal(saved.break_minutes, 5);
          assert.equal(saved.minute_rule, before.minute_rule);
          assert.deepEqual(saved.gps_out, before.gps_out);
          const formal = await fieldRow(
            "time_field_proposals",
            proposal.record,
          );
          assert.equal(formal.status, "PENDIENTE");
          assert.equal(formal.foreman_minutes, 120);
          assert.equal(formal.foreman_by, foreman.user);
          const after = await snapshot();
          await f.as(foreman.user);
          assert.deepEqual(
            await decide(entries.closed, 2, true, "", request),
            result,
          );
          assert.deepEqual(await snapshot(), after);
          await f.as(foreman.user);
          await reject(
            () => decide(entries.closed, 3),
            /field_review_unavailable/,
          );
          assert.equal((await cost()).knownCostCents, 0);
          await f.as(f.owner);
          await reject(
            () =>
              db.query(
                "select set_time_period($1,'2026-10-05',true,'Synthetic close')",
                [f.a],
              ),
            /unreviewed_period/,
          );
          await f.as(f.owner);
          const ownerRow = (await team()).rows.find(
            (r) => r.id === entries.closed,
          )!;
          assert.equal(ownerRow.field_out_local, "2026-10-05 11:00");
          assert.equal(ownerRow.can_approve_field, true);
          assert.equal(ownerRow.can_reject_field, true);
          const applied = await decide(entries.closed, 3);
          assert.equal(applied.minutes, 120);
          assert.equal(applied.formal_pending, false);
          assert.equal((await row()).ends_at, "2026-10-05T15:00:00.000Z");
          assert.equal(
            (await fieldRow("time_field_proposals", proposal.record)).status,
            "APROBADA",
          );
          const costResult = await cost();
          assert.equal(costResult.knownCostCents, 25000);
          assert.equal(costResult.supplements.length, 1);
          assert.equal(costResult.attendance[0].minutes, 120);
          assert.equal(costResult.posted, false);
          assert.deepEqual(await cost(), costResult);
        }),
    );
    await t.test(
      "Administration can apply requested endpoints directly; rejection requires a reason and retains the prior clock and effective minutes",
      () =>
        tx(async () => {
          const before = await row();
          await f.as(f.worker.user);
          const result = await submit();
          await f.as(f.owner);
          await reject(
            () => decide(entries.closed, 2, false),
            /field_rejection_reason_required/,
          );
          const request = randomUUID();
          const rejected = await decide(
            entries.closed,
            2,
            false,
            "Synthetic rejected request",
            request,
          );
          assert.equal(rejected.minutes, 55);
          assert.equal(rejected.formal_pending, false);
          const saved = await row();
          for (const key of [
            "starts_at",
            "ends_at",
            "minutes",
            "break_minutes",
            "minute_rule",
            "gps_in",
            "gps_out",
          ])
            assert.deepEqual(saved[key], before[key], key);
          assert.equal(
            (await fieldRow("time_field_proposals", result.record)).status,
            "RECHAZADA",
          );
          const after = await snapshot();
          await f.as(f.owner);
          assert.deepEqual(
            await decide(
              entries.closed,
              2,
              false,
              "Synthetic rejected request",
              request,
            ),
            rejected,
          );
          assert.deepEqual(await snapshot(), after);
          await f.as(f.owner);
          await reject(
            () =>
              decide(
                entries.closed,
                2,
                true,
                "Synthetic rejected request",
                request,
              ),
            /request_conflict/,
          );
        }),
    );
    await t.test(
      "DECLARE uses at least one proposed minute; Foreman pays one but Administration uses its rounded canonical interval",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          const proposed = await submit("DECLARE", entries.short, 1, {
            end_hour: "09:01",
            reason: "",
          });
          assert.equal(proposed.proposed_minutes, 1);
          assert.equal(proposed.minutes, 0);
          await f.as(foreman.user);
          assert.equal((await decide(entries.short, 2)).minutes, 1);
          assert.equal(
            (await fieldRow("time_field_declarations", proposed.record)).status,
            "APROBADA",
          );
          await db.exec("reset role");
          await db.query(
            "update time_entries set status='ANULADO',version=version+1 where id=$1",
            [entries.short],
          );
          const id = randomUUID();
          await db.query(
            "insert into time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,source,created_by,updated_by) values($1,$2,$3,$4,'2026-10-07T13:00:40Z','2026-10-07T13:01:00Z','MANUAL',$5,$5)",
            [id, f.a, f.worker.id, f.project, f.owner],
          );
          await f.as(f.worker.user);
          await submit("DECLARE", id, 1, { end_hour: "09:01" });
          await f.as(f.owner);
          assert.equal((await decide(id, 2)).minutes, 0);
          assert.equal((await cost(id)).knownCostCents, 0);
        }),
    );
    await t.test(
      "a declaration retains first positive original minutes and does not clear a pending formal request",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          const first = await submit();
          const declaration = await submit("DECLARE", entries.closed, 2, {
            end_hour: "12:00",
            reason: "Synthetic declaration after request",
          });
          assert.equal(declaration.minutes, 55);
          assert.equal(declaration.proposed_minutes, 180);
          assert.equal(
            (await fieldRow("time_field_declarations", declaration.record))
              .original_minutes,
            55,
          );
          await f.as(foreman.user);
          const result = await decide(entries.closed, 3);
          assert.equal(result.minutes, 180);
          assert.equal(result.formal_pending, true);
          assert.equal((await row()).ends_at, "2026-10-05T16:00:00.000Z");
          assert.equal(
            (await fieldRow("time_field_proposals", first.record)).status,
            "PENDIENTE",
          );
          await f.as(f.owner);
          assert.equal((await decide(entries.closed, 4)).minutes, 120);
          assert.equal((await row()).ends_at, "2026-10-05T15:00:00.000Z");
        }),
    );
    await t.test(
      "a REQUEST cannot initialize DECLARE original minutes before its first declaration",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          await submit();
          await f.as(foreman.user);
          assert.equal((await decide()).minutes, 120);
          await f.as(f.worker.user);
          const first = await submit("DECLARE", entries.closed, 3, {
            end_hour: "12:00",
            reason: "Synthetic first declaration",
          });
          assert.equal(
            (await fieldRow("time_field_declarations", first.record))
              .original_minutes,
            120,
          );
          await f.as(foreman.user);
          assert.equal((await decide(entries.closed, 4)).minutes, 180);
          await f.as(f.worker.user);
          const second = await submit("DECLARE", entries.closed, 5, {
            end_hour: "13:00",
            reason: "Synthetic later declaration",
          });
          assert.equal(
            (await fieldRow("time_field_declarations", second.record))
              .original_minutes,
            120,
          );
        }),
    );
    await t.test(
      "superseded requests retain evidence; stale versions cannot overwrite the current proposal",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          const first = await submit();
          const second = await submit("REQUEST", entries.closed, 2, {
            end_hour: "12:00",
            reason: "Synthetic replacement",
          });
          assert.equal(
            (await fieldRow("time_field_proposals", first.record)).status,
            "SUSTITUIDA",
          );
          assert.equal(
            (await fieldRow("time_field_proposals", second.record)).status,
            "PENDIENTE",
          );
          await denied(f.worker.user, () => submit(), /record_conflict/);
          await denied(
            foreman.user,
            () => decide(entries.closed, 2),
            /record_conflict/,
          );
        }),
    );
    await t.test(
      "classic unchanged approval and administrative correction cannot bypass a pending Field request",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          await submit();
          await denied(
            foreman.user,
            () =>
              db.query("select approve_workforce_time($1,$2,$3,2)", [
                f.a,
                randomUUID(),
                entries.closed,
              ]),
            /field_review_pending/,
          );
          await denied(
            f.owner,
            () =>
              db.query("select request_time_change($1,$2,$3,2,$4)", [
                f.a,
                randomUUID(),
                entries.closed,
                JSON.stringify({
                  starts_at: "2026-10-05T13:00:00Z",
                  ends_at: "2026-10-05T15:00:00Z",
                  break_minutes: 0,
                  reason: "Synthetic legacy request",
                }),
              ]),
            /field_review_pending/,
          );
        }),
    );
    await t.test(
      "an existing administrative request blocks Field submissions and decisions",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          await db.query("select request_time_change($1,$2,$3,1,$4)", [
            f.a,
            randomUUID(),
            entries.closed,
            JSON.stringify({
              starts_at: "2026-10-05T13:00:00Z",
              ends_at: "2026-10-05T15:00:00Z",
              break_minutes: 0,
              reason: "Synthetic legacy request",
            }),
          ]);
          await denied(
            f.worker.user,
            () => submit(),
            /administrative_request_pending/,
          );
        }),
    );
    for (const [label, id, message] of [
      ["void", entries.void, /entry_unavailable/],
      ["locked", entries.locked, /period_locked/],
      ["foreign", entries.foreign, /entry_unavailable/],
      ["someone else", entries.self, /entry_unavailable/],
    ] as const)
      await t.test(
        `own submission rejects ${label} without stored changes`,
        () => denied(f.worker.user, () => submit("REQUEST", id), message),
      );
    await t.test(
      "foreign tenant and missing profile have no Field submission or team decision authority",
      async () => {
        await denied(
          f.worker.user,
          () =>
            submit("REQUEST", entries.foreign, 1, undefined, randomUUID(), f.b),
          /permission_denied/,
        );
        await denied(f.owner, () => submit(), /worker_login_required/);
        await denied(f.worker.user, () => decide(), /foreman_required/);
        await denied(f.foreignWorker.user, () => decide(), /permission_denied/);
        await denied(
          foreman.user,
          () => decide(entries.self),
          /entry_unavailable/,
        );
        await denied(
          foreman.user,
          () => decide(entries.closed, 2, false, "Synthetic rejection"),
          /manager_required/,
        );
      },
    );
    for (const [label, sql, args, message] of [
      [
        "read-only Horas",
        'update memberships set permissions=\'{"horasfix":["read"]}\' where company_id=$1 and user_id=$2',
        [f.a, f.worker.user],
        /permission_denied/,
      ],
      [
        "revoked membership",
        "update memberships set active=false where company_id=$1 and user_id=$2",
        [f.a, f.worker.user],
        /permission_denied/,
      ],
      [
        "inactive worker",
        "update workers set active=false where id=$1",
        [f.worker.id],
        /worker_login_required/,
      ],
      [
        "disabled profile",
        "update workforce_profiles set enabled=false where id=$1",
        [f.worker.id],
        /worker_login_required/,
      ],
    ] as const)
      await t.test(`${label} is rechecked before submission and replay`, () =>
        tx(async () => {
          await f.as(f.worker.user);
          const request = randomUUID();
          await submit("REQUEST", entries.closed, 1, undefined, request);
          await db.exec("reset role");
          await db.query(sql, [...args]);
          await denied(
            f.worker.user,
            () => submit("REQUEST", entries.closed, 1, undefined, request),
            message,
          );
        }),
      );
    for (const [label, sql, args, message] of [
      [
        "read-only Foreman",
        'update memberships set permissions=\'{"horasfix":["read"]}\' where company_id=$1 and user_id=$2',
        [f.a, foreman.user],
        /permission_denied/,
      ],
      [
        "revoked Foreman",
        "update memberships set active=false where company_id=$1 and user_id=$2",
        [f.a, foreman.user],
        /permission_denied/,
      ],
      [
        "changed supervisor",
        "update workforce_profiles set supervisor_id=null where id=$1",
        [f.worker.id],
        /entry_unavailable/,
      ],
      [
        "inactive subordinate",
        "update workers set active=false where id=$1",
        [f.worker.id],
        /entry_unavailable/,
      ],
      [
        "disabled subordinate",
        "update workforce_profiles set enabled=false where id=$1",
        [f.worker.id],
        /entry_unavailable/,
      ],
      [
        "Office role",
        "update workforce_profiles set role='OFFICE' where id=$1",
        [foreman.id],
        /foreman_required/,
      ],
    ] as const)
      await t.test(`${label} is rechecked before a team decision replay`, () =>
        tx(async () => {
          await f.as(f.worker.user);
          await submit();
          await f.as(foreman.user);
          const request = randomUUID();
          await decide(entries.closed, 2, true, "", request);
          await db.exec("reset role");
          await db.query(sql, [...args]);
          await denied(
            foreman.user,
            () => decide(entries.closed, 2, true, "", request),
            message,
          );
        }),
      );
    await t.test(
      "Foreman sees minimal team fields; raw reasons, receipts and other workers' history remain private",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          const submitted = await submit();
          assert.equal((await status()).can_submit, true);
          assert.equal(
            (
              await db.query("select * from time_field_proposals where id=$1", [
                submitted.record,
              ])
            ).rows.length,
            1,
          );
          assert.equal(
            (
              await db.query(
                "select * from record_history($1,'time_field_proposals',$2)",
                [f.a, submitted.record],
              )
            ).rows.length,
            1,
          );
          await f.as(foreman.user);
          assert.equal(
            (
              await db.query("select * from time_field_proposals where id=$1", [
                submitted.record,
              ])
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await db.query(
                "select * from record_history($1,'time_field_proposals',$2)",
                [f.a, submitted.record],
              )
            ).rows.length,
            0,
          );
          assert.equal(
            JSON.stringify(
              (await db.query("select * from activity_feed($1)", [f.a])).rows,
            ).includes(submitted.record),
            false,
          );
          for (const deniedTable of [
            "time_field_values",
            "time_field_requests",
          ])
            await reject(
              () => db.query(`select * from app_private.${deniedTable}`),
              /permission denied/,
            );
          for (const forbidden of [
            "gps_in",
            "gps_out",
            "reason",
            "notes",
            "created_by",
            "updated_by",
            "private",
            "hourly_rate",
            "user_id",
          ])
            assert.equal(
              JSON.stringify(await team()).includes(forbidden),
              false,
              forbidden,
            );
          await f.as(f.owner);
          assert.equal((await status()).can_submit, false);
          assert.equal(
            (
              await db.query(
                "select * from record_history($1,'time_field_proposals',$2)",
                [f.a, submitted.record],
              )
            ).rows.length,
            1,
          );
        }),
    );
    await t.test(
      "voiding or reassignment cancels pending proposals and retains evidence without leaking the prior worker's reason",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          const proposal = await submit();
          await db.exec("reset role");
          await db.query(
            "update time_entries set worker_id=$2,version=version+1 where id=$1",
            [entries.closed, foreman.id],
          );
          assert.equal(
            (await fieldRow("time_field_proposals", proposal.record)).status,
            "ANULADA",
          );
          for (const who of [f.worker.user, foreman.user]) {
            await f.as(who);
            assert.equal(
              (
                await db.query(
                  "select * from time_field_proposals where id=$1",
                  [proposal.record],
                )
              ).rows.length,
              0,
            );
            assert.equal(
              (
                await db.query(
                  "select * from record_history($1,'time_field_proposals',$2)",
                  [f.a, proposal.record],
                )
              ).rows.length,
              0,
            );
          }
          await f.as(f.owner);
          assert.equal(
            (
              await db.query(
                "select * from record_history($1,'time_field_proposals',$2)",
                [f.a, proposal.record],
              )
            ).rows.length,
            2,
          );
          await f.as(f.worker.user);
          const declaration = await submit("DECLARE", entries.open, 1, {
            end_hour: "11:00",
          });
          await db.exec("reset role");
          await db.query(
            "update time_entries set status='ANULADO',version=version+1 where id=$1",
            [entries.open],
          );
          assert.equal(
            (await fieldRow("time_field_declarations", declaration.record))
              .status,
            "ANULADA",
          );
          await denied(
            f.worker.user,
            () => submit("DECLARE", entries.open, 3, { end_hour: "12:00" }),
            /entry_unavailable/,
          );
        }),
    );
    await t.test(
      "forged effective minutes and direct public/private mutations cannot select an override",
      () =>
        tx(async () => {
          await db.exec("reset role");
          await db.query("update time_entries set ends_at=null where id=$1", [
            entries.open,
          ]);
          await f.as(f.worker.user);
          await submit("DECLARE", entries.open, 1, { end_hour: "11:00" });
          await db.exec("reset role");
          await db.query(
            "update time_entries set minutes=999,version=version+1 where id=$1",
            [entries.open],
          );
          assert.equal((await row(entries.open)).minutes, 0);
          await f.as(f.worker.user);
          await reject(
            () =>
              db.query("update time_field_declarations set status='APROBADA'"),
            /permission denied/,
          );
          await reject(
            () =>
              db.query("select app_private.field_time_pending($1,$2)", [
                f.a,
                entries.open,
              ]),
            /permission denied/,
          );
          await reject(
            () =>
              db.query(
                "update app_private.time_field_values set effective_minutes=999",
              ),
            /permission denied/,
          );
        }),
    );
    await t.test(
      "a project-only edit cannot recalculate unpaid Field minutes from declared clock endpoints",
      () =>
        tx(async () => {
          await db.exec("reset role");
          await db.query("update time_entries set ends_at=null where id=$1", [
            entries.open,
          ]);
          await f.as(f.worker.user);
          await submit("DECLARE", entries.open, 1, { end_hour: "11:00" });
          await db.exec("reset role");
          await db.query(
            "update time_entries set project_id=null,version=version+1 where id=$1",
            [entries.open],
          );
          assert.equal((await row(entries.open)).minutes, 0);
          await f.as(f.owner);
          await decide(
            entries.open,
            3,
            false,
            "Synthetic declaration rejection after project edit",
          );
          const c = laborContextSchema.parse(
            (
              await db.query<{ data: unknown }>(
                "select labor_context($1) data",
                [f.a],
              )
            ).rows[0].data,
          );
          const saved = c.entries.find((e) => e.external_id === entries.open)!;
          assert.equal(saved.minutes, 0);
          assert.equal(saved.minutes_authoritative, true);
        }),
    );
    await t.test(
      "invalid hours, missing reasons, oversized payload and more than 18 hours leave all rows unchanged",
      async () => {
        for (const [kind, data, error] of [
          [
            "REQUEST",
            { end_hour: "11:00", reason: "" },
            /field_reason_required/,
          ],
          [
            "REQUEST",
            { start_hour: "25:00", reason: "Synthetic" },
            /field_hour_required/,
          ],
          [
            "REQUEST",
            { end_hour: "04:00", reason: "Synthetic" },
            /field_shift_too_long/,
          ],
          [
            "REQUEST",
            { end_hour: "11:00", reason: "x".repeat(241) },
            /field_reason_required/,
          ],
          [
            "REQUEST",
            { end_hour: "11:00", reason: "Synthetic", minutes: 999 },
            /invalid_field_time/,
          ],
          ["DECLARE", { end_hour: "11:00 PM" }, /invalid_field_hour/],
          ["DECLARE", { end_hour: "25:00" }, /invalid_field_hour/],
          ["DECLARE", { end_hour: "09:00" }, /invalid_field_hour/],
        ] as const)
          await denied(
            f.worker.user,
            () => submit(kind, entries.closed, 1, data),
            error,
          );
      },
    );
    await t.test(
      "equal-hour formal requests store zero proposals but cannot become an invalid canonical interval",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          assert.equal(
            (
              await submit("REQUEST", entries.closed, 1, {
                end_hour: "09:00",
                reason: "Synthetic zero interval",
              })
            ).proposed_minutes,
            0,
          );
          await denied(
            f.owner,
            () => decide(),
            /field_positive_interval_required/,
          );
          await f.as(foreman.user);
          assert.equal((await decide()).minutes, 55);
        }),
    );
    await t.test(
      "open formal request keeps a null canonical exit and cannot be approved by Foreman until closed",
      () =>
        tx(async () => {
          await db.exec("reset role");
          await db.query("update time_entries set ends_at=null where id=$1", [
            entries.open,
          ]);
          await f.as(f.worker.user);
          const result = await submit("REQUEST", entries.open, 1, {
            start_hour: "09:30",
            reason: "Synthetic open request",
          });
          assert.equal(result.proposed_minutes, 0);
          assert.equal(result.minutes, null);
          assert.equal((await row(entries.open)).ends_at, null);
          await denied(foreman.user, () => decide(entries.open), /shift_open/);
          await denied(
            f.owner,
            () => decide(entries.open),
            /field_positive_interval_required/,
          );
        }),
    );
    await t.test(
      "requested endpoints retain canonical overlap, break and closed-week safeguards",
      () =>
        tx(async () => {
          await f.as(f.worker.user);
          await submit("REQUEST", entries.closed, 1, {
            end_hour: "09:01",
            reason: "Synthetic short interval",
          });
          await denied(f.owner, () => decide(), /field_break_conflict/);
          await f.as(f.worker.user);
          await submit("REQUEST", entries.closed, 2, {
            end_hour: "11:00",
            reason: "Synthetic replacement",
          });
          await db.exec("reset role");
          await db.query(
            "insert into time_entries(id,company_id,worker_id,starts_at,ends_at,source,created_by,updated_by) values($1,$2,$3,'2026-10-05T14:30:00Z','2026-10-05T15:30:00Z','MANUAL',$4,$4)",
            [randomUUID(), f.a, f.worker.id, f.owner],
          );
          await denied(
            f.owner,
            () => decide(entries.closed, 3),
            /time_overlap/,
          );
          await denied(
            f.worker.user,
            () => submit("DECLARE", entries.closed, 3, { end_hour: "11:00" }),
            /time_overlap/,
          );
        }),
    );
    await t.test(
      "REQUEST and DECLARE match NY AM/PM, DST repeated hours and elapsed 86400-second overnight arithmetic",
      () =>
        tx(async () => {
          await db.exec("reset role");
          const cases = [
            ["2026-10-05", "12:00 AM", "2026-10-05T04:00:00.000Z"],
            ["2026-10-05", "12:00 PM", "2026-10-05T16:00:00.000Z"],
            ["2026-10-05", "9:15pm", "2026-10-06T01:15:00.000Z"],
            ["2026-11-01", "01:30", "2026-11-01T05:30:00.000Z"],
            ["2026-03-08", "02:30", "2026-03-08T07:30:00.000Z"],
          ];
          for (const [day, hour, expected] of cases)
            assert.equal(
              (
                await db.query<{ at: Date }>(
                  "select app_private.field_time_at($1,$2,'America/New_York') at",
                  [day, hour],
                )
              ).rows[0].at.toISOString(),
              expected,
            );
          const id = randomUUID();
          await db.query(
            "insert into time_entries(id,company_id,worker_id,starts_at,source,created_by,updated_by) values($1,$2,$3,'2026-10-31T23:00:00Z','MANUAL',$4,$4)",
            [id, f.a, f.worker.id, f.owner],
          );
          await f.as(f.worker.user);
          const result = await submit("DECLARE", id, 1, { end_hour: "02:30" });
          assert.equal(result.proposed_minutes, 450);
          assert.equal((await row(id)).ends_at, "2026-11-01T06:30:00.000Z");
        }),
    );
    await t.test(
      "retiming a Campo clock retains its origin and GPS but uses reviewed gross Field minutes",
      () =>
        tx(async () => {
          const id = randomUUID();
          await db.exec("reset role");
          await db.query(
            "insert into time_entries(id,company_id,worker_id,starts_at,ends_at,source,minute_rule,gps_in,gps_out,created_by,updated_by) values($1,$2,$3,'2026-10-08T16:00:00Z','2026-10-08T16:00:30Z','RELOJ','CAMPO_CLOCK_V1',$4,$4,$5,$5)",
            [
              id,
              f.a,
              f.worker.id,
              JSON.stringify({
                lat: 25.7,
                lng: -80.2,
                acc: 10,
                ts: 1791475200000,
              }),
              f.owner,
            ],
          );
          const before = await row(id);
          assert.equal(before.minutes, 1);
          await f.as(f.worker.user);
          await submit("REQUEST", id, 1, {
            end_hour: "13:00",
            reason: "Synthetic clock request",
          });
          await f.as(f.owner);
          assert.equal((await decide(id)).minutes, 60);
          const saved = await row(id);
          assert.equal(saved.source, "RELOJ");
          assert.equal(saved.minute_rule, "LEGACY_FLOOR_V1");
          assert.deepEqual(saved.gps_in, before.gps_in);
          assert.deepEqual(saved.gps_out, before.gps_out);
          await db.exec("reset role");
          await db.query(
            "update time_entries set notes='Synthetic audit note',version=version+1 where id=$1",
            [id],
          );
          assert.equal((await row(id)).minutes, 60);
        }),
    );
  } finally {
    await db.close();
  }
});

test("Field form contracts preserve input validation and legacy Labor inference while respecting explicit effective zero", () => {
  const identity = { request: randomUUID(), entry: randomUUID(), version: "1" };
  assert.equal(
    fieldTimeFormSchema.safeParse({
      ...identity,
      kind: "REQUEST",
      reason: "",
      end_hour: "11:00",
    }).success,
    false,
  );
  assert.equal(
    fieldTimeFormSchema.safeParse({
      ...identity,
      kind: "REQUEST",
      reason: "Synthetic",
      end_hour: "11:00",
    }).success,
    true,
  );
  assert.equal(
    fieldTimeFormSchema.safeParse({
      ...identity,
      kind: "DECLARE",
      reason: "",
      end_hour: "11:00 PM",
    }).success,
    false,
  );
  assert.equal(
    fieldTimeReviewFormSchema.safeParse({
      ...identity,
      decision: "reject",
      note: "",
    }).success,
    false,
  );
  assert.match(
    fieldTimeError({ message: "field_review_pending" }),
    /propuesta de Campo/,
  );
  const entry = {
    external_id: "synthetic",
    worker_id: "worker",
    project_external_id: "project",
    clock_in: 1791291600,
    clock_out: 1791295200,
    minutes: 0,
    status: "closed",
    review_status: "OK",
    req_status: "",
  };
  const base = {
    entries: [entry],
    projects: { project: { mode: "day" as const } },
    rates: { worker: [{ from: "2026-01-01", cents: 25000 }] },
    adjustments: {},
  };
  assert.equal(previewLabor(base).knownCostCents, 25000);
  assert.equal(
    previewLabor({
      ...base,
      entries: [{ ...entry, minutes_authoritative: true }],
    }).knownCostCents,
    0,
  );
});
