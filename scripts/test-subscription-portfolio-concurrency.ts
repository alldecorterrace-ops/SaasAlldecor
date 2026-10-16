import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { emptyItem } from "../src/lib/estimates";

// Run after test-queue-concurrency: only its isolated, synthetic database is accepted.
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
    run: (client: PoolClient) => Promise<T>,
    role = "authenticated",
    user = owner,
  ) => {
    assert.ok(["authenticated", "service_role"].includes(role));
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      await c.query(`set local role ${role}`);
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
  const assertRace = <T>(
    results: PromiseSettledResult<T>[],
    winners: number,
    reason: RegExp,
  ) => {
    assert.equal(
      results.filter((r) => r.status === "fulfilled").length,
      winners,
    );
    for (const result of results)
      if (result.status === "rejected")
        assert.match(String(result.reason), reason);
  };
  const invite = (company: string, address: string) =>
    actor((c) =>
      c.query(
        "select invite_company_user($1,$2,$3,'member','{\"clientes\":[\"read\"]}') id",
        [company, randomUUID(), address],
      ),
    );
  try {
    await pool.query("insert into auth.users values($1,$2,now())", [
      owner,
      email,
    ]);
    // The suite preapproves legacy fixture managers; this purchaser uses only billing.
    await pool.query("delete from platform_accounts where user_id=$1", [owner]);
    await actor(async (c) => {
      await c.query(
        "select prepare_billing_order($1,$2,'Synthetic shared plan','equipo','test')",
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

    // Different company IDs compete for the last two places under one order lock.
    const companies = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        actor(async (c) => {
          const id = randomUUID();
          await c.query(
            "select create_subscription_company($1,$2,'Synthetic additional company')",
            [order, id],
          );
          return id;
        }),
      ),
    );
    assertRace(companies, 2, /subscription_company_limit/);
    const allCompanies = [
      order,
      ...companies.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    ];

    // Pending invitations to the same email in different companies use one place.
    const sharedUser = randomUUID(),
      sharedEmail = `${sharedUser}@example.test`;
    await Promise.all(
      allCompanies.map((company) => invite(company, sharedEmail)),
    );
    const seats = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        invite(allCompanies[i % 3], `${randomUUID()}@example.test`),
      ),
    );
    assertRace(seats, 3, /subscription_user_limit/);
    await pool.query("insert into auth.users values($1,$2,now())", [
      sharedUser,
      sharedEmail,
    ]);
    const invitations = (
      await pool.query("select id from company_invitations where email=$1", [
        sharedEmail,
      ])
    ).rows;
    await Promise.all(
      invitations.map(({ id }) =>
        actor(
          (c) => c.query("select respond_company_invitation($1,true)", [id]),
          "authenticated",
          sharedUser,
        ),
      ),
    );
    const summary = async () =>
      (
        await actor((c) =>
          c.query("select company_subscription_summary($1) value", [order]),
        )
      ).rows[0].value;
    assert.equal((await summary()).active_users, 2);
    assert.equal((await summary()).pending_invitations, 3);

    // The same account may be active in several companies; all three reactivations
    // use one identity and remain safe while a new identity competes for its place.
    for (const company of allCompanies)
      await actor((c) =>
        c.query(
          "select set_member_access($1,$2,'member',false,'{\"clientes\":[\"read\"]}')",
          [company, sharedUser],
        ),
      );
    const memberships = await Promise.allSettled([
      ...allCompanies.map((company) =>
        actor((c) =>
          c.query(
            "select set_member_access($1,$2,'member',true,'{\"clientes\":[\"read\"]}')",
            [company, sharedUser],
          ),
        ),
      ),
      invite(order, `${randomUUID()}@example.test`),
    ]);
    for (const result of memberships)
      if (result.status === "rejected")
        assert.match(String(result.reason), /subscription_user_limit/);
    const afterMemberships = await summary();
    assert.equal(
      afterMemberships.active_users + afterMemberships.pending_invitations,
      5,
    );

    const customers = new Map<string, string>();
    for (const company of allCompanies) {
      const id = randomUUID();
      customers.set(company, id);
      await actor((c) =>
        c.query("select save_customer($1,$2,0,$3)", [
          company,
          id,
          JSON.stringify({
            full_name: "Synthetic quota customer",
            status: "active",
          }),
        ]),
      );
    }
    const estimate = (company: string) =>
      actor(async (c) => {
        const id = randomUUID();
        await c.query("select save_estimate($1,$2,0,$3)", [
          company,
          id,
          JSON.stringify({
            customer_id: customers.get(company),
            status: "PENDIENTE",
            estimate_date: "2026-01-02",
            valid_until: null,
            discount: "0",
            taxes: "0",
            notes: "Synthetic concurrency test",
            items: [
              { ...emptyItem, name: "Synthetic service", unit_price: "100" },
            ],
          }),
        ]);
        return { company, id };
      });
    const approve = (e: { company: string; id: string }) =>
      actor(
        async (c) =>
          (
            await c.query(
              "select approve_estimate($1,$2,1,'2026-01-02','Synthetic concurrent job','Quota test') id",
              [e.company, e.id],
            )
          ).rows[0].id as string,
      );
    for (let i = 0; i < 98; i++)
      await approve(await estimate(allCompanies[i % 3]));
    const competingEstimates = await Promise.all(
      Array.from({ length: 12 }, (_, i) => estimate(allCompanies[i % 3])),
    );
    const invoices = await Promise.allSettled(competingEstimates.map(approve));
    assertRace(invoices, 2, /subscription_invoice_limit/);
    assert.equal((await summary()).invoices_this_month, 100);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from invoices where company_id=any($1::uuid[])",
          [allCompanies],
        )
      ).rows[0].n,
      100,
    );
    for (let i = 0; i < invoices.length; i++) {
      const result = invoices[i],
        e = competingEstimates[i];
      if (result.status === "fulfilled")
        assert.equal(
          await approve(e),
          result.value,
          "Replay at quota must reuse the invoice",
        );
      else {
        assert.equal(
          (await pool.query("select status from estimates where id=$1", [e.id]))
            .rows[0].status,
          "PENDIENTE",
        );
        assert.equal(
          (
            await pool.query("select id from projects where estimate_id=$1", [
              e.id,
            ])
          ).rows.length,
          0,
        );
      }
    }
    console.log(
      "Portfolio concurrency: exactly 3 companies, 5 distinct people and 100 monthly invoices across companies; failed approvals roll back and retries reuse invoices",
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
