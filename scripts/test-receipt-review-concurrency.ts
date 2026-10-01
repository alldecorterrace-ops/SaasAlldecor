import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  receiptReviewFixture,
  type ReceiptTestDb,
} from "../tests/helpers/receipt-review-fixture";
import {
  compareReceipt,
  type ReceiptReviewContext,
} from "../src/lib/receipt-review";
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
  });
  const setup = await pool.connect();
  const db: ReceiptTestDb = {
    query: async <T>(sql: string, args?: unknown[]) => ({
      rows: (await setup.query(sql, args)).rows as T[],
    }),
    exec: async (sql: string) => setup.query(sql),
  };
  const actor = async <T>(
    user: string,
    role: string,
    run: (c: PoolClient) => Promise<T>,
  ) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      await c.query("set local role " + role);
      const value = await run(c);
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
    const f = await receiptReviewFixture(db);
    await setup.query("reset role");
    await setup.query(
      "insert into time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,source,created_by,updated_by) values($1,$2,$3,$4,now()-interval '1 hour',now(),'MANUAL',$5,$5)",
      [randomUUID(), f.a, f.worker.id, f.project, f.owner],
    );
    const prepare = (
      e: { company: string; id: string },
      version: number,
      request = randomUUID(),
    ) =>
      actor(
        f.owner,
        "authenticated",
        async (c) =>
          (
            await c.query(
              "select prepare_workforce_receipt_review($1,$2,$3,$4) data",
              [e.company, request, e.id, version],
            )
          ).rows[0].data,
      );
    const analyze = async (
      e: { company: string; id: string },
      j: { job: string },
      invoice = e.id,
    ) => {
      await f.as(f.owner);
      const context = await f.context(e.company, j.job);
      return {
        context,
        result: compareReceipt(
          {
            es_recibo: true,
            legible: true,
            comercio: "Synthetic concurrency merchant",
            direccion_comercio: "",
            fecha: f.day,
            total: 100,
            subtotal: 90,
            impuesto: 10,
            moneda: "USD",
            numero_factura: invoice,
            metodo_pago: "cash",
            tarjeta_ult4: "",
          },
          context,
        ),
      };
    };
    const finish = (
      e: { company: string },
      j: { job: string; claim: string },
      v: {
        context: ReceiptReviewContext;
        result: ReturnType<typeof compareReceipt>;
      },
    ) =>
      actor(
        "",
        "service_role",
        async (c) =>
          (
            await c.query(
              "select finish_workforce_receipt_review($1,$2,$3,$4,$5,'synthetic-reference','source-reference-v4','synthetic-concurrency',null) data",
              [e.company, j.job, j.claim, v.context, v.result],
            )
          ).rows[0].data,
      );
    const e = await f.create(),
      request = randomUUID();
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => prepare(e, 1, request)),
    );
    assert.equal(claims.filter((x) => x.claimed).length, 1);
    assert.equal(new Set(claims.map((x) => x.job)).size, 1);
    const j = claims.find((x) => x.claimed),
      v = await analyze(e, j);
    assert.equal(v.result.state, "OK");
    const results = await Promise.all(
      Array.from({ length: 8 }, () => finish(e, j, v)),
    );
    assert(results.every((x) => x.status === "DONE" && x.version === 3));
    const confirmRequest = randomUUID();
    const confirms = await Promise.all(
      Array.from({ length: 8 }, () =>
        actor(f.owner, "authenticated", (c) =>
          c.query(
            "select confirm_workforce_receipt_review($1,$2,$3,3,$4,'Synthetic concurrent visual check') data",
            [e.company, confirmRequest, e.id, j.job],
          ),
        ),
      ),
    );
    assert(confirms.every((x) => x.rows[0].data.version === 4));
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from audit_events where entity='workforce_expenses' and entity_id=$1",
          [e.id],
        )
      ).rows[0].n,
      4,
    );
    const first = await f.create(f.a, f.worker, f.project, "f".repeat(64)),
      second = await f.create(f.a, f.worker, f.project, "f".repeat(64));
    const jobs = await Promise.all([prepare(first, 1), prepare(second, 1)]);
    const values = [
      await analyze(first, jobs[0]),
      await analyze(second, jobs[1]),
    ];
    await Promise.all([
      finish(first, jobs[0], values[0]),
      finish(second, jobs[1], values[1]),
    ]);
    const duplicate = (
      await pool.query(
        "select result from app_private.workforce_receipt_reviews where id=any($1::uuid[])",
        [jobs.map((x) => x.job)],
      )
    ).rows;
    assert.equal(
      duplicate.filter((x) => x.result.duplicate_of !== null).length,
      1,
    );
    assert.equal(duplicate.filter((x) => x.result.state === "OK").length, 1);
    const fingerprintA = await f.create(),
      fingerprintB = await f.create();
    const fingerprintJobs = await Promise.all([
      prepare(fingerprintA, 1),
      prepare(fingerprintB, 1),
    ]);
    const fingerprintValues = [
      await analyze(fingerprintA, fingerprintJobs[0], "SHARED-INVOICE"),
      await analyze(fingerprintB, fingerprintJobs[1], "SHARED-INVOICE"),
    ];
    await Promise.all([
      finish(fingerprintA, fingerprintJobs[0], fingerprintValues[0]),
      finish(fingerprintB, fingerprintJobs[1], fingerprintValues[1]),
    ]);
    const fingerprints = (
      await pool.query(
        "select result from app_private.workforce_receipt_reviews where id=any($1::uuid[])",
        [fingerprintJobs.map((x) => x.job)],
      )
    ).rows;
    assert.equal(
      fingerprints.filter((x) => x.result.duplicate_of !== null).length,
      1,
    );
    const raceExpense = await f.create(),
      raceJob = await prepare(raceExpense, 1),
      raceValue = await analyze(raceExpense, raceJob);
    const race = await Promise.allSettled([
      finish(raceExpense, raceJob, raceValue),
      actor(f.owner, "authenticated", (c) =>
        c.query(
          "select correct_workforce_expense($1,$2,$3,2,$4,false,$5,101,'TOOLS','Synthetic correction wins','propio',$6,'Synthetic concurrent correction')",
          [
            f.a,
            randomUUID(),
            raceExpense.id,
            f.project,
            f.day,
            raceExpense.receipt,
          ],
        ),
      ),
    ]);
    assert.equal(race[0].status, "fulfilled");
    const saved = await f.row(raceExpense.id);
    assert.equal(saved.version, 3);
    const correctionWon = race[1].status === "fulfilled";
    if (correctionWon) {
      assert.equal(
        (race[0] as PromiseFulfilledResult<{ status: string }>).value.status,
        "STALE",
      );
      assert.equal(saved.amount, "101.00");
      assert.equal(saved.receipt_review_id, null);
      assert.equal(saved.admin_review_status, "REVIEWED");
    } else {
      assert.equal(
        (race[0] as PromiseFulfilledResult<{ status: string }>).value.status,
        "DONE",
      );
      assert.equal((race[1] as PromiseRejectedResult).reason.code, "PT409");
      assert.equal(saved.amount, "100.00");
      assert.equal(saved.admin_review_status, "PENDING");
    }
    for (const table of ["expenses", "payments"])
      assert.equal(
        (
          await pool.query(
            `select count(*)::int n from ${table} where company_id=$1`,
            [f.a],
          )
        ).rows[0].n,
        0,
      );
    console.log(
      JSON.stringify({
        receiptReviewConcurrency: true,
        parallelClaims: 8,
        claims: 1,
        parallelFinishes: 8,
        finishEffects: 1,
        parallelHumanConfirmations: 8,
        humanEffects: 1,
        duplicateShaUniqueWinners: 1,
        duplicateInvoiceUniqueWinners: 1,
        correctionRacePreserved: true,
        noPayment: true,
      }),
    );
  } finally {
    await setup.query("reset role");
    setup.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
