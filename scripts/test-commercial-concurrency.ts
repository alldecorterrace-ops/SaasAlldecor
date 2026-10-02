import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  emptyItem,
  captureEstimateInput,
  estimateSchema,
} from "../src/lib/estimates";
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
    const documentBefore = (
      await pool.query(
        "select to_jsonb(d) data from commercial_documents d where id=$1",
        [id],
      )
    ).rows[0];
    const taxRace = await Promise.allSettled(
      ["0", "7"].map((tax_pct) =>
        actor((c) =>
          c.query("select save_estimate($1,$2,2,$3)", [
            company,
            record,
            JSON.stringify({ ...input, tax_pct, taxes: "0.01" }),
          ]),
        ),
      ),
    );
    assert.equal(taxRace.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(taxRace.filter((x) => x.status === "rejected").length, 1);
    const captured = (
      await pool.query(
        "select version,tax_pct,taxes,total from estimates where id=$1",
        [record],
      )
    ).rows[0];
    assert.equal(captured.version, 3);
    assert.equal(captured.taxes, captured.tax_pct === 7 ? "7.02" : "0.00");
    assert.equal(captured.total, captured.tax_pct === 7 ? "107.27" : "100.25");
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from estimate_revisions where estimate_id=$1",
          [record],
        )
      ).rows[0].n,
      3,
    );
    assert.deepEqual(
      (
        await pool.query(
          "select to_jsonb(d) data from commercial_documents d where id=$1",
          [id],
        )
      ).rows[0],
      documentBefore,
    );
    const originalRevisions = (
      await pool.query(
        "select version,md5(snapshot::text) hash from estimate_revisions where estimate_id=$1 order by version",
        [record],
      )
    ).rows;
    const discountRace = await Promise.allSettled(
      ["100.26", "2.50"].map((discount) =>
        actor((c) =>
          c.query("select save_estimate($1,$2,3,$3)", [
            company,
            record,
            JSON.stringify(
              captureEstimateInput(
                estimateSchema.parse({ ...input, discount, tax_pct: "7" }),
              ),
            ),
          ]),
        ),
      ),
    );
    assert.equal(
      discountRace.filter((x) => x.status === "fulfilled").length,
      1,
    );
    assert.equal(discountRace.filter((x) => x.status === "rejected").length, 1);
    const discountRow = (
      await pool.query(
        "select version,discount,taxes,total from estimates where id=$1",
        [record],
      )
    ).rows[0];
    assert.equal(discountRow.version, 4);
    assert.ok(["100.25", "2.50"].includes(discountRow.discount));
    assert.equal(
      discountRow.taxes,
      discountRow.discount === "100.25" ? "0.00" : "6.84",
    );
    assert.equal(
      discountRow.total,
      discountRow.discount === "100.25" ? "0.00" : "104.59",
    );
    assert.deepEqual(
      (
        await pool.query(
          "select version,md5(snapshot::text) hash from estimate_revisions where estimate_id=$1 and version<4 order by version",
          [record],
        )
      ).rows,
      originalRevisions,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from estimate_revisions where estimate_id=$1",
          [record],
        )
      ).rows[0].n,
      4,
    );
    assert.deepEqual(
      (
        await pool.query(
          "select to_jsonb(d) data from commercial_documents d where id=$1",
          [id],
        )
      ).rows[0],
      documentBefore,
    );
    assert.equal(
      (
        await pool.query(
          "select ((select count(*) from invoices where company_id=$1)+(select count(*) from payments where company_id=$1)+(select count(*) from projects where company_id=$1))::int n",
          [company],
        )
      ).rows[0].n,
      0,
    );
    console.log(
      "PASS eight concurrent PDF prepares/finalizes: one immutable document, two audit events, unchanged finance, stale generation rejected; concurrent tax choices: one captured revision, one stale writer rejected, original PDF unchanged; concurrent captured discounts: one revision, one stale writer, capped amount, original snapshots and PDF unchanged, no financial side effects",
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Concurrency test failed");
  process.exitCode = 1;
});
