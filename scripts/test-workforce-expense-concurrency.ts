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
    const submit = (c: PoolClient, amount = "12.34", payer = "propio") =>
      c.query(
        "select submit_workforce_expense($1,$2,$3,$4,$5,$6,'MATERIALS','Synthetic expense',$7,$8) data",
        [company, request, id, project, at, amount, receipt, payer],
      );
    const submitted = await Promise.all(
      Array.from({ length: 8 }, () => as(worker.user, (c) => submit(c))),
    );
    assert(submitted.every((x) => x.rows[0].data.id === id));
    await assert.rejects(
      as(worker.user, (c) => submit(c, "99")),
      /request_conflict/,
    );
    await assert.rejects(
      as(worker.user, (c) => submit(c, "12.34", "empresa")),
      /request_conflict/,
    );
    const payerSaved = (
      await pool.query(
        "select pay_method,pay_method_set_by,pay_method_set_at from workforce_expenses where id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(payerSaved.pay_method, "propio");
    assert.equal(payerSaved.pay_method_set_by, worker.user);
    assert(payerSaved.pay_method_set_at);
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
    // Race cost allocation with the office approval on one version. Neither may overwrite the other.
    const generalId = randomUUID();
    const generalReceipt = await as(worker.user, async (c) => {
      const receipt = (
        await c.query(
          "select (prepare_workforce_receipt($1,$2,$3,33,'png','General-QA.png')).id",
          [company, generalId, "b".repeat(64)],
        )
      ).rows[0].id as string;
      await c.query(
        "insert into storage.objects(bucket_id,name) values('workforce-receipts',$1)",
        [`${company}/${generalId}/${receipt}.png`],
      );
      await c.query(
        "select submit_workforce_expense($1,$2,$3,$4,now(),12.34,'MATERIALS','Synthetic general allocation',$5,'propio')",
        [company, randomUUID(), generalId, project, receipt],
      );
      return receipt;
    });
    const generalDecision = (
      c: PoolClient,
      req: string,
      version: number,
      decision: string,
    ) =>
      c.query(
        "select decide_workforce_expense($1,$2,$3,$4,$5,'Synthetic general allocation') data",
        [company, req, generalId, version, decision],
      );
    await as(foreman.user, (c) =>
      generalDecision(c, randomUUID(), 1, "APPROVE"),
    );
    const generalRequest = randomUUID();
    const generalRace = await Promise.allSettled([
      as(office.user, (c) =>
        generalDecision(c, generalRequest, 2, "RECLASSIFY_GENERAL"),
      ),
      as(office.user, (c) => generalDecision(c, randomUUID(), 2, "APPROVE")),
    ]);
    assert.equal(generalRace.filter((x) => x.status === "fulfilled").length, 1);
    const generalFailed = generalRace.find(
      (x) => x.status === "rejected",
    ) as PromiseRejectedResult;
    assert.equal(generalFailed.reason.code, "PT409");
    assert.match(generalFailed.reason.message, /record_conflict/);
    const generalWon = generalRace[0].status === "fulfilled";
    const repeatVersion = generalWon ? 2 : 3;
    const generalRetries = await Promise.all(
      Array.from({ length: 8 }, () =>
        as(office.user, (c) =>
          generalDecision(
            c,
            generalRequest,
            repeatVersion,
            "RECLASSIFY_GENERAL",
          ),
        ),
      ),
    );
    assert(
      generalRetries.every((x) => x.rows[0].data.allocation === "GENERAL"),
    );
    if (generalWon)
      await as(office.user, (c) =>
        generalDecision(c, randomUUID(), 3, "APPROVE"),
      );
    const generalSaved = (
      await pool.query("select * from workforce_expenses where id=$1", [
        generalId,
      ])
    ).rows[0];
    assert.equal(generalSaved.version, 4);
    assert.equal(generalSaved.status, "OFFICE_APPROVED");
    assert.equal(generalSaved.allocation, "GENERAL");
    assert.equal(generalSaved.project_id, project);
    assert.equal(generalSaved.receipt_id, generalReceipt);
    assert.equal(generalSaved.amount, "12.34");
    assert.equal(generalSaved.foreman_by, foreman.user);
    assert.equal(generalSaved.office_by, office.user);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from audit_events where entity='workforce_expenses' and entity_id=$1",
          [generalId],
        )
      ).rows[0].n,
      4,
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
    const reasonRace = await Promise.allSettled(
      ["Corrected synthetic reason A", "Corrected synthetic reason B"].map(
        (reason) =>
          as(office.user, (c) =>
            c.query(
              "select decide_workforce_expense($1,$2,$3,4,'RECLASSIFY_GENERAL',$4) data",
              [company, randomUUID(), generalId, reason],
            ),
          ),
      ),
    );
    assert.equal(reasonRace.filter((x) => x.status === "fulfilled").length, 1);
    const reasonFailed = reasonRace.find(
      (x) => x.status === "rejected",
    ) as PromiseRejectedResult;
    assert.equal(reasonFailed.reason.code, "PT409");
    assert.match(reasonFailed.reason.message, /record_conflict/);
    const reasonSaved = (
      await pool.query("select * from workforce_expenses where id=$1", [
        generalId,
      ])
    ).rows[0];
    assert.equal(reasonSaved.version, 5);
    assert.equal(reasonSaved.status, "OFFICE_APPROVED");
    assert.equal(reasonSaved.amount, "12.34");
    assert.equal(reasonSaved.receipt_id, generalReceipt);
    assert.equal(reasonSaved.project_id, project);
    assert(
      ["Corrected synthetic reason A", "Corrected synthetic reason B"].includes(
        reasonSaved.general_reason,
      ),
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from audit_events where entity='workforce_expenses' and entity_id=$1",
          [generalId],
        )
      ).rows[0].n,
      5,
    );
    await as(owner, (c) =>
      c.query(
        "select configure_workforce($1,$2,$3,1,'FOREMAN',null,true,'Synthetic revocation')",
        [company, randomUUID(), office.id],
      ),
    );
    await assert.rejects(
      as(office.user, (c) =>
        generalDecision(c, generalRequest, repeatVersion, "RECLASSIFY_GENERAL"),
      ),
      /expense_forbidden/,
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
        payerBoundToIdempotentPayload: true,
        parallelFirstDecisionRetries: 8,
        secondDecisionWinners: 1,
        auditEffects: 3,
        parallelGeneralRetries: 8,
        generalApprovalRaceWinners: 1,
        generalAuditEffects: 5,
        concurrentReasonUpdateWinners: 1,
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
