import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import {
  subscriptionPlans,
  billingCatalogVersion,
} from "../src/lib/subscription-catalog";
import {
  verifyCheckoutPrice,
  verifiedBillingSnapshot,
  type BillingConfig,
} from "../src/lib/subscriptions";

const config: BillingConfig = {
  mode: "test",
  catalogVersion: billingCatalogVersion,
  secret: "sk_test_SYNTHETIC",
  webhookSecret: "whsec_SYNTHETIC",
  serviceKey: "SYNTHETIC",
  site: "https://staging.example.invalid",
  database: "https://abcdefghijklmnopqrst.supabase.co",
  prices: {
    inicial: "price_NewInitial",
    equipo: "price_NewTeam",
    profesional: "price_NewPro",
    crecimiento: "price_NewGrowth",
  },
};
test("Checkout verifies the new amount and recurring price before a customer can pay", async () => {
  for (const plan of subscriptionPlans) {
    const price = {
      id: config.prices[plan.code],
      active: true,
      livemode: false,
      currency: "usd",
      unit_amount: plan.amount,
      recurring: { interval: "month", interval_count: 1 },
    };
    await verifyCheckoutPrice(config, plan.code, async (path) => {
      assert.equal(path, `/prices/${price.id}`);
      return price;
    });
    for (const change of [
      { unit_amount: plan.amount - 1 },
      { active: false },
      { currency: "eur" },
      { livemode: true },
      { recurring: { interval: "year", interval_count: 1 } },
      { id: "price_Other" },
    ])
      await assert.rejects(
        verifyCheckoutPrice(config, plan.code, async () => ({
          ...price,
          ...change,
        })),
      );
  }
  await assert.rejects(
    verifyCheckoutPrice(
      { ...config, catalogVersion: "20261007" },
      "equipo",
      async () => {
        throw new Error("must not call provider");
      },
    ),
    /billing_catalog_not_configured/,
  );
});
test("webhooks keep legacy and current prices tied to separate catalogs", async () => {
  const order = randomUUID();
  const event = JSON.stringify({
    id: "evt_current",
    created: 1900000000,
    livemode: false,
    type: "customer.subscription.updated",
    data: { object: { id: "sub_current" } },
  });
  const subscription = (price: string, amount: number) => ({
    id: "sub_current",
    customer: "cus_current",
    livemode: false,
    status: "active",
    metadata: { saas_order: order },
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: 1902592000,
          price: {
            id: price,
            unit_amount: amount,
            currency: "usd",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
    latest_invoice: { status: "paid", amount_paid: amount, currency: "usd" },
  });
  const current = await verifiedBillingSnapshot(event, config, async () =>
    subscription(config.prices.equipo, 9999),
  );
  assert.equal(current?.snapshot.catalog_version, "20261016");
  const legacy = await verifiedBillingSnapshot(
    event,
    { ...config, legacyPrices: { equipo: "price_OldTeam" } },
    async () => subscription("price_OldTeam", 5900),
  );
  assert.equal(legacy?.snapshot.catalog_version, "20261007");
  await assert.rejects(
    verifiedBillingSnapshot(event, config, async () =>
      subscription(config.prices.equipo, 5900),
    ),
    /billing_price_mismatch/,
  );
});

test("portfolio limits, protected ownership, invoice issuance and tenant isolation are enforced in the database", async (t) => {
  const { db } = await fullDatabase(undefined, { managedOnboarding: true });
  let event = 1900000000;
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const service = () => db.exec("reset role;set role service_role");
  const user = async (prefix: string) => {
    const id = randomUUID(),
      email = `${prefix}-${id}@example.test`;
    await db.exec("reset role");
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    return { id, email };
  };
  const apply = async (snapshot: object) => {
    await service();
    event++;
    await db.query("select apply_billing_snapshot($1,$2,$3,$4)", [
      `evt_${event}`,
      event,
      "a".repeat(64),
      JSON.stringify(snapshot),
    ]);
  };
  const paid = async (code: string) => {
    const buyer = await user(code),
      id = randomUUID();
    await service();
    await db.query(
      "select prepare_billing_order($1,$2,'Synthetic portfolio',$3,'test')",
      [id, buyer.email, code],
    );
    await db.query("select attach_billing_checkout($1,$2)", [
      id,
      `cs_test_${id.replaceAll("-", "")}`,
    ]);
    const state = {
      order_id: id,
      catalog_version: "20261016",
      plan_code: code,
      mode: "test",
      email: buyer.email,
      checkout_id: `cs_test_${id.replaceAll("-", "")}`,
      subscription_id: `sub_${id.replaceAll("-", "")}`,
      customer_id: `cus_${id.replaceAll("-", "")}`,
      status: "active",
      paid: true,
      paid_through: new Date(Date.now() + 30 * 86400000).toISOString(),
      initial: true,
      cancel_at_period_end: false,
    };
    await assert.rejects(
      apply({ ...state, catalog_version: "20261007" }),
      /billing_catalog_mismatch/,
    );
    await apply(state);
    await as(buyer.id);
    await db.query("select activate_my_paid_companies()");
    await db.query("select activate_my_paid_companies()");
    return { buyer, id, state };
  };
  const summary = async (company: string) =>
    (
      await db.query<{ v: Record<string, unknown> }>(
        "select company_subscription_summary($1) v",
        [company],
      )
    ).rows[0].v;
  const invite = async (company: string, email: string, role = "member") => {
    const id = randomUUID();
    await db.query("select invite_company_user($1,$2,$3,$4,$5)", [
      company,
      id,
      email,
      role,
      role === "admin" ? "{}" : '{"clientes":["read"]}',
    ]);
    return id;
  };
  const create = async (order: string, id = randomUUID()) => {
    await db.query(
      "select create_subscription_company($1,$2,'Additional synthetic company')",
      [order, id],
    );
    return id;
  };
  const customers = new Map<string, string>();
  const estimate = async (company: string) => {
    let customer = customers.get(company);
    if (!customer) {
      customer = randomUUID();
      await db.query("select save_customer($1,$2,0,$3)", [
        company,
        customer,
        JSON.stringify({ full_name: "Synthetic buyer", status: "active" }),
      ]);
      customers.set(company, customer);
    }
    const id = randomUUID();
    await db.query("select save_estimate($1,$2,0,$3)", [
      company,
      id,
      JSON.stringify({
        customer_id: customer,
        status: "PENDIENTE",
        estimate_date: "2026-01-02",
        valid_until: null,
        discount: "0",
        taxes: "0",
        notes: "Synthetic quota fixture",
        items: [{ ...emptyItem, name: "Synthetic service", unit_price: "100" }],
      }),
    ]);
    return id;
  };
  const approve = async (company: string, est: string) =>
    (
      await db.query<{ id: string }>(
        "select approve_estimate($1,$2,1,'2026-01-02','Synthetic job','Quota acceptance test') id",
        [company, est],
      )
    ).rows[0].id;
  const invoice = async (company: string) =>
    approve(company, await estimate(company));
  try {
    await t.test(
      "database and storefront use the same exact cents and nullable unlimited caps",
      async () => {
        const rows = (
          await db.query<{
            code: string;
            amount_cents: number;
            user_limit: number | null;
            company_limit: number | null;
            invoice_limit: number | null;
          }>(
            "select * from billing_plan_catalog where catalog_version='20261016'",
          )
        ).rows;
        for (const p of subscriptionPlans) {
          const row = rows.find((r) => r.code === p.code)!;
          assert.equal(row.amount_cents, p.amount);
          assert.equal(row.user_limit, p.users);
          assert.equal(row.company_limit, p.companies);
          assert.equal(row.invoice_limit, p.invoices);
        }
      },
    );
    const team = await paid("equipo");
    const second = await create(team.id),
      third = await create(team.id);
    await t.test(
      "only the buyer creates companies, with an atomic shared cap and safe retries",
      async () => {
        await create(team.id, third);
        await assert.rejects(create(team.id), /subscription_company_limit/);
        assert.equal((await summary(second)).companies, 3);
        await assert.rejects(
          db.query("select create_company($1,'Bypass')", [randomUUID()]),
          /manager_invitation_required/,
        );
        const stranger = await user("stranger");
        await as(stranger.id);
        await assert.rejects(create(team.id), /permission_denied/);
        assert.equal(
          (await db.query("select * from my_subscription_portfolios()")).rows
            .length,
          0,
        );
        assert.equal(
          (
            await db.query<{ v: unknown }>(
              "select company_invoice_allowance($1) v",
              [second],
            )
          ).rows[0].v,
          null,
        );
        await as(team.buyer.id);
      },
    );
    const admin = await user("admin"),
      worker = await user("worker");
    await as(team.buyer.id);
    const adminInvitation = await invite(second, admin.email, "admin");
    const workerInvitation = await invite(team.id, worker.email);
    await invite(third, "reserved-1@example.test");
    await invite(third, "reserved-2@example.test");
    await t.test(
      "five distinct people are shared across companies and duplicate invitations reserve one seat",
      async () => {
        await invite(second, worker.email);
        const s = await summary(team.id);
        assert.equal(s.active_users, 1);
        assert.equal(s.pending_invitations, 4);
        await assert.rejects(
          invite(second, "over-limit@example.test"),
          /subscription_user_limit/,
        );
        await as(admin.id);
        await db.query("select respond_company_invitation($1,true)", [
          adminInvitation,
        ]);
        await assert.rejects(create(team.id), /permission_denied/);
        await assert.rejects(
          db.query("select set_member_access($1,$2,'member',false,'{}')", [
            second,
            team.buyer.id,
          ]),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select add_company_member($1,$2)", [second, worker.email]),
          /invitation_required/,
        );
        await invite(second, "reserved-1@example.test");
        await assert.rejects(
          invite(second, "admin-over-limit@example.test"),
          /subscription_user_limit/,
        );
        await as(worker.id);
        await db.query("select respond_company_invitation($1,true)", [
          workerInvitation,
        ]);
        await assert.rejects(
          invite(team.id, "staff-cannot-invite@example.test"),
          /permission_denied/,
        );
        assert.equal(
          (await db.query("select * from companies where id=$1", [third])).rows
            .length,
          0,
        );
        await as(team.buyer.id);
        assert.equal((await summary(second)).active_users, 3);
        assert.equal((await summary(second)).pending_invitations, 2);
        await db.exec("reset role");
        await assert.rejects(
          db.query(
            "update memberships set active=false where company_id=$1 and user_id=$2",
            [third, team.buyer.id],
          ),
          /subscription_owner_protected/,
        );
        await as(team.buyer.id);
      },
    );
    await t.test(
      "the 100 invoices are shared, retries do not count and an over-limit approval rolls back",
      async () => {
        for (let i = 0; i < 100; i++) await invoice(i % 2 ? second : team.id);
        assert.equal((await summary(third)).invoices_this_month, 100);
        const e = await estimate(third);
        await assert.rejects(approve(third, e), /subscription_invoice_limit/);
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from estimates where id=$1",
              [e],
            )
          ).rows[0].status,
          "PENDIENTE",
        );
        assert.equal(
          (await db.query("select id from projects where estimate_id=$1", [e]))
            .rows.length,
          0,
        );
      },
    );
    await t.test(
      "reactivation checks the entire portfolio and restores the same linked companies",
      async () => {
        await apply({
          ...team.state,
          initial: false,
          paid: false,
          status: "canceled",
        });
        await as(team.buyer.id);
        await assert.rejects(create(team.id), /subscription_inactive/);
        await assert.rejects(
          invite(second, worker.email),
          /permission_denied|subscription_inactive/,
        );
        assert.equal(
          (await db.query("select id from companies")).rows.length,
          3,
        );
        await assert.rejects(
          db.query(
            "select prepare_company_reactivation($1,$2,'inicial','test')",
            [second, randomUUID()],
          ),
          /subscription_user_limit|subscription_company_limit/,
        );
        const attempt = randomUUID();
        await db.query(
          "select prepare_company_reactivation($1,$2,'equipo','test')",
          [second, attempt],
        );
        await service();
        await db.query(
          "select attach_reactivation_checkout($1,'cs_test_reactivated',now()+interval '1 hour')",
          [attempt],
        );
        await apply({
          ...team.state,
          reactivation_id: attempt,
          checkout_id: "cs_test_reactivated",
          subscription_id: "sub_reactivated",
        });
        await as(team.buyer.id);
        const s = await summary(second);
        assert.equal(s.writable, true);
        assert.equal(s.companies, 3);
        assert.equal(s.invoices_this_month, 100);
      },
    );
    const initial = await paid("inicial");
    await t.test(
      "Initial has one owner, one company, ten issued invoices, including voided and backdated invoices",
      async () => {
        await assert.rejects(
          invite(initial.id, "no-seat@example.test"),
          /subscription_user_limit/,
        );
        await assert.rejects(create(initial.id), /subscription_company_limit/);
        const firstEstimate = await estimate(initial.id),
          firstInvoice = await approve(initial.id, firstEstimate);
        assert.equal(await approve(initial.id, firstEstimate), firstInvoice);
        for (let i = 1; i < 10; i++) await invoice(initial.id);
        await db.query(
          "select update_invoice($1,$2,1,'2026-01-02',null,'','Quota test void')",
          [initial.id, firstInvoice],
        );
        assert.equal((await summary(initial.id)).invoices_this_month, 10);
        await assert.rejects(invoice(initial.id), /subscription_invoice_limit/);
        await db.exec("reset role");
        await db.query(
          "update billing_invoice_usage set usage_month=(date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date where order_id=$1",
          [initial.id],
        );
        await as(initial.buyer.id);
        await invoice(initial.id);
        assert.equal((await summary(initial.id)).invoices_this_month, 1);
      },
    );
    const pro = await paid("profesional");
    await t.test(
      "Professional includes twenty employees, unlimited companies and invoices",
      async () => {
        for (let i = 0; i < 20; i++)
          await invite(pro.id, `pro-${i}@example.test`);
        await assert.rejects(
          invite(pro.id, "pro-21@example.test"),
          /subscription_user_limit/,
        );
        for (let i = 0; i < 4; i++) await create(pro.id);
        for (let i = 0; i < 101; i++) await invoice(pro.id);
        const s = await summary(pro.id);
        assert.equal(s.companies, 5);
        assert.equal(s.invoices_this_month, 101);
        assert.equal(s.support, "email");
      },
    );
    const growth = await paid("crecimiento");
    await t.test(
      "Growth has no numeric seat or company cap and includes the requested services",
      async () => {
        for (let i = 0; i < 30; i++)
          await invite(growth.id, `growth-${i}@example.test`);
        for (let i = 0; i < 4; i++) await create(growth.id);
        const s = await summary(growth.id);
        assert.equal(s.user_limit, null);
        assert.equal(s.company_limit, null);
        assert.equal(s.invoice_limit, null);
        assert.equal(s.support, "phone");
        assert.equal(s.custom_website, true);
        assert.equal(s.custom_modules, true);
      },
    );
    await t.test(
      "clients cannot alter subscription links, quota records, catalog or private helpers",
      async () => {
        for (const role of ["anon", "authenticated", "service_role"]) {
          await db.exec(`reset role;set role ${role}`);
          for (const table of [
            "billing_plan_catalog",
            "billing_company_links",
            "billing_invoice_usage",
          ])
            await assert.rejects(
              db.query(`select * from ${table}`),
              /permission denied/,
            );
          await assert.rejects(
            db.query("select app_private.subscription_seats($1)", [team.id]),
            /permission denied/,
          );
        }
      },
    );
  } finally {
    await db.close();
  }
});

