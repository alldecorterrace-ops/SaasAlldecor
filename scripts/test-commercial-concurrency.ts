import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { emptyItem } from "../src/lib/estimates";
async function main() {
  const url = new URL(process.env.QUEUE_TEST_DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/saas_queue_test"
  )
    throw new Error("Dedicated local test database required");
  const pool = new Pool({
    connectionString: url.href,
    max: 10,
    statement_timeout: 30000,
  });
  const owner = randomUUID(),
    company = randomUUID(),
    customer = randomUUID(),
    record = randomUUID();
  const actor = async <T>(fn: (c: PoolClient) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await c.query("set local role authenticated");
      const result = await fn(c);
      await c.query("commit");
      return result;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  const input = {
    customer_id: customer,
    estimate_date: "2026-09-29",
    valid_until: null,
    status: "PENDIENTE",
    notes: "Synthetic concurrency",
    discount: "0",
    taxes: "0",
    items: [{ ...emptyItem, name: "QA", unit_price: "100.25" }],
  };
  try {
    await pool.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [owner, `${owner}@example.test`],
    );
    await actor(async (c) => {
      await c.query("select public.create_company($1,'PDF concurrency QA')", [
        company,
      ]);
      await c.query("select public.save_customer($1,$2,0,$3)", [
        company,
        customer,
        JSON.stringify({ full_name: "Synthetic", status: "active" }),
      ]);
      await c.query("select public.save_estimate($1,$2,0,$3)", [
        company,
        record,
        JSON.stringify(input),
      ]);
    });
    const fingerprint = async () =>
      JSON.stringify(
        (
          await pool.query(
            "select to_jsonb(e) data from public.estimates e where company_id=$1",
            [company],
          )
        ).rows,
      );
    const before = await fingerprint();
    const ids = await Promise.all(
      Array.from({ length: 8 }, () =>
        actor(
          async (c) =>
            (
              await c.query(
                "select (public.prepare_commercial_document($1,'estimate',$2,1)).id id",
                [company, record],
              )
            ).rows[0].id,
        ),
      ),
    );
    assert.equal(new Set(ids).size, 1);
    const id = ids[0];
    await actor((c) =>
      c.query(
        "insert into storage.objects(bucket_id,name) values('commercial-pdfs',$1)",
        [`${company}/${id}.pdf`],
      ),
    );
    const receipts = await Promise.all(
      Array.from({ length: 8 }, () =>
        actor(
          async (c) =>
            (
              await c.query(
                "select public.finish_commercial_document($1,$2,$3,100) id",
                [company, id, "a".repeat(64)],
              )
            ).rows[0].id,
        ),
      ),
    );
    assert.ok(receipts.every((x) => x === id));
    assert.equal(await fingerprint(), before);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.commercial_documents where company_id=$1",
          [company],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.audit_events where company_id=$1 and entity='commercial_documents'",
          [company],
        )
      ).rows[0].n,
      2,
    );
    const writer = await pool.connect();
    try {
      await writer.query("begin");
      await writer.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await writer.query("set local role authenticated");
      await writer.query("select public.save_estimate($1,$2,1,$3)", [
        company,
        record,
        JSON.stringify({ ...input, notes: "Changed concurrently" }),
      ]);
      const stale = actor((c) =>
        c.query(
          "select public.prepare_commercial_document($1,'estimate',$2,1)",
          [company, record],
        ),
      );
      const rejected = assert.rejects(stale, /record_conflict/);
      await writer.query("commit");
      await rejected;
    } finally {
      await writer.query("rollback");
      writer.release();
    }
    console.log(
      "PASS eight concurrent PDF prepares/finalizes: one immutable document, two audit events, unchanged finance, stale generation rejected",
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Concurrency test failed");
  process.exitCode = 1;
});
