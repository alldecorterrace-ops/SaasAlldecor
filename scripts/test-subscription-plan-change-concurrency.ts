import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

async function main() {
  const url = new URL(process.env.QUEUE_TEST_DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/saas_queue_test"
  )
    throw new Error("Dedicated loopback test database required");
  const pool = new Pool({
    connectionString: url.href,
    max: 12,
    statement_timeout: 30000,
  });
  const owner = randomUUID(),
    order = randomUUID(),
    email = `${owner}@example.test`;
  const actor = async <T>(
    run: (c: PoolClient) => Promise<T>,
    role = "authenticated",
  ) => {
    assert.ok(["authenticated", "service_role"].includes(role));
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await c.query(`set local role ${role}`);
      const value = await run(c);
      await c.query("commit");
      return value;
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  };
  try {
    await pool.query("insert into auth.users values($1,$2,now())", [
      owner,
      email,
    ]);
    await actor(async (c) => {
      await c.query(
        "select prepare_billing_order($1,$2,'Plan change concurrency','equipo','test')",
        [order, email],
      );
      await c.query("select attach_billing_checkout($1,$2)", [
        order,
        `cs_test_${order.replaceAll("-", "")}`,
      ]);
      await c.query("select apply_billing_snapshot($1,1900000000,$2,$3)", [
        `evt_${order.replaceAll("-", "")}`,
        "a".repeat(64),
        JSON.stringify({
          order_id: order,
          catalog_version: "20261016",
          mode: "test",
          plan_code: "equipo",
          customer_id: `cus_${order.replaceAll("-", "")}`,
          subscription_id: `sub_${order.replaceAll("-", "")}`,
          checkout_id: `cs_test_${order.replaceAll("-", "")}`,
          email,
          status: "active",
          paid: true,
          paid_through: new Date(Date.now() + 30 * 86400000).toISOString(),
          initial: true,
          cancel_at_period_end: false,
        }),
      ]);
    }, "service_role");
    await actor((c) => c.query("select activate_my_paid_companies()"));
    const prepare = (id: string) =>
      actor((c) =>
        c.query("select prepare_company_plan_change($1,$2,'inicial','test')", [
          order,
          id,
        ]),
      );
    const requests = Array.from({ length: 8 }, () => randomUUID());
    const race = await Promise.allSettled(requests.map(prepare));
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const request = requests[race.findIndex((r) => r.status === "fulfilled")];
    for (const r of race)
      if (r.status === "rejected")
        assert.match(String(r.reason), /billing_plan_change_conflict/);
    const now = Math.floor(Date.now() / 1000);
    await actor(
      (c) =>
        c.query("select attach_plan_change_quote($1,$2)", [
          request,
          JSON.stringify({
            currency: "usd",
            due_cents: 0,
            item_id: "si_concurrency",
            period_start: now - 86400,
            period_end: now + 30 * 86400,
            proration_date: now,
          }),
        ]),
      "service_role",
    );
    const competing = await Promise.allSettled([
      actor((c) =>
        c.query("select company_plan_change($1,$2,true)", [order, request]),
      ),
      actor((c) =>
        c.query(
          "select invite_company_user($1,$2,$3,'member','{\"clientes\":[\"read\"]}')",
          [order, randomUUID(), `${randomUUID()}@example.test`],
        ),
      ),
      actor((c) =>
        c.query(
          "select create_subscription_company($1,$2,'Concurrent company')",
          [order, randomUUID()],
        ),
      ),
    ]);
    const confirmed = competing[0].status === "fulfilled";
    if (confirmed)
      assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
    else
      assert.match(
        String((competing[0] as PromiseRejectedResult).reason),
        /subscription_(user|company)_limit/,
      );
    const row = (
      await pool.query("select status from billing_plan_changes where id=$1", [
        request,
      ])
    ).rows[0];
    assert.equal(row.status, confirmed ? "processing" : "quoted");
    // Confirm/check/cancel cannot race provider mutations: exactly one lease wins.
    const operations = Array.from({ length: 8 }, () => randomUUID());
    const leases = await Promise.allSettled(
      operations.map((id) =>
        actor(
          (c) => c.query("select lease_plan_change($1,$2)", [request, id]),
          "service_role",
        ),
      ),
    );
    assert.equal(leases.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of leases)
      if (r.status === "rejected")
        assert.match(String(r.reason), /operation_busy/);
    const winning =
      operations[leases.findIndex((r) => r.status === "fulfilled")];
    await actor(
      (c) =>
        c.query("select lease_plan_change($1,$2,true)", [request, winning]),
      "service_role",
    );
    await actor(
      (c) =>
        c.query("select lease_plan_change($1,$2)", [request, randomUUID()]),
      "service_role",
    );
    console.log(
      "PASS: one plan-change request, capacity rechecked against concurrent invitation/company, one provider operation lease",
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
