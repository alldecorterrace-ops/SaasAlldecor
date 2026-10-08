import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  billingConfig,
  checkoutParameters,
  subscriptionPlans,
  verifiedBillingSnapshot,
  verifyBillingSignature,
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
test("billing is disabled by default and test credentials cannot run against production", () => {
  assert.equal(billingConfig({}), null);
  const env = {
    APP_ENVIRONMENT: "staging",
    STAGING_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    NEXT_PUBLIC_SUPABASE_URL: config.database,
    NEXT_PUBLIC_SITE_URL: config.site,
    SAAS_BILLING_MODE: "test",
    SAAS_STRIPE_SECRET_KEY: config.secret,
    SAAS_STRIPE_WEBHOOK_SECRET: config.webhookSecret,
    SAAS_BILLING_SUPABASE_SERVICE_KEY: config.serviceKey,
    ...Object.fromEntries(
      subscriptionPlans.map((p) => [
        `SAAS_STRIPE_PRICE_${p.code.toUpperCase()}`,
        config.prices[p.code],
      ]),
    ),
  };
  assert.equal(billingConfig(env)?.mode, "test");
  assert.equal(
    billingConfig({ ...env, SAAS_STRIPE_SECRET_KEY: "rkcs_test_SYNTHETIC" })
      ?.mode,
    "test",
  );
  assert.equal(
    billingConfig({
      ...env,
      SAAS_BILLING_MODE: "live",
      APP_ENVIRONMENT: "production",
      SAAS_STRIPE_SECRET_KEY: "rkcs_test_SYNTHETIC",
    }),
    null,
  );

  for (const change of [
    { APP_ENVIRONMENT: "production" },
    { SAAS_STRIPE_SECRET_KEY: "sk_live_SYNTHETIC" },
    { NEXT_PUBLIC_SITE_URL: "https://app.alldecorpatio.com" },
    {
      STAGING_SUPABASE_PROJECT_REF: "loqbmrlkhskqzozknehx",
      NEXT_PUBLIC_SUPABASE_URL: "https://loqbmrlkhskqzozknehx.supabase.co",
    },
    { SAAS_STRIPE_PRICE_EQUIPO: "price_Inicial" },
    { SAAS_BILLING_SUPABASE_SERVICE_KEY: "" },
  ])
    assert.equal(billingConfig({ ...env, ...change }), null);
});
test("webhook signature rejects tampering, stale/future timestamps, missing headers and oversized bodies", () => {
  const stamp = 1900000000,
    body = '{"synthetic":true}';
  const sig = createHmac("sha256", config.webhookSecret)
    .update(`${stamp}.${body}`)
    .digest("hex");
  assert.match(
    verifyBillingSignature(
      body,
      `t=${stamp},v1=${sig}`,
      config.webhookSecret,
      stamp * 1000,
    ),
    /^[a-f0-9]{64}$/,
  );
  assert.doesNotThrow(() =>
    verifyBillingSignature(
      body,
      `t=${stamp},v1=${"0".repeat(64)},v1=${sig}`,
      config.webhookSecret,
      stamp * 1000,
    ),
  );
  for (const [payload, header, now] of [
    [body + " ", `t=${stamp},v1=${sig}`, stamp * 1000],
    [body, "", stamp * 1000],
    [body, `t=${stamp},t=${stamp},v1=${sig}`, stamp * 1000],
    [body, `t=${stamp},v1=${sig}`, (stamp + 301) * 1000],
    [body, `t=${stamp},v1=${sig}`, (stamp - 301) * 1000],
    ["x".repeat(262145), `t=${stamp},v1=${sig}`, stamp * 1000],
  ] as const)
    assert.throws(
      () => verifyBillingSignature(payload, header, config.webhookSecret, now),
      /invalid_billing_signature/,
    );
});
test("hosted checkout binds one recurring price, one email and a stable order, never an amount or permission from the browser", () => {
  const oid = randomUUID();
  const params = checkoutParameters(config, {
    id: oid,
    email: "buyer@saasalldecor.invalid",
    code: "equipo",
  });
  assert.equal(params.get("mode"), "subscription");
  assert.equal(params.get("line_items[0][price]"), "price_Equipo");
  assert.equal(params.get("line_items[0][quantity]"), "1");
  assert.equal(params.get("subscription_data[metadata][saas_order]"), oid);
  assert.equal(
    params.get("success_url"),
    `${config.site}/suscripcion/completada`,
  );
  assert.equal(params.has("amount"), false);
});
test("verified provider state rejects unpaid grants, substituted customer, plan/price/mode and uses the current subscription", async () => {
  const oid = randomUUID();
  const event = {
    id: "evt_checkout",
    created: 1900000000,
    livemode: false,
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_checkout" } },
  };
  const session = {
    id: "cs_test_checkout",
    mode: "subscription",
    status: "complete",
    livemode: false,
    customer: "cus_buyer",
    subscription: "sub_buyer",
    payment_status: "paid",
    client_reference_id: oid,
    metadata: { saas_order: oid },
    customer_details: { email: "buyer@saasalldecor.invalid" },
  };
  const current = {
    id: "sub_buyer",
    customer: "cus_buyer",
    livemode: false,
    status: "active",
    metadata: { saas_order: oid },
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: 1902592000,
          price: {
            id: "price_Equipo",
            unit_amount: 5900,
            currency: "usd",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
    latest_invoice: { status: "paid", amount_paid: 5900, currency: "usd" },
  };
  const read = async (path: string) =>
    path.startsWith("/checkout/") ? session : current;
  const valid = await verifiedBillingSnapshot(
    JSON.stringify(event),
    config,
    read,
  );
  assert.equal(valid?.snapshot.paid, true);
  assert.equal(valid?.snapshot.order_id, oid);
  const unpaid = await verifiedBillingSnapshot(
    JSON.stringify(event),
    config,
    async (path) =>
      path.startsWith("/checkout/")
        ? { ...session, payment_status: "unpaid" }
        : current,
  );
  assert.equal(unpaid?.snapshot.paid, false);
  for (const change of [
    { customer: "cus_other" },
    { livemode: true },
    { items: { data: [{ ...current.items.data[0], quantity: 2 }] } },
    {
      items: {
        data: [
          {
            ...current.items.data[0],
            price: { ...current.items.data[0].price, unit_amount: 1 },
          },
        ],
      },
    },
  ])
    await assert.rejects(
      verifiedBillingSnapshot(JSON.stringify(event), config, async (path) =>
        path.startsWith("/checkout/") ? session : { ...current, ...change },
      ),
    );
  const invoiceEvent = {
    ...event,
    type: "invoice.paid",
    data: {
      object: {
        id: "in_paid",
        parent: { subscription_details: { subscription: "sub_buyer" } },
      },
    },
  };
  assert.equal(
    (
      await verifiedBillingSnapshot(
        JSON.stringify(invoiceEvent),
        config,
        async () => current,
      )
    )?.snapshot.initial,
    false,
  );
  assert.equal(
    await verifiedBillingSnapshot(
      JSON.stringify({ ...event, type: "unrelated.event" }),
      config,
      async () => {
        throw new Error("must not fetch");
      },
    ),
    null,
  );
});

test("paid onboarding, team roles, reserved seats, owner protection and inactive subscriptions compose under RLS", async (t) => {
  const { db } = await fullDatabase(undefined, { managedOnboarding: true });
  const buyer = randomUUID(),
    admin = randomUUID(),
    worker = randomUUID(),
    stranger = randomUUID(),
    order = randomUUID();
  let sequence = 1900000000;
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const service = () => db.exec("reset role;set role service_role");
  const snapshot = (change: Record<string, unknown> = {}) => ({
    order_id: order,
    mode: "test",
    plan_code: "inicial",
    subscription_id: "sub_synthetic",
    customer_id: "cus_synthetic",
    checkout_id: "cs_test_synthetic",
    email: "buyer@saasalldecor.invalid",
    status: "active",
    paid: true,
    paid_through: new Date(Date.now() + 30 * 86400000).toISOString(),
    initial: true,
    cancel_at_period_end: false,
    ...change,
  });
  const apply = async (change: Record<string, unknown> = {}) => {
    await service();
    sequence++;
    await db.query("select apply_billing_snapshot($1,$2,$3,$4)", [
      `evt_${sequence}`,
      sequence,
      "a".repeat(64),
      JSON.stringify(snapshot(change)),
    ]);
  };
  const eligible = async (email: string) => {
    await db.exec("reset role;set role anon");
    return (
      await db.query<{ ok: boolean }>(
        "select registration_invitation_available($1) ok",
        [email],
      )
    ).rows[0].ok;
  };
  try {
    for (const [uid, email, confirmed] of [
      [buyer, "buyer@saasalldecor.invalid", null],
      [admin, "admin@saasalldecor.invalid", new Date()],
      [worker, "worker@saasalldecor.invalid", new Date()],
      [stranger, "stranger@saasalldecor.invalid", new Date()],
    ] as const)
      await db.query("insert into auth.users values($1,$2,$3)", [
        uid,
        email,
        confirmed,
      ]);
    await t.test(
      "client cannot create orders, persist paid events or mutate billing rows",
      async () => {
        await as(stranger);
        await assert.rejects(
          db.query(
            "select prepare_billing_order($1,'x@saasalldecor.invalid','Test','inicial','test')",
            [order],
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select apply_billing_snapshot('evt_fake',1,$1,$2)", [
            "a".repeat(64),
            JSON.stringify(snapshot()),
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from billing_orders"),
          /permission denied/,
        );
        await service();
        await db.query(
          "select prepare_billing_order($1,'buyer@saasalldecor.invalid','Paid company','inicial','test')",
          [order],
        );
        await db.query(
          "select attach_billing_checkout($1,'cs_test_synthetic')",
          [order],
        );
        assert.equal(await eligible("buyer@saasalldecor.invalid"), false);
        await apply({ paid: false });
        assert.equal(await eligible("buyer@saasalldecor.invalid"), false);
        await apply();
        assert.equal(await eligible("buyer@saasalldecor.invalid"), true);
        assert.equal(await eligible("stranger@saasalldecor.invalid"), false);
      },
    );
    await t.test(
      "payment alone and email spoofing cannot create an owner; verified buyer activates exactly once",
      async () => {
        await as(buyer);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select activate_my_paid_companies() n",
            )
          ).rows[0].n,
          0,
        );
        await as(stranger);
        await db.query(
          "select set_config('request.jwt.claim.email','buyer@saasalldecor.invalid',false)",
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select activate_my_paid_companies() n",
            )
          ).rows[0].n,
          0,
        );
        await db.exec("reset role");
        await db.query(
          "update auth.users set email_confirmed_at=now() where id=$1",
          [buyer],
        );
        await as(buyer);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select activate_my_paid_companies() n",
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select activate_my_paid_companies() n",
            )
          ).rows[0].n,
          0,
        );
        assert.deepEqual(
          (await db.query("select role,active from memberships")).rows,
          [{ role: "owner", active: true }],
        );
        assert.deepEqual(
          (await db.query("select * from platform_context()")).rows,
          [{ role: "manager", active: true, can_create_company: false }],
        );
        await assert.rejects(
          db.query("select create_company($1,'Free extra company')", [
            randomUUID(),
          ]),
          /manager_invitation_required/,
        );
      },
    );
    await t.test(
      "admins accept by their verified email and may invite other admins, without gaining company creation",
      async () => {
        const invitation = randomUUID();
        await as(buyer);
        await db.query(
          "select invite_company_user($1,$2,'admin@saasalldecor.invalid','admin','{}')",
          [order, invitation],
        );
        await as(stranger);
        await assert.rejects(
          db.query("select respond_company_invitation($1,true)", [invitation]),
          /invitation_unavailable/,
        );
        await as(admin);
        await db.query("select respond_company_invitation($1,true)", [
          invitation,
        ]);
        assert.equal(
          (
            await db.query<{ ok: boolean }>(
              "select can_invite_company_users($1) ok",
              [order],
            )
          ).rows[0].ok,
          true,
        );
        await assert.rejects(
          db.query("select create_company($1,'Admin company')", [randomUUID()]),
          /manager_invitation_required/,
        );
        const next = randomUUID();
        await db.query(
          "select invite_company_user($1,$2,'worker@saasalldecor.invalid','admin','{}')",
          [order, next],
        );
        assert.equal(await eligible("worker@saasalldecor.invalid"), true);
        await as(admin);
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'extra@saasalldecor.invalid','member','{}')",
            [order, randomUUID()],
          ),
          /subscription_user_limit/,
        );
        // An idempotent retry on a full plan does not consume another seat.
        await db.query(
          "select invite_company_user($1,$2,'worker@saasalldecor.invalid','admin','{}')",
          [order, next],
        );
        await as(worker);
        await db.query("select respond_company_invitation($1,true)", [next]);
        await db.query(
          "select set_member_access($1,$2,'member',true,'{\"clientes\":[\"read\"]}')",
          [order, admin],
        );
        await as(admin);
        assert.equal(
          (
            await db.query<{ ok: boolean }>(
              "select can_invite_company_users($1) ok",
              [order],
            )
          ).rows[0].ok,
          false,
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'extra@saasalldecor.invalid','member','{}')",
            [order, randomUUID()],
          ),
          /permission_denied/,
        );
        await as(buyer);
        await db.query("select set_member_access($1,$2,'admin',true,'{}')", [
          order,
          admin,
        ]);
      },
    );
    await t.test(
      "payer cannot be removed, suspended or demoted through RPC or maintenance writes",
      async () => {
        await as(admin);
        for (const role of ["member", "admin"])
          await assert.rejects(
            db.query("select set_member_access($1,$2,$3,false,'{}')", [
              order,
              buyer,
              role,
            ]),
            /permission_denied/,
          );
        await db.exec("reset role");
        await assert.rejects(
          db.query(
            "update memberships set active=false where company_id=$1 and user_id=$2",
            [order, buyer],
          ),
          /subscription_owner_protected/,
        );
        await assert.rejects(
          db.query(
            "delete from memberships where company_id=$1 and user_id=$2",
            [order, buyer],
          ),
          /subscription_owner_protected/,
        );
        await as(admin);
        assert.equal(
          (
            await db.query<{ customer: string | null }>(
              "select subscription_portal_customer($1) customer",
              [order],
            )
          ).rows[0].customer,
          null,
        );
        await as(buyer);
        assert.equal(
          (
            await db.query<{ customer: string }>(
              "select subscription_portal_customer($1) customer",
              [order],
            )
          ).rows[0].customer,
          "cus_synthetic",
        );
        await assert.rejects(
          db.query(
            "select add_company_member($1,'stranger@saasalldecor.invalid')",
            [order],
          ),
          /invitation_required/,
        );
      },
    );
    await t.test(
      "revoke/suspend frees seats, and suspended recipients cannot reuse an old acceptance",
      async () => {
        await as(buyer);
        await db.query("select set_member_access($1,$2,'member',false,'{}')", [
          order,
          worker,
        ]);
        const invitation = randomUUID();
        await db.query(
          "select invite_company_user($1,$2,'new@saasalldecor.invalid','member','{}')",
          [order, invitation],
        );
        assert.equal(await eligible("new@saasalldecor.invalid"), true);
        await as(admin);
        await db.query("select revoke_company_invitation($1,$2)", [
          order,
          invitation,
        ]);
        assert.equal(await eligible("new@saasalldecor.invalid"), false);
        await as(buyer);
        await db.query(
          "select set_member_access($1,$2,'member',true,'{\"clientes\":[\"read\"]}')",
          [order, worker],
        );
        await as(worker);
        assert.equal(
          (
            await db.query<{ ok: boolean }>(
              "select can_invite_company_users($1) ok",
              [order],
            )
          ).rows[0].ok,
          false,
        );
        await assert.rejects(
          db.query(
            'select save_customer($1,$2,0,\'{"full_name":"Forbidden"}\')',
            [order, randomUUID()],
          ),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "an unpaid renewal never extends the previously paid period and expiration remains readable",
      async () => {
        await apply({
          initial: false,
          status: "active",
          paid: false,
          paid_through: new Date(Date.now() + 60 * 86400000).toISOString(),
        });
        await as(buyer);
        const result = (
          await db.query<{ summary: { paid_through: string } }>(
            "select company_subscription_summary($1) summary",
            [order],
          )
        ).rows[0].summary;
        assert.ok(
          new Date(result.paid_through).getTime() < Date.now() + 31 * 86400000,
        );
        await db.exec("reset role");
        await db.query(
          "update billing_orders set paid_through=now()-interval '1 second' where id=$1",
          [order],
        );
        await as(buyer);
        assert.equal(
          (await db.query("select * from companies")).rows.length,
          1,
        );
        await assert.rejects(
          db.query("select update_company($1,'Expired','UTC')", [order]),
          /permission_denied|subscription_inactive/,
        );
        await as(stranger);
        assert.equal(
          (
            await db.query<{ summary: unknown }>(
              "select company_subscription_summary($1) summary",
              [order],
            )
          ).rows[0].summary,
          null,
        );
      },
    );
    await t.test(
      "paid snapshot retries do not duplicate events, old events cannot resurrect a canceled company",
      async () => {
        await apply({ initial: false, status: "canceled", paid: false });
        const current = sequence;
        await service();
        await db.query("select apply_billing_snapshot($1,$2,$3,$4)", [
          `evt_${current}`,
          current,
          "a".repeat(64),
          JSON.stringify(
            snapshot({ initial: false, status: "canceled", paid: false }),
          ),
        ]);
        await assert.rejects(
          db.query("select apply_billing_snapshot($1,$2,$3,$4)", [
            `evt_${current}`,
            current,
            "b".repeat(64),
            JSON.stringify(snapshot({ initial: false })),
          ]),
          /billing_event_conflict/,
        );
        await db.query("select apply_billing_snapshot('evt_old',1,$1,$2)", [
          "a".repeat(64),
          JSON.stringify(snapshot({ initial: false })),
        ]);
        // Different events can share one Stripe created-second; cancellation is terminal.
        await db.query(
          "select apply_billing_snapshot('evt_same_second', $1, $2, $3)",
          [
            current,
            "c".repeat(64),
            JSON.stringify(
              snapshot({ initial: false, status: "active", paid: true }),
            ),
          ],
        );
        await apply({ initial: false, status: "active", paid: true });
        await as(buyer);
        const result = (
          await db.query<{ summary: { status: string; writable: boolean } }>(
            "select company_subscription_summary($1) summary",
            [order],
          )
        ).rows[0].summary;
        assert.equal(result.status, "canceled");
        assert.equal(result.writable, false);
        assert.equal(
          (await db.query("select * from companies")).rows.length,
          1,
        );
        await assert.rejects(
          db.query("select update_company($1,'Changed','UTC')", [order]),
          /permission_denied|subscription_inactive/,
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'new@saasalldecor.invalid','member','{}')",
            [order, randomUUID()],
          ),
          /permission_denied|subscription_inactive/,
        );
        await db.exec("reset role");
        await assert.rejects(
          db.query("update companies set name='Legacy bypass' where id=$1", [
            order,
          ]),
          /subscription_inactive/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
