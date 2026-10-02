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
    // A separate synthetic invoice exercises payment writers against PDF readers.
    const paymentEstimate = randomUUID();
    const paymentInvoice = await actor(async (c) => {
      await c.query("select save_estimate($1,$2,0,$3)", [
        company,
        paymentEstimate,
        JSON.stringify({
          ...input,
          items: [{ ...emptyItem, name: "QA receipt", unit_price: "100.10" }],
        }),
      ]);
      return (
        await c.query(
          "select approve_estimate($1,$2,1,'2026-10-02','Payment PDF QA','Synthetic approval') id",
          [company, paymentEstimate],
        )
      ).rows[0].id as string;
    });
    const financeHash = async () =>
      (
        await pool.query(
          "select md5(to_jsonb(i)::text) invoice,(select md5(coalesce(string_agg(to_jsonb(p)::text,'' order by p.id),'')) from payments p where p.company_id=$1 and p.invoice_id=$2) payments from invoices i where i.company_id=$1 and i.id=$2",
          [company, paymentInvoice],
        )
      ).rows[0];
    const paymentDocs = await Promise.all(
      Array.from({ length: 8 }, () =>
        actor(
          async (c) =>
            (
              await c.query(
                "select to_jsonb(prepare_commercial_document($1,'invoice',$2,1)) data",
                [company, paymentInvoice],
              )
            ).rows[0].data,
        ),
      ),
    );
    assert.equal(new Set(paymentDocs.map((d) => d.id)).size, 1);
    assert.deepEqual(paymentDocs[0].snapshot.record.payments, []);
    const documentHash = async (id: string) =>
      (
        await pool.query(
          "select md5(to_jsonb(d)::text) hash from commercial_documents d where id=$1",
          [id],
        )
      ).rows[0].hash;
    const originalHash = await documentHash(paymentDocs[0].id);
    const waitForDatabaseLock = async (label: string) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const row = (
          await pool.query(
            "select count(*)::int n from pg_stat_activity where application_name=$1 and wait_event_type='Lock'",
            [label],
          )
        ).rows[0];
        if (row.n === 1) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("Expected real PostgreSQL lock wait: " + label);
    };
    const partialId = randomUUID(),
      balanceId = randomUUID();
    const paymentData = (amount: string, reference: string) =>
      JSON.stringify({
        amount,
        payment_date: "2026-10-02",
        method: "TRANSFERENCIA",
        reference,
        notes: "QA payment, no transfer",
      });
    const lockedWriter = await pool.connect();
    try {
      await lockedWriter.query("begin");
      await lockedWriter.query(
        "select set_config('request.jwt.claim.sub',$1,true)",
        [owner],
      );
      await lockedWriter.query("set local role authenticated");
      await lockedWriter.query("select record_payment($1,$2,$3,1,$4)", [
        company,
        partialId,
        paymentInvoice,
        paymentData("30.06", "QA-PARTIAL"),
      ]);
      const label = "invoice-pdf-stale-" + randomUUID();
      const stale = actor(async (c) => {
        await c.query("select set_config('application_name',$1,true)", [label]);
        return c.query(
          "select prepare_commercial_document($1,'invoice',$2,1)",
          [company, paymentInvoice],
        );
      });
      const rejected = assert.rejects(stale, /record_conflict/);
      await waitForDatabaseLock(label);
      await lockedWriter.query("commit");
      await rejected;
    } finally {
      await lockedWriter.query("rollback");
      lockedWriter.release();
    }
    const lockedReader = await pool.connect();
    let partialDocument: {
      id: string;
      snapshot: {
        record: {
          payments: Array<{ id: string; amount: number }>;
          paid_amount: number;
          balance_due: number;
        };
      };
    };
    try {
      await lockedReader.query("begin");
      await lockedReader.query(
        "select set_config('request.jwt.claim.sub',$1,true)",
        [owner],
      );
      await lockedReader.query("set local role authenticated");
      partialDocument = (
        await lockedReader.query(
          "select to_jsonb(prepare_commercial_document($1,'invoice',$2,2)) data",
          [company, paymentInvoice],
        )
      ).rows[0].data;
      assert.equal(partialDocument.snapshot.record.paid_amount, 30.06);
      assert.equal(partialDocument.snapshot.record.balance_due, 70.04);
      assert.deepEqual(
        partialDocument.snapshot.record.payments.map((p) => [p.id, p.amount]),
        [[partialId, 30.06]],
      );
      const label = "invoice-payment-wait-" + randomUUID();
      const next = actor(async (c) => {
        await c.query("select set_config('application_name',$1,true)", [label]);
        return c.query("select record_payment($1,$2,$3,2,$4)", [
          company,
          balanceId,
          paymentInvoice,
          paymentData("70.04", "QA-BALANCE"),
        ]);
      });
      const completed = next.then((x) => x);
      await waitForDatabaseLock(label);
      await lockedReader.query("commit");
      await completed;
    } finally {
      await lockedReader.query("rollback");
      lockedReader.release();
    }
    const partialHash = await documentHash(partialDocument!.id),
      beforePdf = await financeHash();
    const fullDocument = await actor(
      async (c) =>
        (
          await c.query(
            "select to_jsonb(prepare_commercial_document($1,'invoice',$2,3)) data",
            [company, paymentInvoice],
          )
        ).rows[0].data,
    );
    assert.equal(fullDocument.snapshot.record.payments.length, 2);
    assert.equal(fullDocument.snapshot.record.paid_amount, 100.1);
    assert.equal(fullDocument.snapshot.record.balance_due, 0);
    assert.deepEqual(await financeHash(), beforePdf);
    const fullHash = await documentHash(fullDocument.id);
    await actor((c) =>
      c.query("select void_payment($1,$2,1,'QA reverse')", [
        company,
        partialId,
      ]),
    );
    const reversed = await actor(
      async (c) =>
        (
          await c.query(
            "select to_jsonb(prepare_commercial_document($1,'invoice',$2,4)) data",
            [company, paymentInvoice],
          )
        ).rows[0].data,
    );
    assert.deepEqual(
      reversed.snapshot.record.payments.map((p: { id: string }) => p.id),
      [balanceId],
    );
    assert.equal(reversed.snapshot.record.paid_amount, 70.04);
    assert.equal(await documentHash(paymentDocs[0].id), originalHash);
    assert.equal(await documentHash(partialDocument!.id), partialHash);
    assert.equal(await documentHash(fullDocument.id), fullHash);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from payments where company_id=$1 and invoice_id=$2",
          [company, paymentInvoice],
        )
      ).rows[0].n,
      2,
    );
    console.log(
      "PASS invoice payment/PDF locking: eight prepares yield one document; writer-first stale reader blocked/rejected; reader-first payment blocked until capture; applied totals and reversals preserve original documents; no duplicate payment",
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
