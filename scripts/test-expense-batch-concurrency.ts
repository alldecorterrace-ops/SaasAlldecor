import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

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
    company = randomUUID();
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
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  };
  const row = () => ({
    id: randomUUID(),
    project_id: null,
    worker_id: null,
    expense_date: "2026-09-29",
    category: "Materiales",
    description: "Synthetic concurrency",
    vendor: "QA",
    document_number: randomUUID(),
    amount: "10.01",
    method: "ZELLE",
    payer: "EMPRESA",
  });
  const call = async (
    c: PoolClient,
    batch: string,
    rows: ReturnType<typeof row>[],
  ): Promise<string[]> =>
    (
      await c.query("select public.save_expense_batch($1,$2,$3) ids", [
        company,
        batch,
        JSON.stringify(rows),
      ])
    ).rows[0].ids;
  const count = async (
    table: "expenses" | "expense_batches" | "audit_events",
  ) =>
    (
      await pool.query(
        `select count(*)::int n from public.${table} where company_id=$1${table === "audit_events" ? " and entity='expenses'" : ""}`,
        [company],
      )
    ).rows[0].n;
  try {
    await pool.query("insert into auth.users values($1,$2,now())", [
      owner,
      `${owner}@example.test`,
    ]);
    await actor((c) =>
      c.query("select public.create_company($1,'Batch concurrency QA')", [
        company,
      ]),
    );
    const batch = randomUUID(),
      rows = [row(), row(), row()];
    const results = await Promise.all(
      Array.from({ length: 8 }, () => actor((c) => call(c, batch, rows))),
    );
    assert.ok(
      results.every(
        (ids) => JSON.stringify(ids) === JSON.stringify(rows.map((r) => r.id)),
      ),
    );
    assert.equal(await count("expenses"), 3);
    assert.equal(await count("expense_batches"), 1);
    assert.equal(await count("audit_events"), 3);
    // A committed result can be lost by the caller: replay still returns its receipt.
    await actor((c) => call(c, batch, rows));
    assert.equal(await count("audit_events"), 3);
    await assert.rejects(
      actor((c) =>
        call(c, batch, [{ ...rows[0], amount: "99" }, ...rows.slice(1)]),
      ),
      /expense_batch_conflict/,
    );
    // Different batch IDs racing over the same invoice may not partially succeed.
    const duplicate = randomUUID();
    const contenders = Array.from({ length: 2 }, () => [
      row(),
      { ...row(), document_number: duplicate },
    ]);
    const race = await Promise.allSettled(
      contenders.map((r) => actor((c) => call(c, randomUUID(), r))),
    );
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const failure = race.find((r) => r.status === "rejected");
    assert.match(
      String(failure?.reason),
      /expense_batch_row_2:duplicate_expense_document/,
    );
    assert.equal(await count("expenses"), 5);
    assert.equal(await count("expense_batches"), 2);
    assert.equal(await count("audit_events"), 5);
    // Aborted execution before commit leaves neither effects nor a success receipt.
    const aborted = randomUUID(),
      retryRows = [row(), row()];
    await assert.rejects(
      actor(async (c) => {
        await call(c, aborted, retryRows);
        throw new Error("synthetic-executor-abort");
      }),
      /synthetic-executor-abort/,
    );
    assert.equal(await count("expenses"), 5);
    assert.equal(await count("expense_batches"), 2);
    assert.deepEqual(
      await actor((c) => call(c, aborted, retryRows)),
      retryRows.map((r) => r.id),
    );
    assert.equal(await count("expenses"), 7);
    assert.equal(await count("expense_batches"), 3);
    assert.equal(await count("audit_events"), 7);
    // Two independent batches carrying identical image bytes race after upload.
    const imageHash = "a".repeat(64),
      imageBatches = [randomUUID(), randomUUID()];
    const imageRows = [row(), row()];
    const receiptIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const prepared = await actor((c) =>
        c.query(
          "select (public.prepare_expense_batch_receipt($1,$2,$3,$4,600,'png')).*",
          [company, imageBatches[i], imageRows[i].id, imageHash],
        ),
      );
      const id = prepared.rows[0].id;
      receiptIds.push(id);
      await actor((c) =>
        c.query(
          "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
          [`${company}/${imageRows[i].id}/${id}.png`],
        ),
      );
    }
    const images = await Promise.allSettled(
      imageRows.map((r, i) =>
        actor((c) =>
          call(c, imageBatches[i], [
            { ...r, receipt_id: receiptIds[i] } as ReturnType<typeof row>,
          ]),
        ),
      ),
    );
    assert.equal(images.filter((x) => x.status === "fulfilled").length, 1);
    assert.match(
      String(images.find((x) => x.status === "rejected")?.reason),
      /duplicate_expense_receipt/,
    );
    assert.equal(await count("expenses"), 8);
    assert.equal(await count("expense_batches"), 4);
    const winner = images.findIndex((x) => x.status === "fulfilled");
    const replay = await Promise.all(
      Array.from({ length: 8 }, () =>
        actor((c) =>
          call(c, imageBatches[winner], [
            {
              ...imageRows[winner],
              receipt_id: receiptIds[winner],
            } as ReturnType<typeof row>,
          ]),
        ),
      ),
    );
    assert.ok(replay.every((x) => x[0] === imageRows[winner].id));
    assert.equal(await count("expenses"), 8);
    assert.equal(await count("expense_batches"), 4);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.expense_receipt_uploads where company_id=$1",
          [company],
        )
      ).rows[0].n,
      2,
    );
    console.log(
      "PASS expense batches: 8 concurrent replays, lost-response replay, conflicting payload, duplicate-document race aborted transaction, duplicate-image race and 8 image replays; no partial effects or duplicate receipts",
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Concurrency test failed",
  );
  process.exitCode = 1;
});
