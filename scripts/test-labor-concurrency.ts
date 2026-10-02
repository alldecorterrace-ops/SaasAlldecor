import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  receiptReviewFixture,
  type ReceiptTestDb,
} from "../tests/helpers/receipt-review-fixture";
async function main() {
  const url = new URL(process.env.QUEUE_TEST_DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/saas_queue_test"
  )
    throw new Error("Dedicated local test database required");
  const pool = new Pool({
      connectionString: url.href,
      max: 12,
      statement_timeout: 30000,
    }),
    setup = await pool.connect();
  const db: ReceiptTestDb = {
    query: async <T>(sql: string, args?: unknown[]) => ({
      rows: (await setup.query(sql, args)).rows as T[],
    }),
    exec: async (sql: string) => {
      await setup.query(sql);
    },
  };
  const actor = async <T>(
    user: string,
    fn: (c: PoolClient) => Promise<T>,
    name = "saas-labor-test",
  ) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('application_name',$2,true)",
        [user, name],
      );
      await c.query("set local role authenticated");
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  try {
    const finance = async () =>
      (
        await setup.query(
          "select (select coalesce(jsonb_agg(md5(to_jsonb(p)::text) order by md5(to_jsonb(p)::text)),'[]') from payments p) payments,(select coalesce(jsonb_agg(md5(to_jsonb(e)::text) order by md5(to_jsonb(e)::text)),'[]') from expenses e) expenses",
        )
      ).rows[0];
    const before = await finance(),
      f = await receiptReviewFixture(db);
    await setup.query("reset role");
    const body = {
      worker: f.worker.id,
      from: f.day,
      to: "",
      amount: "250.00",
      active: true,
    };
    const save = (
      id: string,
      version: number,
      data: unknown,
      request = randomUUID(),
      user = f.owner,
      name?: string,
    ) =>
      actor(
        user,
        async (c) =>
          (
            await c.query(
              "select save_labor_config($1,$2,$3,$4,'RATE',$5,'Synthetic native concurrent Labor input') id",
              [f.a, request, id, version, JSON.stringify(data)],
            )
          ).rows[0].id,
        name,
      );
    const id = randomUUID(),
      request = randomUUID();
    const same = await Promise.all(
      Array.from({ length: 8 }, () => save(id, 0, body, request)),
    );
    assert.ok(same.every((v) => v === id));
    assert.equal(
      (await setup.query("select version from labor_rates where id=$1", [id]))
        .rows[0].version,
      1,
    );
    assert.equal(
      (
        await setup.query(
          "select count(*)::int n from audit_events where entity='labor_rates' and entity_id=$1",
          [id],
        )
      ).rows[0].n,
      1,
    );
    const overlap = await Promise.allSettled([
      save(randomUUID(), 0, { ...body, worker: f.office.id }),
      save(randomUUID(), 0, { ...body, worker: f.office.id }),
    ]);
    assert.equal(overlap.filter((v) => v.status === "fulfilled").length, 1);
    const edits = await Promise.allSettled([
      save(id, 1, { ...body, amount: "251.00" }),
      save(id, 1, { ...body, amount: "252.00" }),
    ]);
    assert.equal(edits.filter((v) => v.status === "fulfilled").length, 1);
    assert.equal(
      (await setup.query("select version from labor_rates where id=$1", [id]))
        .rows[0].version,
      2,
    );
    const gate = await pool.connect();
    let waiting: Promise<PromiseSettledResult<unknown>> | undefined;
    try {
      await gate.query("begin");
      await gate.query(
        "select pg_advisory_xact_lock(hashtextextended($1||':labor-config',0))",
        [f.a],
      );
      waiting = save(
        randomUUID(),
        0,
        { ...body, worker: f.foreignWorker.id },
        randomUUID(),
        f.otherOwner,
        "saas-labor-revocation",
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ status: "rejected" as const, reason }),
      );
      let blocked = false;
      for (let n = 0; n < 80; n++) {
        if (
          (
            await setup.query(
              "select exists(select 1 from pg_stat_activity where application_name='saas-labor-revocation' and wait_event='advisory') blocked",
            )
          ).rows[0].blocked
        ) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(
        blocked,
        "The request must actually wait on the concurrent configuration lock",
      );
      await actor(f.owner, async (c) =>
        c.query("select set_member_access($1,$2,'member',true,'{}')", [
          f.a,
          f.otherOwner,
        ]),
      );
      await gate.query("commit");
      const result = await waiting;
      assert.equal(result.status, "rejected");
      if (result.status === "rejected")
        assert.match(String(result.reason), /permission_denied/);
    } finally {
      await gate.query("rollback");
      gate.release();
      if (waiting) await waiting;
    }
    await setup.query("reset role");
    assert.deepEqual(await finance(), before);
    console.log(
      JSON.stringify({
        labor: {
          same_request: { attempts: 8, effects: 1 },
          overlapping_rates: { attempts: 2, effects: 1 },
          stale_edits: { attempts: 2, effects: 1 },
          revocation_while_waiting: { effects: 0, permission_rechecked: true },
          payments_and_administrative_costs_unchanged: true,
        },
      }),
    );
  } finally {
    await setup.query("reset role");
    setup.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
