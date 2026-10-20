import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import {
  timeSummarySchema,
  timeSummaryFiltersSchema,
  timeSummaryPeriods,
  timeSummaryCsv,
  type TimeSummary,
} from "../src/lib/time-summary";
import { exportTimeSummary } from "../src/lib/time-summary-export";

test("hours consultation counts local days across shifts, projects and all pages without mutations", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    denied = randomUUID();
  const company = randomUUID(),
    foreign = randomUUID(),
    worker = randomUUID(),
    other = randomUUID(),
    inactive = randomUUID();
  const projects: string[] = [];
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const summary = async (
    from = "2026-10-01",
    to = "2026-10-05",
    project: string | null = null,
    who: string | null = null,
    page = 1,
    tenant = company,
  ) =>
    timeSummarySchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select public.time_summary($1,$2,$3,$4,$5,$6) as data",
          [tenant, from, to, project, who, page],
        )
      ).rows[0].data,
    );
  const entry = async (
    who: string,
    project: string | null,
    start: string,
    end: string | null,
    rest = 0,
    status = "PENDIENTE",
  ) => {
    await db.query(
      `insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,break_minutes,status,source,reason,created_by,updated_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,'MANUAL','Synthetic consultation test',$9,$9)`,
      [randomUUID(), company, who, project, start, end, rest, status, owner],
    );
  };
  const snapshot = async () => {
    await db.exec("reset role");
    const data = (
      await db.query(`select
      (select jsonb_agg(to_jsonb(e) order by id) from public.time_entries e) as entries,
      (select jsonb_agg(to_jsonb(w) order by id) from public.workers w) as workers,
      (select jsonb_agg(to_jsonb(a) order by id) from public.audit_events a) as audits,
      (select jsonb_agg(to_jsonb(e) order by id) from public.expenses e) as expenses,
      (select jsonb_agg(to_jsonb(p) order by id) from public.time_periods p) as periods`)
    ).rows;
    await as(owner);
    return data;
  };
  try {
    for (const user of [owner, staff, denied])
      await db.query("insert into auth.users values($1,$2,now())", [
        user,
        user + "@saasalldecor.invalid",
      ]);
    await as(owner);
    for (const tenant of [company, foreign])
      await db.query(
        "select public.create_company($1,'Synthetic hours company')",
        [tenant],
      );
    const customer = randomUUID();
    await db.query("select public.save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "Synthetic hours customer",
        email: "",
        status: "active",
      }),
    ]);
    for (const name of ["Proyecto A", "Proyecto B"]) {
      const estimate = randomUUID();
      await db.query("select public.save_estimate($1,$2,0,$3)", [
        company,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: "2026-10-01",
          valid_until: null,
          status: "BORRADOR",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [
            {
              ...emptyItem,
              name: "Synthetic hours item",
              unit_price: "100.00",
            },
          ],
        }),
      ]);
      await db.query(
        "select public.approve_estimate($1,$2,1,'2026-10-01',$3,'Synthetic hours project')",
        [company, estimate, name],
      );
      projects.push(
        (
          await db.query<{ id: string }>(
            "select id from public.projects where company_id=$1 and estimate_id=$2",
            [company, estimate],
          )
        ).rows[0].id,
      );
    }
    for (const [id, name, active] of [
      [worker, "Trabajador A", true],
      [other, "Trabajador B", true],
      [inactive, "Trabajador inactivo", false],
    ] as const)
      await db.query("select public.save_worker($1,$2,0,$3)", [
        company,
        id,
        JSON.stringify({ name, active, hourly_rate: 0, weekly_target: 40 }),
      ]);
    await db.exec("reset role");
    await db.query(
      "insert into public.memberships(company_id,user_id,email,role,permissions) values($1,$2,$3,'member',$4)",
      [
        company,
        staff,
        staff + "@saasalldecor.invalid",
        JSON.stringify({ horasfix: ["read"] }),
      ],
    );
    await db.query(
      "insert into public.memberships(company_id,user_id,email,role,permissions) values($1,$2,$3,'member','{}')",
      [company, denied, denied + "@saasalldecor.invalid"],
    );
    await db.query("update public.workers set user_id=$1 where id=$2", [
      staff,
      worker,
    ]);
    // Two turns, two projects on one date, a second date with no project, and an overnight turn.
    await entry(
      worker,
      projects[0],
      "2026-10-01T13:00:00Z",
      "2026-10-01T15:00:00Z",
      30,
    );
    await entry(
      worker,
      projects[0],
      "2026-10-01T16:00:00Z",
      "2026-10-01T17:00:00Z",
    );
    await entry(
      worker,
      projects[1],
      "2026-10-01T18:00:00Z",
      "2026-10-01T19:00:00Z",
    );
    await entry(worker, null, "2026-10-02T13:00:00Z", "2026-10-02T14:00:00Z");
    await entry(
      worker,
      projects[0],
      "2026-10-06T03:00:00Z",
      "2026-10-06T05:00:00Z",
    );
    await entry(
      worker,
      projects[1],
      "2026-10-03T13:00:00Z",
      "2026-10-03T14:00:00Z",
      60,
    ); // Zero net minutes.
    await entry(
      worker,
      projects[1],
      "2026-10-04T13:00:00Z",
      "2026-10-04T14:00:00Z",
      0,
      "ANULADO",
    );
    await entry(
      other,
      projects[0],
      "2026-10-01T13:00:00Z",
      "2026-10-01T14:00:00Z",
      0,
      "APROBADO",
    );
    await entry(
      other,
      projects[0],
      "2026-10-02T13:00:00Z",
      "2026-10-02T14:00:00Z",
    );
    await entry(
      inactive,
      projects[0],
      "2026-10-02T13:00:00Z",
      "2026-10-02T14:00:00Z",
    );
    await as(owner);
    const before = await snapshot();
    await t.test(
      "net minutes, repeated turns, overnight attribution and separate day counts",
      async () => {
        const report = await summary();
        assert.deepEqual(report.totals, {
          days: 5,
          seconds: 30600,
          workers: 2,
          open: 0,
        });
        const a = report.rows.find((r) => r.id === worker)!;
        assert.equal(a.days, 3);
        assert.equal(a.seconds, 23400);
        assert.deepEqual(
          a.projects.map((p) => [p.name, p.days, p.seconds]),
          [
            ["Proyecto A", 2, 16200],
            ["Proyecto B", 1, 3600],
            ["Sin obra", 1, 3600],
          ],
        );
        assert.deepEqual(
          report.projects.map((p) => [
            p.name,
            p.days,
            p.worker_days,
            p.workers,
            p.seconds,
          ]),
          [
            ["Proyecto A", 3, 4, 2, 23400],
            ["Proyecto B", 1, 1, 1, 3600],
            ["Sin obra", 1, 1, 1, 3600],
          ],
        );
        assert.equal(
          a.daily.find((d) => d.date === "2026-10-05")?.seconds,
          7200,
        );
        assert.equal(
          a.daily.find((d) => d.date === "2026-10-06"),
          undefined,
        );
        if (process.env.TIME_SUMMARY_REFERENCE_OUTPUT)
          await writeFile(
            process.env.TIME_SUMMARY_REFERENCE_OUTPUT,
            JSON.stringify(report, null, 2),
          );
      },
    );
    await t.test(
      "project/worker filters preserve full selector options; unassigned is selectable",
      async () => {
        const p = await summary(undefined, undefined, "Proyecto B");
        assert.deepEqual(p.totals, {
          days: 1,
          seconds: 3600,
          workers: 1,
          open: 0,
        });
        assert.equal(p.options.projects.length, 3);
        assert.equal(p.options.workers.length, 2);
        assert.equal(
          (await summary(undefined, undefined, null, worker)).totals.days,
          3,
        );
        assert.equal(
          (await summary(undefined, undefined, "Sin obra")).projects[0].name,
          "Sin obra",
        );
        assert.equal(
          (await summary(undefined, undefined, randomUUID())).count,
          0,
        );
        assert.equal((await summary("2026-10-03", "2026-10-04")).count, 0);
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "module and tenant guard, own worker, revoked/inactive and anonymous access",
      async () => {
        await as(staff);
        const mine = await summary();
        assert.equal(mine.count, 1);
        assert.equal(mine.rows[0].id, worker);
        assert.equal(mine.options.workers.length, 1);
        assert.equal(
          (await summary(undefined, undefined, null, other)).count,
          0,
        );
        await assert.rejects(
          summary(undefined, undefined, null, null, 1, foreign),
          /permission_denied/,
        );
        await as(denied);
        await assert.rejects(summary(), /permission_denied/);
        await db.exec("reset role");
        await db.query("update public.workers set active=false where id=$1", [
          worker,
        ]);
        await as(staff);
        assert.equal((await summary()).count, 0);
        await db.exec("reset role");
        await db.query("update public.workers set active=true where id=$1", [
          worker,
        ]);
        await db.exec("set role anon");
        await assert.rejects(summary(), /permission denied/i);
        await as(owner);
      },
    );
    await t.test(
      "range bounds, 62-day limit and exact ADT DST elapsed guard",
      async () => {
        for (const [from, to] of [
          ["2026-10-05", "2026-10-01"],
          ["2026-01-01", "2026-03-04"],
          ["2026-10-01", "2026-12-01"],
        ])
          await assert.rejects(
            summary(from, to),
            /invalid_time_range|time_range_too_long/,
          );
        assert.equal(
          (await summary("2026-01-01", "2026-03-03")).dates.length,
          62,
        );
        assert.equal(
          (await summary("2026-10-01", "2026-11-30")).dates.length,
          62,
        ); // 61 dates + fallback hour: ADT displays an extra empty date.
        assert.equal(
          (await summary("2026-03-01", "2026-05-01")).dates.length,
          62,
        );
        await assert.rejects(
          db.query("select public.time_summary($1,null,'2026-10-05')", [
            company,
          ]),
          /invalid_time_range/,
        );
      },
    );
    await t.test(
      "same-name projects and the last fractional second of a local date follow ADT",
      async () => {
        await db.exec("begin; reset role");
        try {
          await db.query(
            "update public.projects set name='Proyecto A' where id=$1",
            [projects[1]],
          );
          await entry(
            worker,
            projects[0],
            "2026-10-05T03:59:59.999Z",
            "2026-10-05T04:01:59.999Z",
          );
          await as(owner);
          const merged = await summary(
            undefined,
            undefined,
            "Proyecto A",
            worker,
          );
          assert.equal(merged.projects.length, 1);
          assert.equal(merged.totals.seconds, 19920);
          assert.equal(merged.totals.days, 3);
          const last = await summary("2026-10-04", "2026-10-04", null, worker);
          assert.equal(last.totals.days, 1);
          assert.equal(last.totals.seconds, 120);
          assert.equal(
            (await summary("2026-10-05", "2026-10-05", null, worker)).totals
              .seconds,
            7200,
          );
        } finally {
          await db.exec("rollback");
          await as(owner);
        }
      },
    );
    await t.test(
      "full totals and CSV are independent of the 20-worker page",
      async () => {
        await db.exec("reset role");
        for (let i = 0; i < 21; i++) {
          const id = randomUUID();
          await db.query(
            "insert into public.workers(id,company_id,name,created_by,updated_by) values($1,$2,$3,$4,$4)",
            [id, company, "Extra " + String(i).padStart(2, "0"), owner],
          );
          await entry(
            id,
            projects[0],
            "2026-10-01T13:00:00Z",
            "2026-10-01T14:00:00Z",
          );
        }
        await as(owner);
        const first = await summary(),
          second = await summary(undefined, undefined, null, null, 2);
        assert.equal(first.rows.length, 20);
        assert.equal(second.rows.length, 3);
        assert.equal(first.count, 23);
        assert.equal(first.totals.days, 26);
        assert.deepEqual(first.totals, second.totals);
        assert.deepEqual(first.projects, second.projects);
        assert.equal(timeSummaryCsv(first), timeSummaryCsv(second));
        assert.equal(
          (await summary(undefined, undefined, null, null, 100000)).page,
          2,
        );
      },
    );
    await t.test(
      "open shift uses server elapsed seconds and no saved mutation or break deduction",
      async () => {
        const today = (
          await db.query<{ day: string }>(
            "select to_char(now() at time zone 'America/New_York','YYYY-MM-DD') as day",
          )
        ).rows[0].day;
        const closed = await summary(today, today, null, worker);
        await db.exec("reset role");
        await db.query(
          `insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,break_minutes,status,source,reason,created_by,updated_by)
        values($1,$2,$3,$4,now()-interval '2 hours',60,'PENDIENTE','RELOJ','Synthetic open consultation',$5,$5)`,
          [randomUUID(), company, worker, projects[0], owner],
        );
        await as(owner);
        const currentBefore = await snapshot();
        const report = await summary(today, today, null, worker);
        assert.equal(report.totals.open, 1);
        assert.ok(report.totals.seconds - closed.totals.seconds >= 7200);
        assert.ok(report.totals.seconds - closed.totals.seconds < 7205);
        assert.deepEqual(await snapshot(), currentBefore);
      },
    );
  } finally {
    await db.close();
  }
});