test("migration keeps existing paid subscriptions on their original price and seat allowance", async () => {
  const { db } = await fullDatabase(
    "202610130094_subscription_reactivation.sql",
    { managedOnboarding: true },
  );
  const owner = randomUUID(),
    order = randomUUID();
  try {
    await db.query(
      "insert into auth.users values($1,'legacy@example.test',now())",
      [owner],
    );
    await db.query(
      "select prepare_billing_order($1,'legacy@example.test','Legacy company','inicial','test')",
      [order],
    );
    await db.query("select attach_billing_checkout($1,'cs_test_legacy')", [
      order,
    ]);
    const snapshot = {
      order_id: order,
      mode: "test",
      plan_code: "inicial",
      checkout_id: "cs_test_legacy",
      customer_id: "cus_legacy",
      subscription_id: "sub_legacy",
      email: "legacy@example.test",
      status: "active",
      paid: true,
      paid_through: new Date(Date.now() + 86400000).toISOString(),
      initial: true,
    };
    await db.query(
      "select apply_billing_snapshot('evt_legacy',1900000000,$1,$2)",
      ["a".repeat(64), JSON.stringify(snapshot)],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
    await db.query("select activate_my_paid_companies()");
    const customer = randomUUID(),
      estimate = randomUUID();
    await db.query("select save_customer($1,$2,0,$3)", [
      order,
      customer,
      JSON.stringify({
        full_name: "Existing synthetic customer",
        status: "active",
      }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
      order,
      estimate,
      JSON.stringify({
        customer_id: customer,
        status: "PENDIENTE",
        estimate_date: "2026-01-02",
        valid_until: null,
        discount: "0",
        taxes: "0",
        notes: "Legacy invoice",
        items: [
          { ...emptyItem, name: "Legacy synthetic service", unit_price: "100" },
        ],
      }),
    ]);
    await db.query(
      "select approve_estimate($1,$2,1,'2026-01-02','Legacy project','Preservation test')",
      [order, estimate],
    );
    await db.exec("reset role");
    const before = (
      await db.query(
        "select to_jsonb(b)-'catalog_version' data from billing_orders b",
      )
    ).rows;
    const invoicesBefore = (await db.query("select * from invoices")).rows;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610160095_subscription_portfolios.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (
        await db.query(
          "select to_jsonb(b)-'catalog_version' data from billing_orders b",
        )
      ).rows,
      before,
    );
    assert.deepEqual(
      (await db.query("select * from invoices")).rows,
      invoicesBefore,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from billing_invoice_usage where order_id=$1 and usage_month=date_trunc('month',now() at time zone 'UTC')::date",
          [order],
        )
      ).rows[0].n,
      1,
    );
    await db.exec("set role authenticated");
    const s = (
      await db.query<{
        v: {
          amount_cents: number;
          user_limit: number;
          catalog_version: string;
        };
      }>("select company_subscription_summary($1) v", [order])
    ).rows[0].v;
    assert.equal(s.amount_cents, 2900);
    assert.equal(s.user_limit, 3);
    assert.equal(s.catalog_version, "20261007");
    await db.query(
      "select invite_company_user($1,$2,'legacy-staff@example.test','member','{}')",
      [order, randomUUID()],
    );
    await db.exec("reset role;set role service_role");
    await db.query(
      "select apply_billing_snapshot('evt_legacy_next',1900000001,$1,$2)",
      ["b".repeat(64), JSON.stringify({ ...snapshot, initial: false })],
    );
  } finally {
    await db.close();
  }
});
