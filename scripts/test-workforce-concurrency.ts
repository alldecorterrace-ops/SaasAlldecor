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
