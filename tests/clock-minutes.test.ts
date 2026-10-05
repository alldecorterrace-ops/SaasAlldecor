import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { timeSummarySchema, timeSummaryCsv } from "../src/lib/time-summary";

type Entry = {
  id: string;
  worker_id: string;
  project_id: string;
  starts_at: string;
  ends_at: string | null;
  break_minutes: number;
  minutes: number | null;
  minute_rule: string | null;
  status: string;
  notes: string;
  version: number;
};

test("future Campo clock minutes preserve history and manual semantics", async (t) => {
  const { db } = await fullDatabase("202610050077_workforce_time_summary.sql");
  const owner = randomUUID(),
    staff = randomUUID(),
    other = randomUUID();
  const company = randomUUID(),
    foreign = randomUUID(),
    worker = randomUUID();
  const otherWorker = randomUUID(),
    legacyOpen = randomUUID(),
    current = randomUUID();
  let project: string;
  const as = async (user: string, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role " + role);
  };
  const row = async (id: string): Promise<Entry> =>
    (
      await db.query<{ value: Entry }>(
        "select to_jsonb(e) as value from public.time_entries e where id=$1",
        [id],
      )
    ).rows[0].value;
  const snapshot = async () => {
    await db.exec("reset role");
    const tables = (
      await db.query<{ schema: string; name: string }>(
        "select table_schema as schema,table_name as name from information_schema.tables where table_type='BASE TABLE' and table_schema in ('public','app_private','auth','storage') order by table_schema,table_name",
      )
    ).rows;
    const result = [];
    for (const table of tables) {
      const identifier = [table.schema, table.name]
        .map((s) => '"' + s.replaceAll('"', '""') + '"')
        .join(".");
      const value =
        table.schema === "public" && table.name === "time_entries"
          ? "to_jsonb(x)-'minute_rule'"
          : "to_jsonb(x)";
      result.push({
        table: identifier,
        rows: (
          await db.query<{ rows: unknown[] }>(
            `select coalesce(jsonb_agg(${value} order by (${value})::text),'[]') as rows from ${identifier} x`,
          )
        ).rows[0].rows,
      });
    }
    return result;
  };
  const punch = async (id = current, action = "IN", tenant = company) => {
    const gps = (
      await db.query<{ value: object }>(
        "select jsonb_build_object('lat',25.75,'lng',-80.3,'acc',18,'gps_ts',floor(extract(epoch from clock_timestamp()))*1000) as value",
      )
    ).rows[0].value;
    return db.query("select public.punch_time($1,$2,$3,$4,$5)", [
      tenant,
      id,
      action,
      project,
      JSON.stringify(gps),
    ]);
  };
  const save = async (entry: Entry, extra: Record<string, unknown> = {}) =>
    db.query("select public.save_time_entry($1,$2,$3,$4)", [
      company,
      entry.id,
      entry.version,
      JSON.stringify({
        worker_id: entry.worker_id,
        project_id: entry.project_id,
        starts_at: entry.starts_at,
        ends_at: entry.ends_at,
        break_minutes: entry.break_minutes,
        status: entry.status,
        notes: entry.notes,
        reason: "Synthetic minute review",
        ...extra,
      }),
    ]);
  try {
    for (const user of [owner, staff, other])
      await db.query("insert into auth.users values($1,$2,now())", [
        user,
        user + "@example.test",
      ]);
    await as(owner);
    for (const tenant of [company, foreign])
      await db.query(
        "select public.create_company($1,'Synthetic clock minutes')",
        [tenant],
      );
    const customer = randomUUID(),
      estimate = randomUUID();
    await db.query("select public.save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "Synthetic clock customer",
        email: "",
        status: "active",
      }),
    ]);
    await db.query("select public.save_estimate($1,$2,0,$3)", [
      company,
      estimate,
      JSON.stringify({
        customer_id: customer,
        estimate_date: "2026-10-05",
        valid_until: null,
        status: "BORRADOR",
        notes: "",
        discount: "0",
        taxes: "0",
        items: [
          { ...emptyItem, name: "Synthetic clock", unit_price: "100.00" },
        ],
      }),
    ]);
    await db.query(
      "select public.approve_estimate($1,$2,1,'2026-10-05','Synthetic clock project','Synthetic clock setup')",
      [company, estimate],
    );
    project = (
      await db.query<{ id: string }>(
        "select id from public.projects where estimate_id=$1",
        [estimate],
      )
    ).rows[0].id;
    for (const [id, user] of [
      [worker, staff],
      [otherWorker, other],
    ]) {
      await db.query("select public.save_worker($1,$2,0,$3)", [
        company,
        id,
        JSON.stringify({
          name: "Synthetic clock worker",
          hourly_rate: 0,
          weekly_target: 40,
          active: true,
        }),
      ]);
      await db.exec("reset role");
      await db.query(
        "insert into public.memberships(company_id,user_id,email,role,permissions) values($1,$2,$3,'member',$4)",
        [
          company,
          user,
          user + "@example.test",
          JSON.stringify({ horasfix: ["write"] }),
        ],
      );
      await db.query("update public.workers set user_id=$1 where id=$2", [
        user,
        id,
      ]);
      await as(owner);
      await db.query(
        "select public.configure_workforce($1,$2,$3,0,'WORKER',null,true,'Synthetic clock setup')",
        [company, randomUUID(), id],
      );
    }
    await db.query(
      "select public.save_workforce_assignment($1,$2,$3,0,$4,$5,now()-interval '1 day',null,true,'Synthetic clock assignment')",
      [company, randomUUID(), randomUUID(), worker, project],
    );
    await db.exec("reset role");
    for (const [start, end, status, source] of [
      ["2000-01-01T12:00:00Z", "2000-01-01T12:00:35Z", "ANULADO", "RELOJ"],
      ["2000-01-02T12:00:00Z", "2000-01-02T12:01:59Z", "APROBADO", "RELOJ"],
      ["2000-01-03T12:00:00Z", "2000-01-03T12:01:59Z", "PENDIENTE", "MANUAL"],
    ])
      await db.query(
        "insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,status,source,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)",
        [
          randomUUID(),
          company,
          worker,
          project,
          start,
          end,
          status,
          source,
          owner,
        ],
      );
    await db.query(
      "insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,source,gps_in,created_by,updated_by) values($1,$2,$3,$4,clock_timestamp()-interval '70 seconds','RELOJ',$5,$6,$6)",
      [
        legacyOpen,
        company,
        worker,
        project,
        JSON.stringify({ lat: 25.75, lng: -80.3, acc: 18 }),
        staff,
      ],
    );

    await t.test(
      "migration retains every original row and audit; prior zero remains zero",
      async () => {
        const before = await snapshot();
        await db.exec(
          await readFile(
            new URL(
              "../supabase/migrations/202610050078_clock_minutes.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.deepEqual(await snapshot(), before);
        assert.deepEqual(
          (
            await db.query(
              "select minutes,minute_rule from public.time_entries order by starts_at",
            )
          ).rows,
          [
            { minutes: 0, minute_rule: null },
            { minutes: 1, minute_rule: null },
            { minutes: 1, minute_rule: null },
            { minutes: null, minute_rule: null },
          ],
        );
      },
    );

    await t.test("Campo boundaries and integer-second timestamps", async () => {
      const cases = [
        ["00:00:00", "00:00:00", 1],
        ["00:00:00", "00:00:01", 1],
        ["00:00:00", "00:00:29", 1],
        ["00:00:00", "00:00:30", 1],
        ["00:00:00", "00:00:59", 1],
        ["00:00:00", "00:01:00", 1],
        ["00:00:00", "00:01:29", 1],
        ["00:00:00", "00:01:30", 2],
        ["00:00:00", "00:01:31", 2],
        ["00:00:00", "00:01:59", 2],
        ["00:00:00", "00:02:29", 2],
        ["00:00:00", "00:02:30", 3],
        ["00:00:00", "00:59:29", 59],
        ["00:00:00", "00:59:30", 60],
        ["00:00:00", "01:00:29", 60],
        ["00:00:00", "01:00:30", 61],
        ["00:00:00", "18:00:00", 1080],
        ["00:00:00.900", "00:01:30.001", 2],
        ["00:00:00.001", "00:01:29.999", 1],
      ] as const;
      for (const [start, end, expected] of cases)
        assert.equal(
          (
            await db.query<{ value: number }>(
              "select app_private.time_entry_minutes($1,$2,0,'CAMPO_CLOCK_V1') as value",
              ["2026-10-05T" + start + "Z", "2026-10-05T" + end + "Z"],
            )
          ).rows[0].value,
          expected,
          start + " / " + end,
        );
      assert.equal(
        (
          await db.query<{ value: null }>(
            "select app_private.time_entry_minutes(now(),null,0,'CAMPO_CLOCK_V1') as value",
          )
        ).rows[0].value,
        null,
      );
    });

    await t.test(
      "prior open clock closes using its original rule",
      async () => {
        await as(staff);
        await punch(legacyOpen, "OUT");
        const closed = await row(legacyOpen);
        assert.equal(closed.minute_rule, null);
        assert.equal(closed.minutes, 1);
      },
    );

    await t.test(
      "new own IN and short OUT count one minute; exact retries do not write",
      async () => {
        await as(staff);
        await punch();
        assert.equal((await row(current)).minute_rule, "CAMPO_CLOCK_V1");
        assert.equal((await row(current)).minutes, null);
        const beforeRetry = await snapshot();
        await as(staff);
        await punch();
        assert.deepEqual(await snapshot(), beforeRetry);
        await as(staff);
        await punch(current, "OUT");
        const closed = await row(current);
        assert.equal(closed.minutes, 1);
        assert.equal(closed.version, 2);
        assert.equal(closed.minute_rule, "CAMPO_CLOCK_V1");
        const afterClose = await snapshot();
        await as(staff);
        await punch(current, "OUT");
        assert.deepEqual(await snapshot(), afterClose);
      },
    );

    await t.test(
      "personal/team summary and CSV use the same persisted clock minute",
      async () => {
        await as(staff);
        const day = (
          await db.query<{ value: string }>(
            "select to_char(now() at time zone 'America/New_York','YYYY-MM-DD') as value",
          )
        ).rows[0].value;
        const summary = async (rpc: string) =>
          timeSummarySchema.parse(
            (
              await db.query<{ value: unknown }>(
                `select public.${rpc}($1,$2,$2,null,null,1) as value`,
                [company, day],
              )
            ).rows[0].value,
          );
        const personal = await summary("time_summary"),
          team = await summary("workforce_time_summary");
        assert.equal(personal.rows[0].seconds, 120);
        assert.equal(personal.rows[0].days, 1);
        assert.equal(team.rows[0].seconds, 120);
        assert.equal(timeSummaryCsv(personal), timeSummaryCsv(team));
        await as(owner);
        const labor = (
          await db.query<{
            value: { entries: { external_id: string; minutes: number }[] };
          }>("select public.labor_context($1) as value", [company])
        ).rows[0].value;
        assert.equal(
          labor.entries.find((entry) => entry.external_id === current)?.minutes,
          1,
        );
      },
    );

    await t.test(
      "client cannot write minutes, choose a rule or call the private calculation",
      async () => {
        await as(staff);
        await assert.rejects(
          db.query("update public.time_entries set minutes=999 where id=$1", [
            current,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "select app_private.time_entry_minutes(now(),now(),0,'CAMPO_CLOCK_V1')",
          ),
          /permission denied/,
        );
        await as(other);
        assert.equal(
          (
            await db.query("select * from public.time_entries where id=$1", [
              current,
            ])
          ).rows.length,
          0,
        );
        await assert.rejects(punch(current, "OUT"), /entry_unavailable/);
        await assert.rejects(
          punch(randomUUID(), "IN", foreign),
          /permission_denied/,
        );
        await as("", "anon");
        await assert.rejects(punch(), /permission denied/);
        await db.exec("reset role");
        await assert.rejects(
          db.query(
            "update public.time_entries set minute_rule=null where id=$1",
            [current],
          ),
          /clock_minute_rule_locked/,
        );
        await db.query(
          "update public.time_entries set minutes=999 where id=$1",
          [current],
        );
        assert.equal((await row(current)).minutes, 1);
      },
    );

    await t.test(
      "notes and approval retain clock rounding; a time correction keeps existing manual semantics",
      async () => {
        await as(owner);
        const old = await row(current);
        await save(old, {
          notes: "Synthetic approval",
          status: "APROBADO",
          minutes: 999,
          minute_rule: null,
        });
        const approved = await row(current);
        assert.equal(approved.minutes, 1);
        assert.equal(approved.minute_rule, "CAMPO_CLOCK_V1");
        const start = new Date(
          Date.parse(old.starts_at) - 3600000,
        ).toISOString();
        const end = new Date(Date.parse(start) + 35000).toISOString();
        await save(approved, { starts_at: start, ends_at: end });
        const corrected = await row(current);
        assert.equal(corrected.minutes, 0);
        assert.equal(corrected.minute_rule, "LEGACY_FLOOR_V1");
        assert.equal(corrected.status, "PENDIENTE");
      },
    );

    await t.test(
      "new manual rows ignore forged rule and minutes, and keep flooring/rest",
      async () => {
        await as(owner);
        const id = randomUUID();
        await db.query("select public.save_time_entry($1,$2,0,$3)", [
          company,
          id,
          JSON.stringify({
            worker_id: worker,
            project_id: project,
            starts_at: "2000-01-04T12:00:00Z",
            ends_at: "2000-01-04T12:02:59Z",
            break_minutes: 1,
            status: "PENDIENTE",
            notes: "",
            reason: "Synthetic manual minute",
            minute_rule: "CAMPO_CLOCK_V1",
            minutes: 999,
          }),
        ]);
        assert.equal((await row(id)).minute_rule, null);
        assert.equal((await row(id)).minutes, 1);
      },
    );

    await t.test(
      "administrative closing of a new open clock uses the manual rule",
      async () => {
        const id = randomUUID();
        await as(staff);
        await punch(id);
        const open = await row(id);
        await as(owner);
        const end = (
          await db.query<{ value: string }>(
            "select clock_timestamp()::text as value",
          )
        ).rows[0].value;
        await save(open, { ends_at: end });
        const closed = await row(id);
        assert.equal(closed.minutes, 0);
        assert.equal(closed.minute_rule, "LEGACY_FLOOR_V1");
      },
    );

    await t.test(
      "approved own correction request does not inherit native clock minimum",
      async () => {
        const id = randomUUID(),
          request = randomUUID();
        await as(staff);
        await punch(id);
        await punch(id, "OUT");
        const closed = await row(id);
        const start = new Date(
          Date.parse(closed.starts_at) - 7200000,
        ).toISOString();
        const end = new Date(Date.parse(start) + 35000).toISOString();
        await db.query("select public.request_time_change($1,$2,$3,$4,$5)", [
          company,
          request,
          id,
          closed.version,
          JSON.stringify({
            starts_at: start,
            ends_at: end,
            break_minutes: 0,
            reason: "Synthetic correction request",
          }),
        ]);
        await as(owner);
        await db.query(
          "select public.decide_time_request($1,$2,1,true,'Synthetic request review')",
          [company, request],
        );
        const corrected = await row(id);
        assert.equal(corrected.minutes, 0);
        assert.equal(corrected.minute_rule, "LEGACY_FLOOR_V1");
      },
    );
  } finally {
    await db.close();
  }
});
