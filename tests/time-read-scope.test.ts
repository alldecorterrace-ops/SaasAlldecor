import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";

test("hours scope protects rows, histories and activity for real database roles", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    other = randomUUID(),
    admin = randomUUID();
  const a = randomUUID(),
    b = randomUUID();
  const ownWorker = randomUUID(),
    otherWorker = randomUUID(),
    foreignWorker = randomUUID();
  const ownEntry = randomUUID(),
    otherEntry = randomUUID(),
    foreignEntry = randomUUID();
  const ownRequest = randomUUID(),
    otherRequest = randomUUID(),
    period = randomUUID();
  async function as(user: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec(`set role ${role}`);
  }
  const ids = async (table: string) =>
    (
      await db.query<{ id: string }>(
        `select id from public.${table} order by id`,
      )
    ).rows.map((r) => r.id);
  const history = (entity: string, id: string) =>
    db.query("select * from public.record_history($1,$2,$3)", [a, entity, id]);
  const activity = () =>
    db.query<{ entity_id: string }>("select * from public.activity_feed($1)", [
      a,
    ]);
  try {
    for (const uid of [owner, staff, other, admin])
      await db.query("insert into auth.users values($1,$2,now())", [
        uid,
        `${uid}@saasalldecor.invalid`,
      ]);
    await as(owner);
    for (const company of [a, b])
      await db.query(
        "select public.create_company($1,'Synthetic hours scope')",
        [company],
      );
    await db.exec("reset role");
    for (const uid of [staff, other, admin])
      await db.query(
        "insert into public.memberships(company_id,user_id,email,role,active,permissions) values($1,$2::uuid,($2::uuid)::text||'@saasalldecor.invalid',$3,true,$4)",
        [
          a,
          uid,
          uid === admin ? "admin" : "member",
          JSON.stringify({ horasfix: ["write"], activity: ["read"] }),
        ],
      );
    await as(owner);
    for (const [company, worker, user] of [
      [a, ownWorker, staff],
      [a, otherWorker, other],
      [b, foreignWorker, staff],
    ]) {
      await db.query("select public.save_worker($1,$2,0,$3)", [
        company,
        worker,
        JSON.stringify({
          name: "Synthetic worker",
          hourly_rate: "0",
          weekly_target: "40",
          active: true,
        }),
      ]);
      await db.exec("reset role");
      await db.query("update public.workers set user_id=$1 where id=$2", [
        user,
        worker,
      ]);
      await as(owner);
    }
    for (const [company, entry, worker] of [
      [a, ownEntry, ownWorker],
      [a, otherEntry, otherWorker],
      [b, foreignEntry, foreignWorker],
    ])
      await db.query("select public.save_time_entry($1,$2,0,$3)", [
        company,
        entry,
        JSON.stringify({
          worker_id: worker,
          starts_at: "2026-09-21T14:00:00Z",
          ends_at: "2026-09-21T15:00:00Z",
          break_minutes: 0,
          status: "PENDIENTE",
          notes:
            entry === otherEntry
              ? "OTHER WORKER PRIVATE NOTE"
              : "Own synthetic note",
          reason: "Synthetic test",
        }),
      ]);
    for (const [uid, entry, request] of [
      [staff, ownEntry, ownRequest],
      [other, otherEntry, otherRequest],
    ]) {
      await as(uid);
      await db.query("select public.request_time_change($1,$2,$3,1,$4)", [
        a,
        request,
        entry,
        JSON.stringify({
          starts_at: "2026-09-21T14:00:00Z",
          ends_at: "2026-09-21T15:05:00Z",
          break_minutes: 0,
          reason: "Synthetic own correction",
        }),
      ]);
    }
    await as(owner);
    await db.exec("reset role");
    await db.query(
      "insert into public.time_periods(id,company_id,week_start,locked,reason,created_by,updated_by) values($1,$2,'2026-09-14',false,'Administrative synthetic note',$3,$3)",
      [period, a, owner],
    );

    await t.test(
      "worker reads only own rows and cannot retrieve another worker or company directly",
      async () => {
        await as(staff);
        assert.deepEqual(await ids("time_entries"), [ownEntry]);
        assert.deepEqual(await ids("time_requests"), [ownRequest]);
        assert.deepEqual(await ids("time_periods"), []);
        assert.equal(
          (
            await db.query("select * from public.time_entries where id=$1", [
              otherEntry,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query("select * from public.time_entries where id=$1", [
              foreignEntry,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select app_private.can_read_time_record($1,'time_entries',$2) as allowed",
              [b, foreignEntry],
            )
          ).rows[0].allowed,
          false,
        );
      },
    );
    await t.test(
      "history and activity apply the same scope",
      async () => {
        assert.ok((await history("time_entries", ownEntry)).rows.length);
        assert.ok((await history("time_requests", ownRequest)).rows.length);
        for (const [entity, id] of [
          ["time_entries", otherEntry],
          ["time_requests", otherRequest],
          ["time_periods", period],
        ])
          assert.deepEqual((await history(entity, id)).rows, []);
        assert.deepEqual(
          new Set((await activity()).rows.map((r) => r.entity_id)),
          new Set([ownEntry, ownRequest]),
        );
        assert.deepEqual(await ids("audit_events"), []);
      },
    );
    await t.test(
      "owner and administrator keep company-wide management",
      async () => {
        for (const uid of [owner, admin]) {
          await as(uid);
          const entries = await db.query<{ id: string }>(
            "select id from public.time_entries where company_id=$1",
            [a],
          );
          assert.deepEqual(
            new Set(entries.rows.map((r) => r.id)),
            new Set([ownEntry, otherEntry]),
          );
          assert.ok((await history("time_entries", otherEntry)).rows.length);
          assert.ok((await history("time_requests", otherRequest)).rows.length);
          assert.ok(
            (await activity()).rows.some((r) => r.entity_id === period),
          );
        }
        await as(admin);
        assert.equal(
          (
            await db.query(
              "select * from public.time_entries where company_id=$1",
              [b],
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "read-only, revoked permission, inactive member and inactive worker fail closed",
      async () => {
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [
            a,
            staff,
            JSON.stringify({ horasfix: ["read"], activity: ["read"] }),
          ],
        );
        await as(staff);
        assert.deepEqual(await ids("time_entries"), [ownEntry]);
        await assert.rejects(
          db.query("select public.punch_time($1,$2,'IN')", [a, randomUUID()]),
          { code: "42501" },
        );
        for (const [active, permissions] of [
          [false, { horasfix: ["read"], activity: ["read"] }],
          [true, { activity: ["read"] }],
        ] as const) {
          await as(owner);
          await db.query(
            "select public.set_member_access($1,$2,'member',$3,$4)",
            [a, staff, active, JSON.stringify(permissions)],
          );
          await as(staff);
          assert.deepEqual(await ids("time_entries"), []);
          assert.deepEqual(await ids("time_requests"), []);
          await assert.rejects(history("time_entries", ownEntry), {
            code: "42501",
          });
        }
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [
            a,
            staff,
            JSON.stringify({ horasfix: ["write"], activity: ["read"] }),
          ],
        );
        await db.exec("reset role");
        await db.query("update public.workers set active=false where id=$1", [
          ownWorker,
        ]);
        await as(staff);
        assert.deepEqual(await ids("time_entries"), []);
        assert.deepEqual((await history("time_entries", ownEntry)).rows, []);
        assert.deepEqual((await activity()).rows, []);
        await db.exec("reset role");
        await db.query("update public.workers set active=true where id=$1", [
          ownWorker,
        ]);
      },
    );
    await t.test(
      "reassignment never exposes previous worker snapshots or requests",
      async () => {
        await as(owner);
        await db.query("select public.save_time_entry($1,$2,1,$3)", [
          a,
          otherEntry,
          JSON.stringify({
            worker_id: ownWorker,
            starts_at: "2026-09-22T14:00:00Z",
            ends_at: "2026-09-22T15:00:00Z",
            break_minutes: 0,
            status: "PENDIENTE",
            notes: "Own newly assigned entry",
            reason: "Synthetic reassignment",
          }),
        ]);
        await as(staff);
        assert.ok((await ids("time_entries")).includes(otherEntry));
        assert.deepEqual((await history("time_entries", otherEntry)).rows, []);
        assert.deepEqual(
          (await history("time_requests", otherRequest)).rows,
          [],
        );
        assert.ok(
          !(await activity()).rows.some(
            (r) => r.entity_id === otherEntry || r.entity_id === otherRequest,
          ),
        );
        await as(other);
        assert.deepEqual(await ids("time_entries"), []);
        assert.deepEqual((await history("time_entries", otherEntry)).rows, []);
        await as(owner);
        assert.equal(
          (await history("time_entries", otherEntry)).rows.length,
          2,
        );
      },
    );
    await t.test(
      "anonymous cannot execute scope helpers or public read RPCs",
      async () => {
        await as("", "anon");
        for (const sql of [
          "select * from public.time_entries",
          "select app_private.can_read_time_worker($1,$2)",
          "select * from public.record_history($1,'time_entries',$2)",
        ])
          await assert.rejects(
            db.query(sql, sql.includes("$1") ? [a, ownEntry] : []),
            { code: "42501" },
          );
      },
    );
  } finally {
    await db.close();
  }
});
