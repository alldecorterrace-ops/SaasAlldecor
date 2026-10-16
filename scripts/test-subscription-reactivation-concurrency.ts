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
    order = randomUUID();
  const actor = async <T>(
    role: "authenticated" | "service_role",
    run: (c: PoolClient) => Promise<T>,
  ) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await c.query(`set local role ${role}`);
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
  const snapshot = {
    order_id: order,
    catalog_version: "20261016",
    mode: "test",
    plan_code: "inicial",
    customer_id: `cus_${order.replaceAll("-", "")}`,
    subscription_id: `sub_${order.replaceAll("-", "")}`,
    checkout_id: `cs_test_${order.replaceAll("-", "")}`,
    email: `${owner}@example.test`,
    status: "active",
    paid: true,
    paid_through: new Date(Date.now() + 30 * 86400000).toISOString(),
    initial: true,
    cancel_at_period_end: false,
  };
  const apply = (
    event: string,
    created: number,
    change: Record<string, unknown>,
  ) =>
    actor("service_role", (c) =>
      c.query("select apply_billing_snapshot($1,$2,$3,$4)", [
        event,
        created,
        "a".repeat(64),
        JSON.stringify({ ...snapshot, ...change }),
      ]),
    );
  try {
    await pool.query("insert into auth.users values($1,$2,now())", [
      owner,
      snapshot.email,
    ]);
    await actor("service_role", async (c) => {
      await c.query(
        "select prepare_billing_order($1,$2,'Concurrent paid company','inicial','test')",
        [order, snapshot.email],
      );
      await c.query("select attach_billing_checkout($1,$2)", [
        order,
        snapshot.checkout_id,
      ]);
    });
    await apply(`evt_${order.replaceAll("-", "")}_original`, 1900000000, {});
    await actor("authenticated", (c) =>
      c.query("select activate_my_paid_companies()"),
    );
    await apply(`evt_${order.replaceAll("-", "")}_cancel`, 1900000001, {
      initial: false,
      status: "canceled",
      paid: false,
    });
    const attempts = await Promise.all(
      Array.from({ length: 16 }, () =>
        actor(
          "authenticated",
          async (c) =>
            (
              await c.query(
                "select prepare_company_reactivation($1,$2,'inicial','test') offer",
                [order, randomUUID()],
              )
            ).rows[0].offer,
        ),
      ),
    );
    assert.equal(
      new Set(attempts.map((r) => r.id)).size,
      1,
      "Concurrent requests must share one pending attempt",
    );
    const attempt = attempts[0].id,
      newCheckout = snapshot.checkout_id + "new",
      newSubscription = snapshot.subscription_id + "new";
    await actor("service_role", (c) =>
      c.query(
        "select attach_reactivation_checkout($1,$2,now()+interval '1 day')",
        [attempt, newCheckout],
      ),
    );
    const replacement = {
      reactivation_id: attempt,
      subscription_id: newSubscription,
      checkout_id: newCheckout,
    };
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        apply(
          `evt_${order.replaceAll("-", "")}_new_${i}`,
          1900000020 + i,
          replacement,
        ),
      ),
    );
    const current = (
      await pool.query("select * from billing_orders where id=$1", [order])
    ).rows[0];
    assert.equal(current.subscription_id, newSubscription);
    assert.equal(current.company_id, order);
    assert.equal(current.owner_id, owner);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from billing_reactivations where order_id=$1 and status='activated'",
          [order],
        )
      ).rows[0].n,
      1,
    );
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        apply(`evt_${order.replaceAll("-", "")}_old_${i}`, 1900000050 + i, {
          initial: false,
          status: "canceled",
          paid: false,
        }),
      ),
    );
    assert.deepEqual(
      (await pool.query("select * from billing_orders where id=$1", [order]))
        .rows[0],
      current,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from billing_event_receipts where order_id=$1",
          [order],
        )
      ).rows[0].n,
      26,
    );
    assert.equal(
      (
        await pool.query("select count(*)::int n from companies where id=$1", [
          order,
        ])
      ).rows[0].n,
      1,
    );
    console.log(
      "Subscription reactivation concurrency: one attempt, one preserved company, one promotion; retired events cannot overwrite it",
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