test("company timezone presets, date validation and safe CSV/API export", async () => {
  const periods = timeSummaryPeriods(
    "America/New_York",
    new Date("2026-10-05T02:00:00Z"),
  ); // Still Sunday.
  assert.deepEqual(periods[0], {
    label: "Esta semana",
    from: "2026-09-28",
    to: "2026-10-04",
  });
  assert.deepEqual(periods[1], {
    label: "Semana pasada",
    from: "2026-09-21",
    to: "2026-09-27",
  });
  assert.deepEqual(periods[2], {
    label: "14 días",
    from: "2026-09-20",
    to: "2026-10-04",
  });
  assert.equal(
    timeSummaryFiltersSchema.safeParse({ from: "2026-02-30", to: "2026-03-01" })
      .success,
    false,
  );
  assert.equal(
    timeSummaryFiltersSchema.safeParse({ from: "2026-10-05", to: "2026-10-01" })
      .success,
    false,
  );
  const company = randomUUID();
  const report: TimeSummary = {
    company,
    from: "2026-10-01",
    to: "2026-10-05",
    timezone: "America/New_York",
    dates: [],
    count: 0,
    page: 1,
    options: { projects: [], workers: [] },
    rows: [],
    totals: { days: 1, seconds: 3600, workers: 1, open: 0 },
    projects: [
      {
        id: randomUUID(),
        name: ' =HYPERLINK("unsafe")\n,proyecto',
        days: 1,
        worker_days: 1,
        workers: 1,
        seconds: 3600,
      },
    ],
  };
  assert.match(
    timeSummaryCsv(report),
    /"' =HYPERLINK\(""unsafe""\)\n,proyecto"/,
  );
  assert.ok(timeSummaryCsv(report).startsWith("\uFEFF"));
  let calls = 0;
  const fake =
    (
      user = true,
      error: { code: string } | null = null,
      data: unknown = report,
    ) =>
    async () =>
      ({
        auth: {
          getUser: async () => ({
            data: { user: user ? { id: randomUUID() } : null },
            error: null,
          }),
        },
        rpc: async () => {
          calls++;
          return { data, error };
        },
      }) as unknown as SupabaseClient;
  const filters = { from: report.from, to: report.to };
  assert.equal(
    (await exportTimeSummary("invalid", filters, fake())).status,
    404,
  );
  assert.equal(
    (await exportTimeSummary(company, filters, fake(false))).status,
    401,
  );
  assert.equal(
    (await exportTimeSummary(company, { ...filters, worker: "bad" }, fake()))
      .status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await exportTimeSummary(company, filters, fake(true, { code: "42501" })))
      .status,
    403,
  );
  assert.equal(
    (await exportTimeSummary(company, filters, fake(true, { code: "22023" })))
      .status,
    400,
  );
  assert.equal(
    (
      await exportTimeSummary(
        company,
        filters,
        fake(true, null, { ...report, company: randomUUID() }),
      )
    ).status,
    503,
  );
  const ok = await exportTimeSummary(company, filters, fake());
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("Cache-Control")!, /no-store/);
  assert.match(ok.headers.get("Content-Disposition")!, /resumen-dias.csv/);
  assert.deepEqual(
    Buffer.from(await ok.arrayBuffer()),
    Buffer.from(timeSummaryCsv(report)),
  );
});
