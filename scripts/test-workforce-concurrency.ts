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
      max: 10,
      statement_timeout: 30000,
    }),
    owner = randomUUID(),
    company = randomUUID(),
    worker = randomUUID();
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
  const profile = (
    c: PoolClient,
    request: string,
    version = 0,
    role = "WORKER",
  ) =>
    c.query(
      "select public.configure_workforce($1,$2,$3,$4,$5,null,true,'Synthetic concurrency')",
      [company, request, worker, version, role],
    );
  const auditCount = async (entity: string) =>
    (
      await pool.query(
        "select count(*)::int n from audit_events where company_id=$1 and entity=$2",
        [company, entity],
      )
    ).rows[0].n;
  try {
    await pool.query("insert into auth.users values($1,$2,now())", [
      owner,
      `${owner}@example.test`,
    ]);
    await actor(async (c) => {
      await c.query(
        "select public.create_company($1,'Workforce concurrency QA')",
        [company],
      );
      await c.query("select public.save_worker($1,$2,0,$3)", [
        company,
        worker,
        JSON.stringify({
          name: "Synthetic worker",
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
    });
    const request = randomUUID();
    await Promise.all(
      Array.from({ length: 8 }, () => actor((c) => profile(c, request))),
    );
    assert.equal(await auditCount("workforce_profiles"), 1);
    const raced = await Promise.allSettled([
      actor((c) => profile(c, randomUUID(), 1, "FOREMAN")),
      actor((c) => profile(c, randomUUID(), 1, "OFFICE")),
    ]);
    assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(
      String(raced.find((r) => r.status === "rejected")?.reason),
      /record_conflict/,
    );
    assert.equal(await auditCount("workforce_profiles"), 2);
    // Abort before commit: neither row version, audit nor idempotent receipt survives.
    const aborted = randomUUID();
    await assert.rejects(
      actor(async (c) => {
        await profile(c, aborted, 2);
        throw new Error("synthetic-abort");
      }),
      /synthetic-abort/,
    );
    assert.equal(await auditCount("workforce_profiles"), 2);
    await actor((c) => profile(c, aborted, 2));
    assert.equal(await auditCount("workforce_profiles"), 3);
    const customer = randomUUID(),
      estimate = randomUUID();
    const project = await actor(async (c) => {
      await c.query("select public.save_customer($1,$2,0,$3)", [
        company,
        customer,
        JSON.stringify({ full_name: "Synthetic", email: "", status: "active" }),
      ]);
      await c.query("select public.save_estimate($1,$2,0,$3)", [
        company,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: "2026-09-29",
          valid_until: null,
          status: "BORRADOR",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "QA", unit_price: "100.00" }],
        }),
      ]);
      await c.query(
        "select public.approve_estimate($1,$2,1,'2026-09-29','Synthetic project','Local test')",
        [company, estimate],
      );
      return (
        await c.query(
          "select id from projects where company_id=$1 and estimate_id=$2",
          [company, estimate],
        )
      ).rows[0].id;
    });
    const assign = (c: PoolClient, id: string, req: string) =>
      c.query(
        "select public.save_workforce_assignment_days($1,$2,$3,0,$4,$5,'2026-09-29',null,true,'Synthetic concurrency')",
        [company, req, id, worker, project],
      );
    const overlap = await Promise.allSettled([
      actor((c) => assign(c, randomUUID(), randomUUID())),
      actor((c) => assign(c, randomUUID(), randomUUID())),
    ]);
    assert.equal(overlap.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(
      String(overlap.find((r) => r.status === "rejected")?.reason),
      /assignment_overlap/,
    );
    assert.equal(await auditCount("workforce_assignments"), 1);
    const saved = (
      await pool.query(
        "select id from workforce_assignments where company_id=$1",
        [company],
      )
    ).rows[0].id;
    const revoke = randomUUID();
    const revokeCall = (c: PoolClient) =>
      c.query(
        "select public.save_workforce_assignment_days($1,$2,$3,1,$4,$5,'2026-09-29',null,false,'Synthetic revoke')",
        [company, revoke, saved, worker, project],
      );
    await Promise.all(Array.from({ length: 8 }, () => actor(revokeCall)));
    assert.equal(await auditCount("workforce_assignments"), 2);
    assert.equal(
      (
        await pool.query(
          "select version,active from workforce_assignments where id=$1",
          [saved],
        )
      ).rows[0].version,
      2,
    );
    // Fresh GPS is checked inside the serialized clock operation, not only in UI.
    await actor((c) =>
      c.query("select public.link_worker_login($1,$2,1,$3)", [
        company,
        worker,
        `${owner}@example.test`,
      ]),
    );
    const clockEntry = randomUUID();
    const punch = (
      c: PoolClient,
      action: string,
      id = clockEntry,
      accuracy = 25,
    ) =>
      c.query(
        "select public.punch_time($1,$2,$3,$4,jsonb_build_object('lat',25.75,'lng',-80.30,'acc',$5::numeric,'gps_ts',floor(extract(epoch from clock_timestamp()))*1000))",
        [company, id, action, project, accuracy],
      );
    await assert.rejects(
      actor((c) =>
        c.query("select public.punch_time($1,$2,'IN',$3)", [
          company,
          clockEntry,
          project,
        ]),
      ),
      /gps_required/,
    );
    await assert.rejects(
      actor((c) => punch(c, "IN", clockEntry, 101)),
      /gps_required/,
    );
    assert.equal(await auditCount("time_entries"), 0);
    await Promise.all(
      Array.from({ length: 8 }, () => actor((c) => punch(c, "IN"))),
    );
    assert.equal(await auditCount("time_entries"), 1);
    await assert.rejects(
      actor((c) => punch(c, "IN", randomUUID())),
      /time_overlap/,
    );
    const before = (
      await pool.query(
        "select to_jsonb(t) data from time_entries t where id=$1",
        [clockEntry],
      )
    ).rows[0].data;
    await assert.rejects(
      actor((c) => punch(c, "OUT", clockEntry, 101)),
      /gps_required/,
    );
    assert.deepEqual(
      (
        await pool.query(
          "select to_jsonb(t) data from time_entries t where id=$1",
          [clockEntry],
        )
      ).rows[0].data,
      before,
    );
    await Promise.all(
      Array.from({ length: 8 }, () => actor((c) => punch(c, "OUT"))),
    );
    assert.equal(await auditCount("time_entries"), 2);
    const closed = (
      await pool.query(
        "select version,gps_in,gps_out,ends_at,created_by from time_entries where id=$1",
        [clockEntry],
      )
    ).rows[0];
    assert.equal(closed.version, 2);
    assert.ok(closed.ends_at);
    assert.equal(closed.gps_in.acc, 25);
    assert.equal(closed.gps_out.acc, 25);
    assert.equal(closed.created_by, owner);
    // Fully paid job: parallel retries must preserve the first visit reason.
    await actor(async (c) => {
      const invoice = (
        await c.query(
          "select id,version from invoices where company_id=$1 and project_id=$2",
          [company, project],
        )
      ).rows[0];
      await c.query("select record_payment($1,$2,$3,$4,$5)", [
        company,
        randomUUID(),
        invoice.id,
        invoice.version,
        JSON.stringify({
          amount: "100.00",
          payment_date: "2026-10-06",
          method: "OTRO",
          reference: "Synthetic visit concurrency",
          notes: "Fictitious CI payment",
        }),
      ]);
    });
    const visit = randomUUID();
    const visitPunch = (c: PoolClient, action: string, reason: string) =>
      c.query(
        "select punch_time($1,$2,$3,$4,jsonb_build_object('lat',25.75,'lng',-80.30,'acc',25,'gps_ts',floor(extract(epoch from clock_timestamp()))*1000),$5)",
        [company, visit, action, project, reason],
      );
    await assert.rejects(
      actor((c) => punch(c, "IN", visit)),
      /visit_reason_required/,
    );
    const visits = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        actor((c) => visitPunch(c, "IN", i % 2 ? "garantia" : "limpieza")),
      ),
    );
    assert.equal(visits.filter((x) => x.status === "fulfilled").length, 4);
    for (const result of visits)
      if (result.status === "rejected")
        assert.match(String(result.reason), /request_conflict/);
    assert.equal(await auditCount("time_entries"), 3);
    const visitBefore = (
      await pool.query(
        "select to_jsonb(t) data from time_entries t where id=$1",
        [visit],
      )
    ).rows[0].data;
    assert.equal(visitBefore.punch_project_state, "terminado");
    assert.ok(["garantia", "limpieza"].includes(visitBefore.visit_reason));
    await Promise.all(
      Array.from({ length: 8 }, () =>
        actor((c) => visitPunch(c, "OUT", "remodelacion")),
      ),
    );
    const visitClosed = (
      await pool.query(
        "select to_jsonb(t) data from time_entries t where id=$1",
        [visit],
      )
    ).rows[0].data;
    assert.equal(visitClosed.visit_reason, visitBefore.visit_reason);
    assert.equal(visitClosed.project_id, project);
    assert.equal(visitClosed.version, 2);
    assert.equal(await auditCount("time_entries"), 4);
    console.log(
      "PASS Completed visits: eight competing IN requests retain one reason and one audit; eight OUT retries retain the project/reason and write one close audit",
    );
    console.log(
      "PASS Clock GPS: native PostgreSQL; legacy/missing and inaccurate location rejected; eight concurrent IN and OUT retries; exactly one entry, two audits and immutable samples",
    );
    console.log(
      "PASS Workforce: eight profile retries; competing versions; abort and lost response; concurrent overlap exclusion; eight revoke retries; one effect, audit and receipt per accepted command",
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Workforce concurrency failed",
  );
  process.exitCode = 1;
});
