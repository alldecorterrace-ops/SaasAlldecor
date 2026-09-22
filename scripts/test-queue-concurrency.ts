import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { authStorageContract } from "../tests/helpers/auth-storage-contract";

async function main() {
  const connection = process.env.QUEUE_TEST_DATABASE_URL;
  if (!connection) throw new Error("QUEUE_TEST_DATABASE_URL is required");
  const url = new URL(connection);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/saas_queue_test"
  )
    throw new Error("Only the dedicated loopback test database is allowed");
  const pool = new Pool({
    connectionString: connection,
    max: 16,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  const owner = randomUUID(),
    company = randomUUID();
  const actor = async <T>(run: (client: PoolClient) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await client.query("set local role authenticated");
      const result = await run(client);
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  };
  const body = () => ({
    recordId: randomUUID(),
    version: 0,
    data: { full_name: "Synthetic concurrency customer", status: "active" },
  });
  const enqueue = (id: string, payload: ReturnType<typeof body>) =>
    actor(
      async (c) =>
        (
          await c.query(
            "select public.enqueue_operation($1,$2,'customer.save',$3) r",
            [company, id, JSON.stringify(payload)],
          )
        ).rows[0].r,
    );
  try {
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from information_schema.tables where table_schema in ('public','auth','storage','app_private')",
        )
      ).rows[0].n,
      0,
      "Test database must be empty; nothing is dropped automatically",
    );
    await pool.query(authStorageContract);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((x) => x.endsWith(".sql"))
      .sort())
      await pool.query(await readFile(new URL(file, directory), "utf8"));
    await pool.query(
      "insert into auth.users values($1,'concurrency-owner@example.test',now())",
      [owner],
    );
    await actor((c) =>
      c.query(
        "select public.create_company($1,'Synthetic concurrency tenant')",
        [company],
      ),
    );
    await pool.query(
      "insert into app_private.operation_handlers values('customer.save','clientes','adt',false)",
    );
    await pool.query(
      "insert into app_private.operation_adapters values('customer.save','adt',true,repeat('a',64)),('customer.save','saas',true,repeat('b',64))",
    );
    await pool.query(
      "insert into app_private.transition_controls(company_id,phase) values($1,'accepting')",
      [company],
    );
    const sameId = randomUUID(),
      sameBody = body();
    const responses = await Promise.all(
      Array.from({ length: 24 }, () => enqueue(sameId, sameBody)),
    );
    assert.equal(responses.filter((r) => !r.replayed).length, 1);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from app_private.operation_requests",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      enqueue(sameId, { ...sameBody, version: 1 }),
      /request_conflict/,
    );
    console.log(
      "PASS concurrent identical requests create one durable receipt",
    );

    const before = await Promise.all(
      Array.from({ length: 8 }, () => enqueue(randomUUID(), body())),
    );
    assert.equal(before.length, 8);
    await Promise.all([
      ...Array.from({ length: 24 }, () => enqueue(randomUUID(), body())),
      actor((c) =>
        c.query("select public.pause_operation_queue($1)", [company]),
      ),
    ]);
    await enqueue(randomUUID(), body()); // Guaranteed to be after the cut.
    const transition = (
      await pool.query(
        "select * from app_private.transition_sessions where company_id=$1",
        [company],
      )
    ).rows[0];
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from app_private.operation_requests where company_id=$1 and ((enqueue_sequence<=$2 and authority is distinct from 'adt') or (enqueue_sequence>$2 and authority is not null))",
          [company, transition.cutoff],
        )
      ).rows[0].n,
      0,
    );
    const held = (
      await pool.query(
        "select count(*)::int n from app_private.operation_requests where authority is null",
      )
    ).rows[0].n;
    assert.ok(held >= 1);
    await assert.rejects(
      pool.query("select app_private.finalize_adt_transition($1,$2)", [
        company,
        transition.id,
      ]),
      /transition_not_cleared/,
    );
    await pool.query(
      "insert into app_private.transition_clearances values($1,$2,repeat('c',64),repeat('d',64),repeat('e',64),repeat('f',64),repeat('a',64),now(),now()+interval '10 minutes')",
      [transition.id, owner],
    );
    await assert.rejects(
      pool.query("select app_private.finalize_adt_transition($1,$2)", [
        company,
        transition.id,
      ]),
      /drain_incomplete/,
    );
    console.log(
      "PASS concurrent drain partitions committed requests without stopping receipt",
    );

    const claimed = new Set<string>();
    for (;;) {
      const batch = await Promise.all(
        Array.from({ length: 12 }, () =>
          pool.query("select app_private.claim_operation($1,'adt',1) r", [
            company,
          ]),
        ),
      );
      const requests = batch.map((x) => x.rows[0].r).filter(Boolean);
      if (!requests.length) break;
      for (const r of requests) {
        assert.equal(claimed.has(r.id), false);
        claimed.add(r.id);
        // Test-only ADT acknowledgment; this is not an ADT business adapter.
        await pool.query(
          "select app_private.complete_operation($1,$2,$3,'succeeded','synthetic-fixture','completed')",
          [company, r.id, r.claimToken],
        );
      }
    }
    assert.equal(
      claimed.size,
      (
        await pool.query(
          "select count(*)::int n from app_private.operation_requests where enqueue_sequence<=$1",
          [transition.cutoff],
        )
      ).rows[0].n,
    );
    const switched = await Promise.all(
      Array.from({ length: 8 }, () =>
        pool.query("select app_private.finalize_adt_transition($1,$2) epoch", [
          company,
          transition.id,
        ]),
      ),
    );
    assert.ok(switched.every((x) => x.rows[0].epoch === "2"));
    assert.equal(
      (
        await pool.query("select app_private.claim_operation($1,'adt',1) r", [
          company,
        ])
      ).rows[0].r,
      null,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from app_private.operation_requests where authority is null",
        )
      ).rows[0].n,
      0,
    );
    console.log(
      "PASS exclusive claims, old-epoch denial and atomic idempotent switch",
    );

    // A rollback after a real business effect must restore the queued state too.
    const cancelled = await pool.connect();
    try {
      await cancelled.query("begin");
      const executed = (
        await cancelled.query(
          "select app_private.execute_saas_customer_operation($1,2) r",
          [company],
        )
      ).rows[0].r;
      assert.equal(executed.status, "succeeded");
      await cancelled.query("rollback");
    } finally {
      cancelled.release();
    }
    assert.equal(
      (await pool.query("select count(*)::int n from public.customers")).rows[0]
        .n,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from app_private.operation_effects",
        )
      ).rows[0].n,
      0,
    );
    const outcomes = await Promise.all(
      Array.from({ length: held + 8 }, () =>
        pool.query(
          "select app_private.execute_saas_customer_operation($1,2) r",
          [company],
        ),
      ),
    );
    assert.equal(
      outcomes.filter((x) => x.rows[0].r?.status === "succeeded").length,
      held,
    );
    assert.equal(
      (await pool.query("select count(*)::int n from public.customers")).rows[0]
        .n,
      held,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from app_private.operation_effects",
        )
      ).rows[0].n,
      held,
    );
    const completed = (
      await pool.query(
        "select id,payload from app_private.operation_requests where authority='saas' limit 1",
      )
    ).rows[0];
    assert.equal(
      (await enqueue(completed.id, completed.payload)).status,
      "succeeded",
    );
    assert.equal(
      (await pool.query("select count(*)::int n from public.customers")).rows[0]
        .n,
      held,
    );
    console.log(
      "PASS business effect, change record and receipt commit together; lost response retry is harmless",
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
