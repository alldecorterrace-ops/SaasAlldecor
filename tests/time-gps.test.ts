import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import {
  freshPosition,
  getPunchGPS,
  GPSFailure,
  normalizePunchGPS,
  punchPositionOptions,
} from "../src/lib/time-gps";

const now = 2000000000000;
const good = { lat: 25.75, lng: -80.3, acc: 18.5, gps_ts: now };
const cases: [string, unknown, boolean][] = [
  ["current", good, true],
  ["accuracy 100", { ...good, acc: 100 }, true],
  ["accuracy too poor", { ...good, acc: 100.001 }, false],
  ["accuracy zero", { ...good, acc: 0 }, false],
  ["accuracy negative", { ...good, acc: -1 }, false],
  ["accuracy NaN", { ...good, acc: "NaN" }, false],
  ["accuracy boolean", { ...good, acc: true }, false],
  ["accuracy null", { ...good, acc: null }, false],
  [
    "numeric strings",
    { lat: " 25.75 ", lng: "-80.3", acc: "1e2", gps_ts: String(now) },
    true,
  ],
  ["numeric string suffix", { ...good, lat: "25m" }, false],
  ["empty latitude", { ...good, lat: "" }, false],
  ["missing coordinate", { lng: good.lng, acc: good.acc, gps_ts: now }, false],
  ["latitude edge", { ...good, lat: 90 }, true],
  ["latitude outside", { ...good, lat: 90.001 }, false],
  ["longitude edge", { ...good, lng: -180 }, true],
  ["longitude outside", { ...good, lng: -180.001 }, false],
  ["near zero pair", { ...good, lat: 0.000099, lng: -0.000099 }, false],
  ["zero pair boundary", { ...good, lat: 0.0001, lng: 0 }, true],
  ["equator permitted", { ...good, lat: 0 }, true],
  ["prime meridian permitted", { ...good, lng: 0 }, true],
  ["60 seconds old", { ...good, gps_ts: now - 60000 }, true],
  ["expired", { ...good, gps_ts: now - 60001 }, false],
  ["10 seconds future", { ...good, gps_ts: now + 10000 }, true],
  ["too far future", { ...good, gps_ts: now + 10001 }, false],
  ["missing timestamp", { lat: good.lat, lng: good.lng, acc: 10 }, false],
  ["timestamp null", { ...good, gps_ts: null }, false],
  ["timestamp infinity", { ...good, gps_ts: "Infinity" }, false],
  ["coordinates overflow", { ...good, lat: "1e999" }, false],
  ["accuracy underflow", { ...good, acc: "1e-999" }, false],
  ["not an object", [], false],
  ["null object", null, false],
];
function position(timestamp = now, accuracy = 18.5): GeolocationPosition {
  return {
    coords: {
      latitude: good.lat,
      longitude: good.lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp,
    toJSON: () => ({}),
  };
}

test("browser GPS rejects stale cached samples and requests fresh precise positions", async (t) => {
  for (const [label, value, allowed] of cases)
    await t.test(label, () =>
      assert.equal(Boolean(normalizePunchGPS(value, now)), allowed),
    );
  assert.equal(freshPosition(position(now - 1001), now, now), null);
  assert.ok(freshPosition(position(now - 1000), now, now));
  assert.equal(freshPosition(position(now, 0.25), now, now)?.acc, 1);
  let calls = 0;
  const source: Pick<Geolocation, "getCurrentPosition"> = {
    getCurrentPosition(success, _error, options) {
      calls++;
      assert.deepEqual(options, punchPositionOptions);
      success(position(now, calls === 1 ? 101 : 25));
    },
  };
  assert.equal((await getPunchGPS(source, () => now)).acc, 25);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    getPunchGPS(
      {
        getCurrentPosition(_success, error) {
          calls++;
          error?.({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        },
      },
      () => now,
    ),
    (error: unknown) => error instanceof GPSFailure && error.code === 1,
  );
  assert.equal(calls, 1);
});

test("database clock enforces GPS on IN/OUT, old RPC and retries without exposing another worker", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    other = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const worker = randomUUID(),
    otherWorker = randomUUID(),
    customer = randomUUID(),
    initialProject = randomUUID();
  let project: string = initialProject,
    unassigned: string = randomUUID();
  const entry = randomUUID();
  async function as(user: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec(`set role ${role}`);
  }
  async function punch(
    id = entry,
    action = "IN",
    gps: unknown = good,
    target: string | null = project,
    tenant = company,
  ) {
    const timestamp = (
      await db.query<{ ms: number }>(
        "select floor(extract(epoch from clock_timestamp()))::float8*1000 as ms",
      )
    ).rows[0].ms;
    const data = gps === good ? { ...good, gps_ts: timestamp } : gps;
    return db.query("select public.punch_time($1,$2,$3,$4,$5::jsonb)", [
      tenant,
      id,
      action,
      target,
      JSON.stringify(data),
    ]);
  }
  try {
    await t.test(
      "same pure guard boundaries as the browser and ADT, including malformed values",
      async () => {
        for (const [label, value, allowed] of cases) {
          if (allowed) {
            const row = (
              await db.query<{ gps: unknown }>(
                "select app_private.punch_gps($1::jsonb,$2) as gps",
                [JSON.stringify(value), now],
              )
            ).rows[0];
            assert.deepEqual(row.gps, normalizePunchGPS(value, now), label);
          } else
            await assert.rejects(
              db.query("select app_private.punch_gps($1::jsonb,$2)", [
                JSON.stringify(value),
                now,
              ]),
              /gps_required/,
              label,
            );
        }
      },
    );
    for (const user of [owner, staff, other])
      await db.query("insert into auth.users values($1,$2,now())", [
        user,
        `${user}@saasalldecor.invalid`,
      ]);
    await as(owner);
    for (const tenant of [company, foreign])
      await db.query(
        "select public.create_company($1,'Synthetic GPS company')",
        [tenant],
      );
    await db.exec("reset role");
    for (const user of [staff, other])
      await db.query(
        "insert into public.memberships(company_id,user_id,email,role,permissions) values($1,$2,$3,'member',$4)",
        [
          company,
          user,
          `${user}@saasalldecor.invalid`,
          JSON.stringify({ horasfix: ["write"] }),
        ],
      );
    await as(owner);
    await db.query("select public.save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "Synthetic GPS customer",
        email: "",
        status: "active",
      }),
    ]);
    for (const index of [0, 1]) {
      const estimate = randomUUID();
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
            { ...emptyItem, name: "Synthetic GPS", unit_price: "100.00" },
          ],
        }),
      ]);
      await db.query(
        "select public.approve_estimate($1,$2,1,'2026-10-05','Synthetic GPS project','Synthetic test')",
        [company, estimate],
      );
      const generated = (
        await db.query<{ id: string }>(
          "select id from public.projects where company_id=$1 and estimate_id=$2",
          [company, estimate],
        )
      ).rows[0].id;
      if (index === 0) project = generated;
      else unassigned = generated;
    }
    for (const [id, user] of [
      [worker, staff],
      [otherWorker, other],
    ]) {
      await db.query("select public.save_worker($1,$2,0,$3)", [
        company,
        id,
        JSON.stringify({
          name: "Synthetic GPS worker",
          hourly_rate: 0,
          weekly_target: 40,
          active: true,
        }),
      ]);
      await db.exec("reset role");
      await db.query("update public.workers set user_id=$1 where id=$2", [
        user,
        id,
      ]);
      await as(owner);
      await db.query(
        "select public.configure_workforce($1,$2,$3,0,'WORKER',null,true,'Synthetic GPS setup')",
        [company, randomUUID(), id],
      );
    }
    await db.query(
      "select public.save_workforce_assignment($1,$2,$3,0,$4,$5,now()-interval '1 day',null,true,'Synthetic GPS assignment')",
      [company, randomUUID(), randomUUID(), worker, project],
    );
    await as(staff);
    await t.test(
      "own assigned project without general project access; no new permissions",
      async () => {
        const scope = (
          await db.query<{ value: { projects: { id: string }[] } }>(
            "select public.workforce_scope($1) as value",
            [company],
          )
        ).rows[0].value;
        assert.deepEqual(
          scope.projects.map((p) => p.id),
          [project],
        );
        assert.equal(
          (await db.query("select * from public.projects")).rows.length,
          0,
        );
        await assert.rejects(
          punch(entry, "IN", good, unassigned),
          /project_unavailable/,
        );
        await assert.rejects(
          punch(entry, "IN", good, null),
          /project_unavailable/,
        );
        await assert.rejects(
          punch(entry, "IN", good, project, foreign),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "missing, expired and inaccurate GPS create no entry or audit",
      async () => {
        const before = (
          await db.query("select count(*) as n from public.time_entries")
        ).rows[0];
        await assert.rejects(
          db.query("select public.punch_time($1,$2,'IN',$3)", [
            company,
            entry,
            project,
          ]),
          /gps_required/,
        );
        for (const bad of [
          null,
          {},
          { ...good, gps_ts: 1 },
          { ...good, acc: 101 },
          { ...good, acc: false },
        ])
          await assert.rejects(punch(entry, "IN", bad), /gps_required/);
        assert.deepEqual(
          (await db.query("select count(*) as n from public.time_entries"))
            .rows[0],
          before,
        );
      },
    );
    await t.test(
      "fresh IN, exact retry and no duplicate open shift",
      async () => {
        await punch();
        await punch();
        await assert.rejects(
          punch(entry, "IN", good, unassigned),
          /request_conflict/,
        );
        await assert.rejects(punch(randomUUID()), /time_overlap/);
        const row = (
          await db.query<{
            gps_in: { acc: number };
            gps_out: null;
            ends_at: null;
            version: number;
          }>(
            "select gps_in,gps_out,ends_at,version from public.time_entries where id=$1",
            [entry],
          )
        ).rows[0];
        assert.equal(row.gps_in.acc, 19);
        assert.equal(row.gps_out, null);
        assert.equal(row.ends_at, null);
        assert.equal(row.version, 1);
      },
    );
    await t.test(
      "OUT requires its own current GPS; forged/old signature cannot close",
      async () => {
        const before = (
          await db.query(
            "select to_jsonb(t) as data from public.time_entries t where id=$1",
            [entry],
          )
        ).rows[0];
        await assert.rejects(
          db.query("select public.punch_time($1,$2,'OUT')", [company, entry]),
          /gps_required/,
        );
        await assert.rejects(
          punch(entry, "OUT", { ...good, acc: 101 }),
          /gps_required/,
        );
        assert.deepEqual(
          (
            await db.query(
              "select to_jsonb(t) as data from public.time_entries t where id=$1",
              [entry],
            )
          ).rows[0],
          before,
        );
        await as(other);
        assert.equal(
          (
            await db.query("select * from public.time_entries where id=$1", [
              entry,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.record_history($1,'time_entries',$2)",
              [company, entry],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(punch(entry, "OUT"), /entry_unavailable/);
        await as(staff);
        await punch(entry, "OUT");
        const saved = (
          await db.query(
            "select to_jsonb(t) as data from public.time_entries t where id=$1",
            [entry],
          )
        ).rows[0];
        await punch(entry, "OUT");
        assert.deepEqual(
          (
            await db.query(
              "select to_jsonb(t) as data from public.time_entries t where id=$1",
              [entry],
            )
          ).rows[0],
          saved,
        );
        await db.exec("reset role");
        const audit = (
          await db.query<{ n: number }>(
            "select count(*)::int as n from public.audit_events where entity='time_entries' and entity_id=$1",
            [entry],
          )
        ).rows[0];
        assert.equal(audit.n, 2);
        await as("", "anon");
        await assert.rejects(punch(entry, "OUT"), /permission denied/);
      },
    );
    await t.test(
      "administrative corrections preserve both GPS samples and cannot expose them by reassigning the worker",
      async () => {
        await as(owner);
        const old = (
          await db.query<{ data: Record<string, unknown> }>(
            "select to_jsonb(t) as data from public.time_entries t where id=$1",
            [entry],
          )
        ).rows[0].data;
        const payload = {
          worker_id: worker,
          project_id: project,
          starts_at: old.starts_at,
          ends_at: old.ends_at,
          break_minutes: 0,
          status: "APROBADO",
          notes: "Synthetic clock review",
          reason: "Synthetic correction review",
          gps_in: { lat: 1, lng: 2, acc: 3, gps_ts: 4 },
        };
        await assert.rejects(
          db.query("select public.save_time_entry($1,$2,2,$3)", [
            company,
            entry,
            JSON.stringify({ ...payload, worker_id: otherWorker }),
          ]),
          /clock_worker_locked/,
        );
        await db.query("select public.save_time_entry($1,$2,2,$3)", [
          company,
          entry,
          JSON.stringify(payload),
        ]);
        const row = (
          await db.query<{ data: Record<string, unknown> }>(
            "select to_jsonb(t) as data from public.time_entries t where id=$1",
            [entry],
          )
        ).rows[0].data;
        assert.deepEqual(row.gps_in, old.gps_in);
        assert.deepEqual(row.gps_out, old.gps_out);
        assert.equal(row.version, 3);
        await db.exec("reset role");
        await assert.rejects(
          db.query("update public.time_entries set gps_in=$1 where id=$2", [
            JSON.stringify(good),
            entry,
          ]),
          /clock_gps_locked/,
        );
        await as(staff);
        const history = await db.query(
          "select * from public.record_history($1,'time_entries',$2)",
          [company, entry],
        );
        assert.equal(history.rows.length, 3);
        await as(other);
        assert.equal(
          (
            await db.query(
              "select * from public.record_history($1,'time_entries',$2)",
              [company, entry],
            )
          ).rows.length,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
