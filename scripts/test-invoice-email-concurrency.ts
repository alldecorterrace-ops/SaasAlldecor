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
    estimate = randomUUID();
  const actor = async <T>(fn: (c: PoolClient) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await c.query("set local role authenticated");
      const value = await fn(c);
      await c.query("commit");
      return value;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  try {
    await pool.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [owner, `${owner}@example.test`],
    );
    const invoice = await actor(async (c) => {
      await c.query("select create_company($1,'Invoice mail concurrency')", [
        company,
      ]);
      await c.query("select save_customer($1,$2,0,$3)", [
        company,
        customer,
        JSON.stringify({
          full_name: "Synthetic",
          email: "invoice@saasalldecor.invalid",
          status: "active",
        }),
      ]);
      await c.query("select save_estimate($1,$2,0,$3)", [
        company,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: "2026-10-02",
          valid_until: null,
          status: "PENDIENTE",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "QA", unit_price: "100.10" }],
        }),
      ]);
      return (
        await c.query(
          "select approve_estimate($1,$2,1,'2026-10-02','Synthetic project','Synthetic approval') id",
          [company, estimate],
        )
      ).rows[0].id as string;
    });
    const doc = await actor(async (c) => {
      const d = (
        await c.query(
          "select (prepare_commercial_document($1,'invoice',$2,1)).id id",
          [company, invoice],
        )
      ).rows[0].id;
      await c.query(
        "insert into storage.objects(bucket_id,name) values('commercial-pdfs',$1)",
        [`${company}/${d}.pdf`],
      );
      await c.query("select finish_commercial_document($1,$2,$3,100)", [
        company,
        d,
        "a".repeat(64),
      ]);
      return d as string;
    });
    const request = randomUUID();
    const claim = (req: string, version = 1) =>
      actor(
        async (c) =>
          (
            await c.query(
              "select claim_invoice_email($1,$2,$3,$4,$5,'capture') data",
              [company, invoice, version, doc, req],
            )
          ).rows[0].data,
      );
    const replies = await Promise.all(
      Array.from({ length: 8 }, () => claim(request)),
    );
    assert.equal(replies.filter((r) => r.claimed).length, 1);
    const id = replies[0].attempt.id;
    assert(replies.every((r) => r.attempt.id === id));
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from invoice_email_attempts where company_id=$1",
          [company],
        )
      ).rows[0].n,
      1,
    );
    await actor((c) =>
      c.query(
        "insert into storage.objects(bucket_id,name) values('invoice-email-captures',$1)",
        [`${company}/${id}.eml`],
      ),
    );
    const finished = await Promise.all(
      Array.from({ length: 8 }, () =>
        actor(
          async (c) =>
            (
              await c.query(
                "select to_jsonb(finish_invoice_email($1,$2,'captured',$3,200)) data",
                [company, id, "b".repeat(64)],
              )
            ).rows[0].data,
        ),
      ),
    );
    assert(
      finished.every((r) => JSON.stringify(r) === JSON.stringify(finished[0])),
    );
    const changes = await pool.query(
      "select count(*)::int n from audit_events where company_id=$1 and entity='invoice_email_attempts'",
      [company],
    );
    assert.equal(changes.rows[0].n, 2, "one claim and one terminal transition");
    await actor((c) =>
      c.query(
        "select update_invoice($1,$2,1,'2026-10-02',null,'Changed invoice',null)",
        [company, invoice],
      ),
    );
    assert.equal(
      (await claim(request)).attempt.status,
      "captured",
      "idempotent retry after source changes",
    );
    await assert.rejects(claim(randomUUID()), /record_conflict/);
    await assert.rejects(claim(request, 2), /mail_request_conflict/);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from invoice_email_attempts where company_id=$1",
          [company],
        )
      ).rows[0].n,
      1,
    );

    // A source writer holding the invoice lock must invalidate a waiting new
    // claim. Existing completed requests still return their exact outcome.
    const lock = await pool.connect();
    try {
      await lock.query("begin");
      await lock.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await lock.query("select 1 from invoices where id=$1 for update", [
        invoice,
      ]);
      await lock.query("set local role authenticated");
      const competing = claim(randomUUID(), 2).then(
        () => ({ ok: true, error: "" }),
        (e) => ({ ok: false, error: String(e.message) }),
      );
      await lock.query(
        "select update_invoice($1,$2,2,'2026-10-02',null,'Third version',null)",
        [company, invoice],
      );
      await lock.query("commit");
      const loser = await competing;
      assert.equal(loser.ok, false);
      assert.match(loser.error, /record_conflict/);
    } catch (e) {
      await lock.query("rollback");
      throw e;
    } finally {
      lock.release();
    }
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from invoice_email_attempts where company_id=$1",
          [company],
        )
      ).rows[0].n,
      1,
    );
    const currentDoc = await actor(async (c) => {
      const d = (
        await c.query(
          "select (prepare_commercial_document($1,'invoice',$2,3)).id id",
          [company, invoice],
        )
      ).rows[0].id;
      await c.query(
        "insert into storage.objects(bucket_id,name) values('commercial-pdfs',$1)",
        [`${company}/${d}.pdf`],
      );
      await c.query("select finish_commercial_document($1,$2,$3,100)", [
        company,
        d,
        "c".repeat(64),
      ]);
      return d;
    });
    await pool.query(
      "insert into invoice_email_attempts(company_id,request_id,invoice_id,document_id,record_version,requested_by,recipient,mode,status,finished_at) select $1,gen_random_uuid(),$2,$3,3,$4,'invoice@saasalldecor.invalid','capture','failed',now() from generate_series(1,98)",
      [company, invoice, currentDoc, owner],
    );
    const quota = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        actor(
          async (c) =>
            (
              await c.query(
                "select claim_invoice_email($1,$2,3,$3,$4,'capture') data",
                [company, invoice, currentDoc, randomUUID()],
              )
            ).rows[0].data,
        ),
      ),
    );
    assert.equal(quota.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of quota)
      if (r.status === "rejected")
        assert.match(String(r.reason.message), /mail_rate_limited/);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from invoice_email_attempts where company_id=$1",
          [company],
        )
      ).rows[0].n,
      100,
    );
    console.log(
      "INVOICE_EMAIL_CONCURRENCY_PASS: eight claims/finalizations; one outcome; stale writer and durable retries.",
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
