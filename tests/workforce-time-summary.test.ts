import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { timeSummarySchema, timeSummaryCsv } from "../src/lib/time-summary";
import { exportTimeSummary } from "../src/lib/time-summary-export";

test("team hours reuse explicit Workforce scope without expanding personal records", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const identities = Array.from({ length: 8 }, () => ({
    user: randomUUID(),
    worker: randomUUID(),
    entry: randomUUID(),
  }));
  const [
    foreman,
    worker,
    nestedForeman,
    indirect,
    office,
    outsider,
    unprofiled,
    inactive,
  ] = identities;
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const report = async (
    personal = false,
    who: string | null = null,
    tenant = company,
  ) =>
    timeSummarySchema.parse(
      (
        await db.query<{ data: unknown }>(
          `select public.${personal ? "time_summary" : "workforce_time_summary"}($1,'2026-10-01','2026-10-05',null,$2) data`,
          [tenant, who],
        )
      ).rows[0].data,
    );
  const configure = (
    id: string,
    role: string,
    supervisor: string | null = null,
  ) =>
    db.query(
      "select public.configure_workforce($1,$2,$3,0,$4,$5,true,'Synthetic team consultation')",
      [company, randomUUID(), id, role, supervisor],
    );
  const rollbackChange = async (
    change: () => Promise<unknown>,
    user: string,
    verify: () => Promise<void>,
  ) => {
    await db.exec("reset role; begin");
    try {
      await change();
      await as(user);
      await verify();
    } finally {
      await db.exec("rollback; reset role");
    }
  };
  const snapshot = async () => {
    await db.exec("reset role");
    const tables = (
      await db.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname='public' order by tablename",
      )
    ).rows;
    const result: Record<string, unknown> = {};
    for (const { tablename } of tables)
      result[tablename] = (
        await db.query(
          `select to_jsonb(t) data from public."${tablename.replaceAll('"', '""')}" t order by to_jsonb(t)::text`,
        )
      ).rows;
    return result;
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
        "select public.create_company($1,'Synthetic team hours')",
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
          JSON.stringify({ horasfix: ["read"], activity: ["read"] }),
        ],
      );
      await db.query("select public.save_worker($1,$2,0,$3)", [
        company,
        x.worker,
        JSON.stringify({
          name: "Same synthetic name",
          email: "private@example.test",
          phone: "private phone",
          hourly_rate: "12.34",
          weekly_target: 40,
          active: true,
          notes: "private employment notes",
        }),
      ]);
      await db.query("select public.link_worker_login($1,$2,1,$3)", [
        company,
        x.worker,
        x.user + "@example.test",
      ]);
    }
    await configure(foreman.worker, "FOREMAN");
    await configure(nestedForeman.worker, "FOREMAN", foreman.worker);
    await configure(worker.worker, "WORKER", foreman.worker);
    await configure(indirect.worker, "WORKER", nestedForeman.worker);
    await configure(office.worker, "OFFICE");
    await configure(outsider.worker, "WORKER");
    await configure(inactive.worker, "WORKER", foreman.worker);
    await db.exec("reset role");
    await db.query("update public.workers set active=false where id=$1", [
      inactive.worker,
    ]);
    for (const [i, x] of identities.entries()) {
      const minutes = x === worker ? 120 : 60,
        day = Math.min(5, i + 1);
      await db.query(
        `insert into public.time_entries(id,company_id,worker_id,starts_at,ends_at,break_minutes,status,source,reason,created_by,updated_by)
        values($1,$2,$3,$4::timestamptz,$4::timestamptz+($5||' minutes')::interval,$6,'APROBADO','MANUAL','private consultation reason',$7,$7)`,
        [
          x.entry,
          company,
          x.worker,
          `2026-10-${String(day).padStart(2, "0")}T13:00:00Z`,
          String(minutes),
          x === worker ? 30 : 0,
          owner,
        ],
      );
    }
    await db.query(
      `insert into public.time_entries(id,company_id,worker_id,starts_at,ends_at,status,source,reason,created_by,updated_by)
      values($1,$2,$3,'2026-10-01T13:00:00Z','2026-10-01T14:00:00Z','PENDIENTE','MANUAL','private second shift',$4,$4)`,
      [randomUUID(), company, worker.worker, owner],
    );
    const before = await snapshot();
    await t.test(
      "Foreman sees self and direct team by identity, never grandchildren or unassigned peers",
      async () => {
        await as(foreman.user);
        const team = await report();
        assert.deepEqual(
          team.rows.map((r) => r.id).sort(),
          [foreman.worker, worker.worker, nestedForeman.worker].sort(),
        );
        assert.deepEqual(team.totals, {
          days: 4,
          seconds: 16200,
          workers: 3,
          open: 0,
        });
        assert.equal(team.rows.find((r) => r.id === worker.worker)!.days, 2);
        assert.equal(
          team.rows.find((r) => r.id === worker.worker)!.seconds,
          9000,
        );
        assert.equal(team.projects[0].worker_days, 4);
        assert.equal((await report(true)).rows[0].id, foreman.worker);
        assert.equal((await report(true)).count, 1);
        for (const x of [indirect, outsider, unprofiled, inactive])
          assert.equal((await report(false, x.worker)).count, 0);
        assert.equal(team.options.workers.length, 3);
      },
    );
    await t.test(
      "Worker sees only own team report and personal report; Office sees active enabled profiles",
      async () => {
        await as(worker.user);
        assert.deepEqual(await report(), await report(true));
        assert.equal((await report(false, foreman.worker)).count, 0);
        await as(office.user);
        assert.equal((await report()).count, 6);
        assert.equal((await report()).totals.days, 7);
        assert.equal((await report(true)).count, 1);
        assert.equal((await report(false, unprofiled.worker)).count, 0);
        await as(unprofiled.user);
        assert.equal((await report()).count, 0);
        assert.equal((await report(true)).count, 1);
        await as(owner);
        assert.equal((await report()).count, 7);
        assert.deepEqual(await report(), await report(true));
      },
    );
    await t.test(
      "Aggregate report does not expose shift IDs, employment fields, detailed hours or their audit history",
      async () => {
        for (const actor of [foreman, office]) {
          await as(actor.user);
          const json = JSON.stringify(await report());
          for (const secret of [
            worker.entry,
            worker.user,
            "private employment",
            "private@example",
            "private consultation",
            "hourly_rate",
            "gps",
            "created_by",
          ])
            assert.ok(!json.includes(secret), secret);
          assert.deepEqual(
            (
              await db.query(
                "select id from public.time_entries where worker_id=$1",
                [worker.worker],
              )
            ).rows,
            [],
          );
          assert.deepEqual(
            (
              await db.query(
                "select * from public.record_history($1,'time_entries',$2)",
                [company, worker.entry],
              )
            ).rows,
            [],
          );
          const activity = (
            await db.query<{ entity_id: string }>(
              "select * from public.activity_feed($1)",
              [company],
            )
          ).rows;
          assert.ok(activity.every((r) => r.entity_id !== worker.entry));
          await assert.rejects(
            db.query(
              "select public.configure_workforce($1,$2,$3,1,'OFFICE',null,true,'Unauthorised change')",
              [company, randomUUID(), actor.worker],
            ),
            /manager_required/,
          );
          await assert.rejects(
            db.query(
              "select app_private.time_summary($1,'2026-10-01','2026-10-05',null,null,1,true)",
              [company],
            ),
            /permission denied/,
          );
        }
      },
    );
    await t.test(
      "Changing supervisor removes prior direct scope immediately; report does not grant recursive access",
      async () => {
        await rollbackChange(
          () =>
            db.query(
              "update public.workforce_profiles set supervisor_id=$1 where id=$2",
              [nestedForeman.worker, worker.worker],
            ),
          foreman.user,
          async () => {
            assert.equal((await report(false, worker.worker)).count, 0);
            assert.equal((await report()).options.workers.length, 2);
            await as(nestedForeman.user);
            assert.equal((await report(false, worker.worker)).count, 1);
          },
        );
      },
    );
    await t.test(
      "Revoked profiles, inactive workers and unlinking remove both rows and filter names",
      async () => {
        for (const [sql, values, user, count] of [
          [
            "update public.workforce_profiles set enabled=false where id=$1",
            [worker.worker],
            foreman.user,
            2,
          ],
          [
            "update public.workforce_profiles set enabled=false where id=$1",
            [foreman.worker],
            foreman.user,
            0,
          ],
          [
            "update public.workers set active=false where id=$1",
            [worker.worker],
            foreman.user,
            2,
          ],
          [
            "update public.workers set user_id=null where id=$1",
            [foreman.worker],
            foreman.user,
            0,
          ],
        ] as const)
          await rollbackChange(
            () => db.query(sql, [...values]),
            user,
            async () => {
              assert.equal((await report()).count, count);
              assert.equal((await report()).options.workers.length, count);
            },
          );
      },
    );
    await t.test(
      "Tenant/module/membership and anonymous guards remain enforced independently of workforce role",
      async () => {
        await as(foreman.user);
        await assert.rejects(report(false, null, foreign), /permission_denied/);
        await assert.rejects(
          db.query(
            "select public.workforce_time_summary($1,'2026-10-05','2026-10-01')",
            [company],
          ),
          /invalid_time_range/,
        );
        await assert.rejects(
          db.query(
            "select public.workforce_time_summary($1,'2026-01-01','2026-12-31')",
            [company],
          ),
          /time_range_too_long/,
        );
        for (const sql of [
          "update public.memberships set permissions='{}' where company_id=$1 and user_id=$2",
          "update public.memberships set active=false where company_id=$1 and user_id=$2",
        ])
          await rollbackChange(
            () => db.query(sql, [company, foreman.user]),
            foreman.user,
            async () => {
              await assert.rejects(report(), /permission_denied/);
            },
          );
        await db.exec("reset role; set role anon");
        await assert.rejects(report(), /permission denied/);
      },
    );
    await t.test(
      "Team CSV calls the scoped RPC and cannot choose another report via request filters",
      async () => {
        await as(foreman.user);
        const expected = await report();
        const calls: string[] = [];
        const connect = async () =>
          ({
            auth: {
              getUser: async () => ({
                data: { user: { id: foreman.user } },
                error: null,
              }),
            },
            rpc: async (name: string) => {
              calls.push(name);
              return { data: expected, error: null };
            },
          }) as unknown as SupabaseClient;
        const csv = await exportTimeSummary(
          company,
          {
            from: expected.from,
            to: expected.to,
            scope: "personal",
            rpc: "unsafe",
          },
          connect,
          "team",
        );
        assert.equal(csv.status, 200);
        assert.deepEqual(calls, ["workforce_time_summary"]);
        assert.match(
          csv.headers.get("Content-Disposition")!,
          /resumen-dias-equipo.csv/,
        );
        assert.match(csv.headers.get("Cache-Control")!, /no-store/);
        assert.equal(await csv.text(), timeSummaryCsv(expected).slice(1));
        const forbidden = await exportTimeSummary(
          company,
          { from: expected.from, to: expected.to },
          async () =>
            ({
              auth: {
                getUser: async () => ({
                  data: { user: { id: foreman.user } },
                  error: null,
                }),
              },
              rpc: async () => ({ data: null, error: { code: "42501" } }),
            }) as unknown as SupabaseClient,
          "team",
        );
        assert.equal(forbidden.status, 403);
      },
    );
    await t.test(
      "All public business rows are unchanged by consultations, exports and rejected writes",
      async () => {
        assert.deepEqual(await snapshot(), before);
      },
    );
  } finally {
    await db.close();
  }
});
