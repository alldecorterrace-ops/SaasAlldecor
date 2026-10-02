import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { reimbursementFixture } from "../tests/helpers/reimbursement-fixture";
import type { ReceiptTestDb } from "../tests/helpers/receipt-review-fixture";
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
  const actor = async <T>(user: string, run: (c: PoolClient) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      await c.query("set local role authenticated");
      const v = await run(c);
      await c.query("commit");
      return v;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  try {
    await setup.query("reset role");
    const finance = async () =>
      (
        await setup.query(
          "select (select coalesce(jsonb_agg(md5(to_jsonb(p)::text) order by md5(to_jsonb(p)::text)),'[]') from payments p) payments,(select coalesce(jsonb_agg(md5(to_jsonb(e)::text) order by md5(to_jsonb(e)::text)),'[]') from expenses e) expenses",
        )
      ).rows[0];
    const before = await finance(),
      f = await reimbursementFixture(db);
    const record = (
      items: Array<{ id: string; version: number }>,
      request = randomUUID(),
      all = false,
    ) =>
      actor(
        f.owner,
        async (c) =>
          (
            await c.query(
              "select record_workforce_reimbursement($1,$2,$3,$4,$5,$6,'Synthetic previous-payment evidence') data",
              [
                f.a,
                request,
                f.worker.id,
                JSON.stringify(
                  items.map(({ id, version }) => ({ id, version })),
                ),
                items.length * 100,
                all,
              ],
            )
          ).rows[0].data,
      );
    const a = await f.approve(),
      req = randomUUID(),
      eight = await Promise.all(
        Array.from({ length: 8 }, () => record([a], req)),
      );
    for (const v of eight) assert.deepEqual(v, eight[0]);
    assert.equal((await f.row(a.id)).version, 5);
    const b = await f.approve(),
      race = await Promise.allSettled([record([b]), record([b])]);
    assert.equal(race.filter((v) => v.status === "fulfilled").length, 1);
    assert.equal((await f.row(b.id)).version, 5);
    const c = await f.approve(),
      d = await f.approve(),
      batch = await Promise.allSettled([
        record([c, d], randomUUID(), true),
        record([c]),
      ]);
    assert.equal(batch.filter((v) => v.status === "fulfilled").length, 1);
    const cr = await f.row(c.id),
      dr = await f.row(d.id);
    assert(cr.reimbursed_at);
    assert.equal(cr.version, 5);
    assert.equal(dr.version, dr.reimbursed_at ? 5 : 4);
    const e = await f.approve(),
      archive = () =>
        actor(
          f.owner,
          async (cl) =>
            (
              await cl.query(
                "select archive_workforce_expense($1,$2,$3,$4,false,'Synthetic concurrent archive') data",
                [f.a, randomUUID(), e.id, e.version],
              )
            ).rows[0].data,
        ),
      archived = await Promise.allSettled([record([e]), archive()]);
    assert.equal(archived.filter((v) => v.status === "fulfilled").length, 1);
    const er = await f.row(e.id);
    assert.equal(er.version, 5);
    assert.equal(er.status === "ARCHIVED", er.reimbursed_at === null);
    await setup.query("reset role");
    assert.deepEqual(await finance(), before);
    console.log(
      JSON.stringify({
        reimbursement: {
          same_request: { attempts: 8, effects: 1 },
          different_requests: { attempts: 2, effects: 1 },
          individual_vs_batch: { attempts: 2, effects: 1 },
          archive_vs_record: { attempts: 2, effects: 1 },
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
