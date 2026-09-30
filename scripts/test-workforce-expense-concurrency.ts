import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { emptyItem } from "../src/lib/estimates";
async function main() {
  const url = new URL(process.env.QUEUE_TEST_DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/saas_queue_test"
  )
    throw new Error("Dedicated local test database required");
  const pool = new Pool({
    connectionString: url.href,
    max: 12,
    statement_timeout: 30000,
  });
  const owner = randomUUID(),
    company = randomUUID(),
    worker = { user: randomUUID(), id: randomUUID() },
    foreman = { user: randomUUID(), id: randomUUID() },
    office = { user: randomUUID(), id: randomUUID() };
  const as = async <T>(user: string, run: (c: PoolClient) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      await c.query("set local role authenticated");
      const result = await run(c);
      await c.query("commit");
      return result;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  try {
    for (const user of [owner, worker.user, foreman.user, office.user])
      await pool.query("insert into auth.users values($1,$2,now())", [
        user,
        `${user}@example.test`,
      ]);
    const project = await as(owner, async (c) => {
      await c.query(
        "select create_company($1,'Synthetic Workforce expense concurrency')",
        [company],
      );
      for (const who of [worker, foreman, office]) {
        await c.query("select add_company_member($1,$2)", [
          company,
          `${who.user}@example.test`,
        ]);
        await c.query("select set_member_access($1,$2,'member',true,$3)", [
          company,
          who.user,
          JSON.stringify({ horasfix: ["write"] }),
        ]);
        await c.query("select save_worker($1,$2,0,$3)", [
          company,
          who.id,
          JSON.stringify({
            name: "Synthetic",
            email: "",
            phone: "",
            job_title: "",
            team: "",
            hourly_rate: "0",
            weekly_target: 40,
            active: true,
            notes: "",
          }),
        ]);
        await c.query("select link_worker_login($1,$2,1,$3)", [
          company,
          who.id,
          `${who.user}@example.test`,
        ]);
      }
      await c.query(
        "select configure_workforce($1,$2,$3,0,'FOREMAN',null,true,'Synthetic concurrency')",
        [company, randomUUID(), foreman.id],
      );
      await c.query(
        "select configure_workforce($1,$2,$3,0,'WORKER',$4,true,'Synthetic concurrency')",
        [company, randomUUID(), worker.id, foreman.id],
      );
      await c.query(
        "select configure_workforce($1,$2,$3,0,'OFFICE',null,true,'Synthetic concurrency')",
        [company, randomUUID(), office.id],
      );
      const customer = randomUUID(),
        estimate = randomUUID();
      await c.query("select save_customer($1,$2,0,$3)", [
        company,
        customer,
        JSON.stringify({ full_name: "Synthetic", email: "", status: "active" }),
      ]);
      await c.query("select save_estimate($1,$2,0,$3)", [
        company,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: "2026-09-30",
          valid_until: null,
          status: "BORRADOR",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "QA", unit_price: "100" }],
        }),
      ]);
      await c.query(
        "select approve_estimate($1,$2,1,'2026-09-30','Synthetic concurrency','Local test')",
        [company, estimate],
      );
      const project = (
        await c.query(
          "select id from projects where company_id=$1 and estimate_id=$2",
          [company, estimate],
        )
      ).rows[0].id as string;
      await c.query(
        "select save_workforce_assignment($1,$2,$3,0,$4,$5,now()-interval '1 day',null,true,'Synthetic concurrency')",
        [company, randomUUID(), randomUUID(), worker.id, project],
      );
      return project;
    });
    const id = randomUUID(),
      request = randomUUID(),
      at = new Date().toISOString(),
      hash = "a".repeat(64);
    const prepared = await Promise.all(
      Array.from({ length: 8 }, () =>
        as(worker.user, (c) =>
          c.query(
            "select (prepare_workforce_receipt($1,$2,$3,33,'png','QA.png')).id",
            [company, id, hash],
          ),
        ),
      ),
    );
    const receipt = prepared[0].rows[0].id as string;
    assert(prepared.every((x) => x.rows[0].id === receipt));
    await as(worker.user, (c) =>
      c.query(
        "insert into storage.objects(bucket_id,name) values('workforce-receipts',$1)",
        [`${company}/${id}/${receipt}.png`],
      ),
    );
    const submit = (c: PoolClient, amount = "12.34") =>
      c.query(
        "select submit_workforce_expense($1,$2,$3,$4,$5,$6,'MATERIALS','Synthetic expense',$7) data",
        [company, request, id, project, at, amount, receipt],
      );
    const submitted = await Promise.all(
      Array.from({ length: 8 }, () => as(worker.user, (c) => submit(c))),
    );
    assert(submitted.every((x) => x.rows[0].data.id === id));
    await assert.rejects(
      as(worker.user, (c) => submit(c, "99")),
      /request_conflict/,
    );
    const decide = (
      c: PoolClient,
      whoRequest: string,
      version: number,
      decision = "APPROVE",
    ) =>
      c.query(
        "select decide_workforce_expense($1,$2,$3,$4,$5,'Synthetic decision') data",
        [company, whoRequest, id, version, decision],
      );
    await assert.rejects(
      as(office.user, (c) => decide(c, randomUUID(), 1)),
      /expense_state_invalid/,
    );
    const firstRequest = randomUUID();
    const first = await Promise.all(
      Array.from({ length: 8 }, () =>
        as(foreman.user, (c) => decide(c, firstRequest, 1)),
      ),
    );
    assert(
      first.every(
        (x) =>
          x.rows[0].data.status === "FOREMAN_APPROVED" &&
          x.rows[0].data.version === 2,
      ),
    );
    const race = await Promise.allSettled([
      as(office.user, (c) => decide(c, randomUUID(), 2)),
      as(office.user, (c) => decide(c, randomUUID(), 2, "REJECT")),
    ]);
    assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
    const failed = race.find(
      (x) => x.status === "rejected",
    ) as PromiseRejectedResult;
    assert.equal(failed.reason.code, "PT409");
    assert.match(failed.reason.message, /record_conflict/);
    const saved = (
      await pool.query(
        "select * from workforce_expenses where company_id=$1 and id=$2",
        [company, id],
      )
    ).rows[0];
    assert.equal(saved.version, 3);
    assert(["OFFICE_APPROVED", "REJECTED"].includes(saved.status));
    assert.equal(saved.foreman_by, foreman.user);
    assert.equal(saved.office_by, office.user);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from audit_events where company_id=$1 and entity='workforce_expenses'",
          [company],
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from workforce_receipt_uploads where company_id=$1",
          [company],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from expenses where company_id=$1",
          [company],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from payments where company_id=$1",
          [company],
        )
      ).rows[0].n,
      0,
    );
    await as(owner, (c) =>
      c.query("select set_member_access($1,$2,'member',false,'{}')", [
        company,
        foreman.user,
      ]),
    );
    await assert.rejects(
      as(foreman.user, (c) => decide(c, firstRequest, 1)),
      /permission_denied/,
    );
    console.log(
      JSON.stringify({
        workforceExpenseConcurrency: true,
        parallelReceiptRetries: 8,
        parallelSubmitRetries: 8,
        parallelFirstDecisionRetries: 8,
        secondDecisionWinners: 1,
        auditEffects: 3,
        noPayment: true,
      }),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
