import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  startCompanyReactivation,
  type ReactivationGateway,
  type ReactivationOffer,
} from "../src/lib/subscription-reactivation";
import {
  reactivationCheckoutParameters,
  type BillingConfig,
} from "../src/lib/subscriptions";

const config: BillingConfig = {
  mode: "test",
  secret: "sk_test_SYNTHETIC",
  webhookSecret: "whsec_SYNTHETIC",
  serviceKey: "SYNTHETIC",
  site: "https://staging.example.invalid",
  database: "https://abcdefghijklmnopqrst.supabase.co",
  prices: {
    inicial: "price_Inicial",
    equipo: "price_Equipo",
    profesional: "price_Profesional",
    crecimiento: "price_Crecimiento",
  },
};
const offer = (): ReactivationOffer => ({
  id: randomUUID(),
  order_id: randomUUID(),
  email: "buyer@example.test",
  plan_code: "equipo",
  mode: "test",
  customer_id: "cus_original",
  checkout_id: "cs_test_original",
});
const checkout = (
  o: ReactivationOffer,
  change: Record<string, unknown> = {},
) => ({
  id: o.checkout_id ?? "cs_test_new",
  mode: "subscription",
  livemode: false,
  client_reference_id: o.order_id,
  customer: o.customer_id,
  metadata: { saas_order: o.order_id, saas_reactivation: o.id },
  status: "open",
  payment_status: "unpaid",
  expires_at: 1902592000,
  url: "https://checkout.stripe.com/c/pay/synthetic",
  ...change,
});

test("reactivation resumes an open checkout and reuses the company and provider customer", async () => {
  const o = offer(),
    company = randomUUID();
  const params = reactivationCheckoutParameters(config, {
    ...o,
    company_id: company,
  });
  assert.equal(params.get("customer"), o.customer_id);
  assert.equal(params.has("customer_email"), false);
  assert.equal(params.get("client_reference_id"), o.order_id);
  assert.equal(
    params.get("subscription_data[metadata][saas_reactivation]"),
    o.id,
  );
  assert.equal(
    params.get("success_url"),
    `${config.site}/app/${company}/configuracion`,
  );
  let creates = 0;
  const gateway: ReactivationGateway = {
    prepare: async () => o,
    read: async () => checkout(o),
    create: async () => {
      creates++;
      throw Error("unexpected charge");
    },
    attach: async () => {
      throw Error("unexpected attach");
    },
    expire: async () => {
      throw Error("unexpected expiration");
    },
  };
  assert.match(
    await startCompanyReactivation(
      config,
      company,
      randomUUID(),
      "equipo",
      gateway,
    ),
    /^https:\/\/checkout.stripe.com\//,
  );
  assert.equal(creates, 0);
  for (const change of [
    { status: "complete", payment_status: "paid" },
    { payment_status: "paid" },
    { status: "complete", payment_status: "unpaid" },
  ]) {
    await assert.rejects(
      startCompanyReactivation(config, company, randomUUID(), "equipo", {
        ...gateway,
        read: async () => checkout(o, change),
      }),
      /billing_reactivation_verifying/,
    );
  }
  assert.equal(creates, 0);
});

test("only an expired unpaid checkout permits a new attempt; provider substitution and unsafe redirects fail", async () => {
  const o = offer(),
    company = randomUUID();
  const calls: string[] = [];
  let reserved = o;
  const gateway: ReactivationGateway = {
    prepare: async (id) => {
      calls.push("prepare");
      if (calls.length > 1) reserved = { ...o, id, checkout_id: null };
      return reserved;
    },
    read: async () => checkout(o, { status: "expired", url: null }),
    expire: async () => {
      calls.push("expire");
    },
    create: async (attempt) => {
      calls.push("create");
      assert.notEqual(attempt.id, o.id);
      return checkout(attempt);
    },
    attach: async () => {
      calls.push("attach");
    },
  };
  await startCompanyReactivation(
    config,
    company,
    randomUUID(),
    "equipo",
    gateway,
  );
  assert.deepEqual(calls, ["prepare", "expire", "prepare", "create", "attach"]);
  for (const change of [
    { customer: "cus_other" },
    { livemode: true },
    { client_reference_id: randomUUID() },
    { metadata: { saas_order: o.order_id, saas_reactivation: randomUUID() } },
    { id: "cs_test_other" },
    { url: "https://checkout.stripe.com.evil.invalid/pay" },
    { url: "https://user@checkout.stripe.com/pay" },
  ]) {
    await assert.rejects(
      startCompanyReactivation(config, company, randomUUID(), "equipo", {
        ...gateway,
        prepare: async () => o,
        read: async () => checkout(o, change),
      }),
    );
  }
});

test("RLS reactivation preserves the original company, team, history and owner through multiple subscription epochs", async (t) => {
  const { db } = await fullDatabase(undefined, { managedOnboarding: true });
  const owner = randomUUID(),
    admin = randomUUID(),
    worker = randomUUID(),
    extra = randomUUID(),
    outsider = randomUUID(),
    order = randomUUID(),
    customer = randomUUID();
  const attempt = randomUUID();
  let seq = 1900000000;
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const service = () => db.exec("reset role;set role service_role");
  const base = {
    order_id: order,
    mode: "test",
    plan_code: "equipo",
    subscription_id: "sub_original",
    customer_id: "cus_original",
    checkout_id: "cs_test_original",
    email: "buyer@example.test",
    status: "active",
    paid: true,
    paid_through: new Date(Date.now() + 30 * 86400000).toISOString(),
    initial: true,
    cancel_at_period_end: false,
  };
  const apply = async (
    change: Record<string, unknown> = {},
    event?: string,
  ) => {
    await service();
    seq++;
    await db.query("select apply_billing_snapshot($1,$2,$3,$4)", [
      event ?? `evt_${seq}`,
      seq,
      "a".repeat(64),
      JSON.stringify({ ...base, ...change }),
    ]);
  };
  const prepare = (
    id = attempt,
    code = "equipo",
    mode = "test",
    company = order,
  ) =>
    db.query<{ offer: ReactivationOffer }>(
      "select prepare_company_reactivation($1,$2,$3,$4) offer",
      [company, id, code, mode],
    );
  const protectedRows = async () => {
    await db.exec("reset role");
    return (
      await db.query(
        "select (select jsonb_agg(to_jsonb(v) order by id) from companies v) companies,(select jsonb_agg(to_jsonb(v) order by user_id) from memberships v) members,(select jsonb_agg(to_jsonb(v) order by id) from customers v) customers,(select jsonb_agg(to_jsonb(v) order by id) from audit_events v where entity='customers') history",
      )
    ).rows[0];
  };
  const current = async () => {
    await db.exec("reset role");
    return (
      await db.query<{ row: Record<string, unknown> }>(
        "select to_jsonb(b) row from billing_orders b where id=$1",
        [order],
      )
    ).rows[0].row;
  };
  const summary = async () =>
    (
      await db.query<{
        summary: { status: string; writable: boolean; can_reactivate: boolean };
      }>("select company_subscription_summary($1) summary", [order])
    ).rows[0].summary;
  try {
    for (const [id, email] of [
      [owner, "buyer@example.test"],
      [admin, "admin@example.test"],
      [worker, "worker@example.test"],
      [extra, "extra@example.test"],
      [outsider, "outsider@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await service();
    await db.query(
      "select prepare_billing_order($1,'buyer@example.test','Preserved company','equipo','test')",
      [order],
    );
    await db.query("select attach_billing_checkout($1,'cs_test_original')", [
      order,
    ]);
    await apply();
    await as(owner);
    await db.query("select activate_my_paid_companies()");
    for (const [uid, email, role] of [
      [admin, "admin@example.test", "admin"],
      [worker, "worker@example.test", "member"],
      [extra, "extra@example.test", "member"],
    ]) {
      const invitation = randomUUID();
      await as(owner);
      await db.query("select invite_company_user($1,$2,$3,$4,'{}')", [
        order,
        invitation,
        email,
        role,
      ]);
      await as(uid);
      await db.query("select respond_company_invitation($1,true)", [
        invitation,
      ]);
    }
    await as(owner);
    await db.query("select save_customer($1,$2,0,$3)", [
      order,
      customer,
      JSON.stringify({
        full_name: "Preserved synthetic customer",
        status: "active",
        notes: "Original history",
      }),
    ]);
    const preserved = await protectedRows();
    await t.test(
      "active subscriptions, unauthenticated users and delegated administrators cannot buy another subscription",
      async () => {
        await as(owner);
        await assert.rejects(prepare(), /billing_reactivation_not_needed/);
        for (const uid of [admin, worker, outsider]) {
          await as(uid);
          await assert.rejects(prepare(), /permission_denied/);
        }
        for (const role of ["anon", "service_role"]) {
          await db.exec(`reset role;set role ${role}`);
          await assert.rejects(prepare(), /permission denied/);
        }
      },
    );
    await apply({ initial: false, status: "canceled", paid: false });
    const previous = await current();
    await t.test(
      "canceled companies remain readable; only their owner may reserve one fitting plan",
      async () => {
        await as(owner);
        assert.equal((await summary()).can_reactivate, true);
        assert.equal((await summary()).writable, false);
        await assert.rejects(
          prepare(attempt, "inicial"),
          /subscription_user_limit/,
        );
        await assert.rejects(
          prepare(attempt, "equipo", "live"),
          /invalid_billing_reactivation/,
        );
        await assert.rejects(
          prepare(attempt, "equipo", "test", randomUUID()),
          /permission_denied/,
        );
        assert.equal((await prepare()).rows[0].offer.id, attempt);
        assert.equal((await prepare(randomUUID())).rows[0].offer.id, attempt);
        await assert.rejects(
          prepare(randomUUID(), "profesional"),
          /billing_reactivation_conflict/,
        );
        await assert.rejects(
          db.query("select * from billing_reactivations"),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "select attach_reactivation_checkout($1,'cs_test_reactivated',now())",
            [attempt],
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "select expire_reactivation_checkout($1,'cs_test_reactivated')",
            [attempt],
          ),
          /permission denied/,
        );
        await service();
        await db.query(
          "select attach_reactivation_checkout($1,'cs_test_reactivated',now()+interval '1 day')",
          [attempt],
        );
        await assert.rejects(
          db.query(
            "select attach_reactivation_checkout($1,'cs_test_substituted',now())",
            [attempt],
          ),
          /billing_reactivation_conflict/,
        );
      },
    );
    const replacement = {
      reactivation_id: attempt,
      subscription_id: "sub_reactivated",
      checkout_id: "cs_test_reactivated",
    };
    await t.test(
      "unpaid, mismatched and unbound provider events never restore write access",
      async () => {
        await assert.rejects(
          apply({ ...replacement, initial: false }),
          /billing_reactivation_checkout_unverified/,
        );
        for (const change of [
          { customer_id: "cus_other" },
          { checkout_id: "cs_test_other" },
          { email: "other@example.test" },
          { reactivation_id: randomUUID() },
        ])
          await assert.rejects(
            apply({ ...replacement, ...change }),
            /billing_reactivation_mismatch|billing_checkout_mismatch/,
          );
        await apply({ ...replacement, paid: false });
        assert.deepEqual(await current(), previous);
        await service();
        await assert.rejects(
          db.query(
            "select expire_reactivation_checkout($1,'cs_test_reactivated')",
            [attempt],
          ),
          /billing_reactivation_conflict/,
        );
      },
    );
    await t.test(
      "verified payment promotes the subscription atomically and retains the original customer and protected owner",
      async () => {
        await apply({ ...replacement, initial: false });
        assert.deepEqual(await protectedRows(), preserved);
        const row = await current();
        assert.equal(row.subscription_id, "sub_reactivated");
        assert.equal(row.company_id, order);
        assert.equal(row.customer_id, "cus_original");
        assert.equal(row.owner_id, owner);
        await as(owner);
        assert.equal((await summary()).writable, true);
        assert.equal((await summary()).can_reactivate, false);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select activate_my_paid_companies() n",
            )
          ).rows[0].n,
          0,
        );
        await db.exec("reset role");
        assert.deepEqual(
          (
            await db.query<{ snapshot: unknown }>(
              "select previous_snapshot snapshot from billing_reactivations where id=$1",
              [attempt],
            )
          ).rows[0].snapshot,
          previous,
        );
        await assert.rejects(
          db.query(
            "update memberships set active=false where user_id=$1 and company_id=$2",
            [owner, order],
          ),
          /subscription_owner_protected/,
        );
        await assert.rejects(
          db.query(
            "update billing_reactivations set plan_code='profesional' where id=$1",
            [attempt],
          ),
          /billing_history_protected/,
        );
        await assert.rejects(
          db.query("delete from billing_reactivations where id=$1", [attempt]),
          /billing_history_protected/,
        );
        await service();
        await db.query(
          "select attach_reactivation_checkout($1,'cs_test_reactivated',now())",
          [attempt],
        );
      },
    );
    await t.test(
      "late retired events and duplicates cannot overwrite the current epoch; unpaid renewal never extends access",
      async () => {
        const before = await current();
        await apply(
          { status: "canceled", initial: false, paid: false },
          "evt_retired_late",
        );
        await apply(
          { status: "canceled", initial: false, paid: false },
          "evt_retired_late",
        );
        await apply({ status: "active" }, "evt_retired_paid");
        assert.deepEqual(await current(), before);
        await apply({
          ...replacement,
          initial: false,
          paid: false,
          status: "past_due",
          paid_through: new Date(Date.now() + 60 * 86400000).toISOString(),
        });
        const unpaid = await current();
        assert.equal(unpaid.paid_through, before.paid_through);
        assert.equal(unpaid.status, "past_due");
        await apply({
          ...replacement,
          initial: false,
          paid_through: new Date(Date.now() + 60 * 86400000).toISOString(),
          plan_code: "profesional",
        });
        assert.equal((await current()).plan_code, "profesional");
      },
    );
    await t.test(
      "a second canceled epoch can expire an unpaid attempt and reactivate without duplicating the company",
      async () => {
        await apply({
          ...replacement,
          initial: false,
          status: "canceled",
          paid: false,
          plan_code: "profesional",
        });
        const expired = randomUUID();
        await as(owner);
        await prepare(expired);
        await service();
        await db.query(
          "select attach_reactivation_checkout($1,'cs_test_expired',now())",
          [expired],
        );
        await assert.rejects(
          db.query("select expire_reactivation_checkout($1,'cs_test_wrong')", [
            expired,
          ]),
          /billing_reactivation_conflict/,
        );
        await db.query(
          "select expire_reactivation_checkout($1,'cs_test_expired')",
          [expired],
        );
        await db.query(
          "select expire_reactivation_checkout($1,'cs_test_expired')",
          [expired],
        );
        const second = randomUUID();
        await as(owner);
        await prepare(second);
        await service();
        await db.query(
          "select attach_reactivation_checkout($1,'cs_test_second',now())",
          [second],
        );
        // Compatibility with the previous app: infer the attempt from its bound checkout.
        await apply({
          reactivation_id: null,
          subscription_id: "sub_second",
          checkout_id: "cs_test_second",
        });
        assert.equal((await current()).subscription_id, "sub_second");
        await apply({
          ...replacement,
          initial: false,
          status: "canceled",
          paid: false,
        });
        assert.equal((await current()).subscription_id, "sub_second");
        assert.deepEqual(await protectedRows(), preserved);
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from billing_reactivations where status='activated'",
            )
          ).rows[0].n,
          2,
        );
      },
    );
  } finally {
    await db.close();
  }
});
