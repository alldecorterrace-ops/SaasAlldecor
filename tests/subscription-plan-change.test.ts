import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  subscriptionPlans,
  type PlanCode,
} from "../src/lib/subscription-catalog";
import {
  quotePlanChange,
  executePlanChange,
  cancelPlanChange,
  type PlanChangeOffer,
  type ChangePorts,
} from "../src/lib/subscription-plan-change";
import {
  verifiedBillingSnapshot,
  type BillingConfig,
} from "../src/lib/subscriptions";
import { emptyItem } from "../src/lib/estimates";

const now = Math.floor(Date.now() / 1000);
const config: BillingConfig = {
  mode: "test",
  secret: "sk_test_SYNTHETIC",
  webhookSecret: "whsec_SYNTHETIC",
  serviceKey: "SYNTHETIC",
  site: "https://staging.example.invalid",
  database: "https://abcdefghijklmnopqrst.supabase.co",
  catalogVersion: "20261016",
  prices: {
    inicial: "price_Initial",
    equipo: "price_Team",
    profesional: "price_Pro",
    crecimiento: "price_Growth",
  },
};
const offer = (
  from: PlanCode = "inicial",
  to: PlanCode = "equipo",
): PlanChangeOffer => ({
  id: randomUUID(),
  order_id: randomUUID(),
  owner_id: randomUUID(),
  company_id: randomUUID(),
  subscription_id: "sub_test",
  customer_id: "cus_test",
  mode: "test",
  catalog_version: "20261016",
  from_code: from,
  to_code: to,
  direction:
    subscriptionPlans.find((p) => p.code === from)!.amount <
    subscriptionPlans.find((p) => p.code === to)!.amount
      ? "upgrade"
      : "downgrade",
  status: "quoted",
  confirmed_at: null,
  quote: null,
  effective_at: null,
  invoice_id: null,
  schedule_id: null,
  expires_at: new Date((now + 900) * 1000).toISOString(),
});
const current = (o: PlanChangeOffer, price = o.from_code) => ({
  id: o.subscription_id,
  customer: o.customer_id,
  livemode: false,
  status: "active",
  metadata: { saas_order: o.order_id },
  cancel_at_period_end: false,
  pending_update: null,
  schedule: null,
  collection_method: "charge_automatically",
  items: {
    data: [
      {
        id: "si_test",
        quantity: 1,
        current_period_start: now - 86400,
        current_period_end: now + 29 * 86400,
        price: {
          id: config.prices[price],
          unit_amount: subscriptionPlans.find((p) => p.code === price)!.amount,
          currency: "usd",
          recurring: { interval: "month", interval_count: 1 },
        },
      },
    ],
  },
  latest_invoice: {
    id: "in_original",
    customer: o.customer_id,
    livemode: false,
    currency: "usd",
    status: "paid",
    amount_remaining: 0,
    amount_paid: 2999,
    created: now - 86400,
    hosted_invoice_url: null,
  },
});
const price = (code: PlanCode) => ({
  id: config.prices[code],
  active: true,
  livemode: false,
  currency: "usd",
  unit_amount: subscriptionPlans.find((p) => p.code === code)!.amount,
  recurring: { interval: "month", interval_count: 1 },
});
test("all twelve plan transitions preview a verified price and keep the renewal date", async () => {
  for (const from of subscriptionPlans)
    for (const to of subscriptionPlans) {
      if (from.code === to.code) continue;
      const o = offer(from.code, to.code),
        calls: string[] = [];
      const q = await quotePlanChange(
        config,
        o,
        async (path, params) => {
          calls.push(path);
          if (path.startsWith("/subscriptions/")) return current(o);
          if (path.startsWith("/prices/")) return price(to.code);
          assert.equal(path, "/invoices/create_preview");
          assert.equal(
            params?.get("subscription_details[items][0][price]"),
            config.prices[to.code],
          );
          assert.equal(
            params?.get("subscription_details[proration_date]"),
            String(now),
          );
          return { currency: "usd", amount_due: 501 };
        },
        now * 1000,
      );
      assert.equal(q.due_cents, o.direction === "upgrade" ? 501 : 0);
      assert.equal(q.period_end, now + 29 * 86400);
      assert.equal(
        calls.includes("/invoices/create_preview"),
        o.direction === "upgrade",
      );
    }
});
test("quotes reject foreign subscriptions, inactive prices, pending changes and custom terms", async () => {
  const o = offer();
  for (const patch of [
    { customer: "cus_other" },
    { livemode: true },
    { metadata: { saas_order: randomUUID() } },
    { cancel_at_period_end: true },
    { pending_update: {} },
    { schedule: "sub_sched_external" },
    { automatic_tax: { enabled: true } },
    { discounts: ["di_test"] },
  ]) {
    await assert.rejects(
      quotePlanChange(config, o, async (path) =>
        path.startsWith("/subscriptions/")
          ? { ...current(o), ...patch }
          : price("equipo"),
      ),
    );
  }
  await assert.rejects(
    quotePlanChange(config, o, async (path) =>
      path.startsWith("/subscriptions/")
        ? current(o)
        : { ...price("equipo"), unit_amount: 5900 },
    ),
    /billing_price_mismatch/,
  );
});
test("upgrade requires confirmation, shows the exact preview, uses pending payment and a stable retry key", async () => {
  const o = offer();
  o.quote = {
    currency: "usd",
    due_cents: 500,
    item_id: "si_test",
    period_start: now - 86400,
    period_end: now + 29 * 86400,
    proration_date: now,
  };
  const writes: Array<{ path: string; params: string; key?: string }> = [],
    records: string[] = [];
  let syncs = 0;
  const ports: ChangePorts = {
    beforeMutation: async () => {},
    stripe: async (path, params, key) => {
      if (path.startsWith("/prices/")) return price("equipo");
      if (path === "/invoices/create_preview")
        return { currency: "usd", amount_due: 500 };
      if (!params) return current(o);
      writes.push({ path, params: params.toString(), key });
      assert.equal(params.get("payment_behavior"), "pending_if_incomplete");
      assert.equal(params.get("proration_date"), String(now));
      assert.equal(params.get("metadata[saas_plan_change]"), o.id);
      return {
        ...current(o),
        pending_update: {},
        latest_invoice: {
          ...current(o).latest_invoice,
          id: "in_upgrade",
          status: "open",
          amount_remaining: 500,
          hosted_invoice_url: "https://invoice.stripe.com/i/test",
        },
      };
    },
    record: async (status) => {
      records.push(status);
    },
    sync: async () => {
      syncs++;
    },
  };
  await assert.rejects(executePlanChange(config, o, ports), /not_confirmed/);
  o.status = "processing";
  o.confirmed_at = new Date(now * 1000).toISOString();
  assert.equal(
    (await executePlanChange(config, o, ports)).paymentUrl,
    "https://invoice.stripe.com/i/test",
  );
  await executePlanChange(config, o, ports);
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(records, ["pending_payment", "pending_payment"]);
  assert.equal(syncs, 2);
  const changed = {
    ...ports,
    stripe: async (path: string) =>
      path === "/invoices/create_preview"
        ? { currency: "usd", amount_due: 501 }
        : path.startsWith("/prices/")
          ? price("equipo")
          : current(o),
  };
  await assert.rejects(executePlanChange(config, o, changed), /quote_changed/);
  assert.equal(writes.length, 2);
  await assert.rejects(
    executePlanChange(config, o, ports, (now + 23 * 3600) * 1000),
    /retry_expired/,
  );
});
test("a failed-payment retry opens only its verified invoice and does not create another charge", async () => {
  const o = offer();
  o.status = "pending_payment";
  o.invoice_id = "in_upgrade";
  o.confirmed_at = new Date(now * 1000).toISOString();
  o.quote = {
    currency: "usd",
    due_cents: 500,
    item_id: "si_test",
    period_start: now - 86400,
    period_end: now + 29 * 86400,
    proration_date: now,
  };
  const invoice = {
    ...current(o).latest_invoice,
    id: "in_upgrade",
    status: "open",
    amount_remaining: 500,
    hosted_invoice_url: "https://invoice.stripe.com/i/test",
  };
  const ports: ChangePorts = {
    beforeMutation: async () => {},
    stripe: async (path, params) => {
      assert.equal(params, undefined);
      return path.startsWith("/subscriptions/")
        ? { ...current(o), pending_update: {}, latest_invoice: invoice }
        : invoice;
    },
    record: async () => {},
    sync: async () => {},
  };
  assert.equal(
    (await executePlanChange(config, o, ports)).paymentUrl,
    invoice.hosted_invoice_url,
  );
  for (const patch of [
    { customer: "cus_foreign" },
    { livemode: true },
    { hosted_invoice_url: "https://invoice.stripe.com.evil.invalid/" },
    { hosted_invoice_url: "https://invoice.stripe.com:444/" },
  ]) {
    await assert.rejects(
      executePlanChange(config, o, {
        ...ports,
        stripe: async (path) =>
          path.startsWith("/subscriptions/")
            ? current(o)
            : { ...invoice, ...patch },
      }),
    );
  }
});
test("downgrade schedules next renewal without an immediate charge; release preserves the subscription", async () => {
  const o = offer("equipo", "inicial");
  o.status = "processing";
  o.confirmed_at = new Date(now * 1000).toISOString();
  o.quote = {
    currency: "usd",
    due_cents: 0,
    item_id: "si_test",
    period_start: now - 86400,
    period_end: now + 29 * 86400,
    proration_date: now,
  };
  const schedule = {
    id: "sub_sched_test",
    subscription: o.subscription_id,
    livemode: false,
    status: "active",
    metadata: {},
    phases: [
      { start_date: o.quote.period_start, end_date: o.quote.period_end },
    ],
  };
  let released = false;
  const calls: string[] = [];
  const ports: ChangePorts = {
    beforeMutation: async () => {},
    stripe: async (path, params) => {
      calls.push(path);
      if (path.startsWith("/prices/")) return price("inicial");
      if (path.startsWith("/subscriptions/"))
        return { ...current(o), schedule: released ? null : o.schedule_id };
      if (path === "/subscription_schedules") {
        assert.equal(params?.get("from_subscription"), o.subscription_id);
        return schedule;
      }
      if (path.endsWith("/release")) {
        released = true;
        return {
          ...schedule,
          status: "released",
          subscription: null,
          released_subscription: o.subscription_id,
        };
      }
      if (params) {
        assert.equal(
          params.get("phases[0][end_date]"),
          String(o.quote!.period_end),
        );
        assert.equal(
          params.get("phases[1][items][0][price]"),
          config.prices.inicial,
        );
        assert.equal(params.get("phases[1][metadata][saas_plan_change]"), o.id);
        assert.equal(params.get("end_behavior"), "release");
        assert.equal(params.get("proration_behavior"), "none");
      }
      return schedule;
    },
    record: async (status, id) => {
      o.status = status;
      o.schedule_id = id ?? o.schedule_id;
    },
    sync: async () => {},
  };
  await executePlanChange(config, o, ports);
  assert.equal(o.status, "scheduled");
  await cancelPlanChange(config, o, ports);
  assert.equal(o.status, "canceled");
  assert.ok(calls.includes("/subscription_schedules/sub_sched_test/release"));
  assert.equal(
    calls.some((p) => p.endsWith("/cancel") || p.includes("/invoices")),
    false,
  );
});
test("pending upgrade cancellation voids only its own invoice and a paid race is reconciled", async () => {
  for (const paidRace of [false, true]) {
    const o = offer();
    o.status = "pending_payment";
    o.invoice_id = "in_upgrade";
    o.confirmed_at = new Date(now * 1000).toISOString();
    let canceled = false,
      voided = false,
      syncs = 0;
    const ports: ChangePorts = {
      beforeMutation: async () => {},
      stripe: async (path, params) => {
        if (path.endsWith("/void")) {
          assert.equal(paidRace, false);
          assert.ok(params);
          voided = true;
          return {};
        }
        if (path.startsWith("/subscriptions/"))
          return {
            ...current(o),
            pending_update: voided ? null : {},
            latest_invoice: {
              ...current(o).latest_invoice,
              id: "in_upgrade",
              status: "open",
            },
          };
        assert.equal(path, "/invoices/in_upgrade");
        return {
          ...current(o).latest_invoice,
          id: "in_upgrade",
          status: paidRace ? "paid" : "open",
          amount_remaining: paidRace ? 0 : 500,
        };
      },
      record: async (status) => {
        canceled = status === "canceled";
      },
      sync: async () => {
        syncs++;
      },
    };
    await cancelPlanChange(config, o, ports);
    assert.equal(voided, !paidRace);
    assert.equal(canceled, !paidRace);
    assert.equal(syncs, 1);
  }
});
test("a completed paid downgrade can release its final schedule phase before another quote", async () => {
  const o = offer();
  o.completed_schedule_id = "sub_sched_completed";
  const previous = randomUUID();
  let released = false;
  const q = await quotePlanChange(config, o, async (path, params) => {
    if (path.startsWith("/subscriptions/"))
      return {
        ...current(o),
        schedule: released ? null : o.completed_schedule_id,
        metadata: { saas_order: o.order_id, saas_plan_change: previous },
      };
    if (path === "/subscription_schedules/sub_sched_completed")
      return {
        id: o.completed_schedule_id,
        subscription: o.subscription_id,
        livemode: false,
        status: "active",
        metadata: { saas_plan_change: previous },
      };
    if (path.endsWith("/release")) {
      assert.ok(params);
      released = true;
      return {};
    }
    if (path.startsWith("/prices/")) return price("equipo");
    return { currency: "usd", amount_due: 500 };
  });
  assert.equal(released, true);
  assert.equal(q.due_cents, 500);
});
test("a disconnected provider request must be reconciled before it can be canceled", async () => {
  const o = offer();
  o.status = "processing";
  o.confirmed_at = new Date(now * 1000).toISOString();
  o.quote = {
    currency: "usd",
    due_cents: 500,
    item_id: "si_test",
    period_start: now - 86400,
    period_end: now + 29 * 86400,
    proration_date: now,
  };
  let canceled = false,
    attempted = false;
  const ports: ChangePorts = {
    beforeMutation: async () => {
      o.provider_started_at = new Date().toISOString();
    },
    stripe: async (path, params) => {
      if (path.startsWith("/prices/")) return price("equipo");
      if (path === "/invoices/create_preview")
        return { currency: "usd", amount_due: 500 };
      if (params) {
        attempted = true;
        assert.ok(o.provider_started_at);
        throw new Error("connection_lost");
      }
      return current(o);
    },
    record: async (status) => {
      canceled = status === "canceled";
    },
    sync: async () => {},
  };
  await assert.rejects(executePlanChange(config, o, ports), /connection_lost/);
  assert.equal(attempted, true);
  await assert.rejects(cancelPlanChange(config, o, ports), /reconcile_first/);
  assert.equal(canceled, false);
  // A validation failure before a provider request remains safe to discard.
  o.provider_started_at = null;
  await cancelPlanChange(config, o, ports);
  assert.equal(canceled, true);
});
test("prorated payment evidence requires a paid USD invoice with no remaining balance", async () => {
  const o = offer();
  const event = JSON.stringify({
    id: "evt_proration",
    created: now,
    livemode: false,
    type: "customer.subscription.updated",
    data: { object: { id: o.subscription_id } },
  });
  for (const remaining of [0, 100, undefined]) {
    const value = current(o, "equipo");
    const r = await verifiedBillingSnapshot(event, config, async () => ({
      ...value,
      metadata: { ...value.metadata, saas_plan_change: o.id },
      latest_invoice: {
        ...value.latest_invoice,
        created: now,
        amount_paid: 500,
        amount_remaining: remaining,
      },
    }));
    assert.equal(r?.snapshot.paid, false);
    assert.equal(r?.snapshot.invoice_paid, remaining === 0);
    assert.equal(r?.snapshot.invoice_created, now);
  }
});

test("plan-change ownership, verified payments, future quotas and history are enforced in PostgreSQL", async (t) => {
  const { db } = await fullDatabase(undefined, { managedOnboarding: true });
  let event = 1900000000;
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const service = () => db.exec("reset role;set role service_role");
  const apply = async (
    s: object,
    stamp = ++event,
    eventId = `evt_${stamp}`,
  ) => {
    await service();
    await db.query("select apply_billing_snapshot($1,$2,$3,$4)", [
      eventId,
      stamp,
      "a".repeat(64),
      JSON.stringify(s),
    ]);
  };
  const paid = async (code: PlanCode) => {
    const buyer = randomUUID(),
      id = randomUUID(),
      email = `${buyer}@example.test`;
    await db.exec("reset role");
    await db.query("insert into auth.users values($1,$2,now())", [
      buyer,
      email,
    ]);
    await service();
    await db.query(
      "select prepare_billing_order($1,$2,'Change plan fixture',$3,'test')",
      [id, email, code],
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
      email,
      checkout_id: `cs_test_${id.replaceAll("-", "")}`,
      subscription_id: `sub_${id.replaceAll("-", "")}`,
      customer_id: `cus_${id.replaceAll("-", "")}`,
      status: "active",
      paid: true,
      paid_through: new Date((now + 29 * 86400) * 1000).toISOString(),
      initial: true,
      cancel_at_period_end: false,
    };
    await apply(state);
    await as(buyer);
    await db.query("select activate_my_paid_companies()");
    return { buyer, id, state };
  };
  const summary = async (id: string) =>
    (
      await db.query<{ v: Record<string, unknown> }>(
        "select company_subscription_summary($1) v",
        [id],
      )
    ).rows[0].v;
  const prepare = async (id: string, to: string, request = randomUUID()) => {
    await db.query("select prepare_company_plan_change($1,$2,$3,'test')", [
      id,
      request,
      to,
    ]);
    return request;
  };
  const attach = async (request: string) => {
    await service();
    await db.query("select attach_plan_change_quote($1,$2)", [
      request,
      JSON.stringify({
        currency: "usd",
        due_cents: 500,
        item_id: "si_test",
        period_start: now - 86400,
        period_end: now + 29 * 86400,
        proration_date: now,
      }),
    ]);
  };
  const confirm = (id: string, request: string) =>
    db.query("select company_plan_change($1,$2,true)", [id, request]);
  const invite = (company: string, email = `${randomUUID()}@example.test`) =>
    db.query(
      "select invite_company_user($1,$2,$3,'member','{\"clientes\":[\"read\"]}')",
      [company, randomUUID(), email],
    );
  const addCompany = (id: string) =>
    db.query("select create_subscription_company($1,$2,'Extra company')", [
      id,
      randomUUID(),
    ]);
  try {
    const initial = await paid("inicial");
    const request = await prepare(initial.id, "equipo");
    await t.test(
      "only the buyer can request/confirm; client and service privileges cannot be bypassed",
      async () => {
        const stranger = await paid("equipo");
        await assert.rejects(
          prepare(initial.id, "equipo"),
          /permission_denied/,
        );
        await assert.rejects(confirm(initial.id, request), /permission_denied/);
        await assert.rejects(
          db.query("select * from billing_plan_changes"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select record_plan_change_result($1,'applied',null,null)", [
            request,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "select app_private.apply_billing_snapshot_v095('evt_fake',1,$1,'{}')",
            ["a".repeat(64)],
          ),
          /permission denied/,
        );
        await as(initial.buyer);
        await assert.rejects(confirm(initial.id, request), /quote_expired/);
        await assert.rejects(prepare(initial.id, "profesional"), /conflict/);
        await service();
        await assert.rejects(
          db.query(
            "select prepare_company_plan_change($1,$2,'equipo','test')",
            [stranger.id, randomUUID()],
          ),
          /permission denied/,
        );
      },
    );
    await attach(request);
    await as(initial.buyer);
    await confirm(initial.id, request);
    await service();
    await assert.rejects(
      db.query("select start_plan_change_provider($1)", [request]),
      /operation_busy/,
    );
    const paymentLease = randomUUID();
    await db.query("select lease_plan_change($1,$2)", [request, paymentLease]);
    await db.query("select start_plan_change_provider($1)", [request]);
    await db.query("select start_plan_change_provider($1)", [request]);
    await db.query("select lease_plan_change($1,$2,true)", [
      request,
      paymentLease,
    ]);
    await as(initial.buyer);
    await t.test(
      "upgrade does not grant seats before payment and accepts only the confirmed prorated invoice",
      async () => {
        assert.equal((await summary(initial.id)).plan_code, "inicial");
        await assert.rejects(invite(initial.id), /subscription_user_limit/);
        const target = {
          ...initial.state,
          initial: false,
          plan_code: "equipo",
          plan_change_id: request,
          paid: false,
          invoice_paid: false,
          invoice_created: Math.floor(Date.now() / 1000),
        };
        await apply(target);
        await as(initial.buyer);
        assert.equal((await summary(initial.id)).plan_code, "inicial");
        await apply({
          ...target,
          invoice_paid: true,
          has_pending_update: true,
        });
        await as(initial.buyer);
        assert.equal((await summary(initial.id)).plan_code, "inicial");
        await apply({
          ...target,
          invoice_paid: true,
          invoice_created: now - 86400,
        });
        await as(initial.buyer);
        assert.equal((await summary(initial.id)).plan_code, "inicial");
        await apply({
          ...target,
          invoice_paid: true,
          has_pending_update: false,
        });
        await as(initial.buyer);
        assert.equal((await summary(initial.id)).plan_code, "equipo");
        assert.equal((await summary(initial.id)).plan_change, null);
        await invite(initial.id);
        await apply(
          { ...target, invoice_paid: true, has_pending_update: false },
          event,
        ); // exact event replay
        await apply({ ...initial.state, initial: false }, event - 100);
        await as(initial.buyer);
        assert.equal((await summary(initial.id)).plan_code, "equipo");
        await assert.rejects(
          apply({
            ...target,
            plan_code: "crecimiento",
            plan_change_id: randomUUID(),
            invoice_paid: true,
          }),
          /unverified/,
        );
      },
    );
    const team = await paid("equipo"),
      down = await prepare(team.id, "inicial");
    await attach(down);
    await as(team.buyer);
    await t.test(
      "confirmation rechecks capacity and a scheduled downgrade reserves future limits",
      async () => {
        await confirm(team.id, down);
        await assert.rejects(invite(team.id), /pending_user_limit/);
        await assert.rejects(addCompany(team.id), /pending_company_limit/);
        await service();
        await db.query(
          "select record_plan_change_result($1,'scheduled','sub_sched_test',null)",
          [down],
        );
        await as(team.buyer);
        assert.equal(
          ((await summary(team.id)).plan_change as { status: string }).status,
          "scheduled",
        );
        await assert.rejects(invite(team.id), /pending_user_limit/);
        await service();
        await db.query(
          "select record_plan_change_result($1,'canceled',null,null)",
          [down],
        );
        await as(team.buyer);
        await addCompany(team.id);
        await assert.rejects(
          prepare(team.id, "inicial"),
          /subscription_company_limit/,
        );
        const other = await paid("equipo"),
          attempt = await prepare(other.id, "inicial");
        await attach(attempt);
        await as(other.buyer);
        await invite(other.id);
        await assert.rejects(
          confirm(other.id, attempt),
          /subscription_user_limit/,
        );
      },
    );
    await t.test(
      "provider operations are serialized and quotes cannot be replaced or revived after expiry",
      async () => {
        const p = await paid("inicial"),
          r = await prepare(p.id, "equipo"),
          lock = randomUUID(),
          otherLock = randomUUID();
        await service();
        await db.query("select lease_plan_change($1,$2)", [r, lock]);
        await assert.rejects(
          db.query("select lease_plan_change($1,$2)", [r, otherLock]),
          /operation_busy/,
        );
        await db.query("select lease_plan_change($1,$2,true)", [r, otherLock]);
        await assert.rejects(
          db.query("select lease_plan_change($1,$2)", [r, otherLock]),
          /operation_busy/,
        );
        await db.query("select lease_plan_change($1,$2,true)", [r, lock]);
        await attach(r);
        await assert.rejects(
          db.query("select attach_plan_change_quote($1,$2)", [
            r,
            JSON.stringify({
              currency: "usd",
              item_id: "si_test",
              due_cents: 2,
            }),
          ]),
          /invalid_billing_plan_quote/,
        );
        await db.exec("reset role");
        await db.query(
          "update billing_plan_changes set expires_at=now()-interval '1 minute' where id=$1",
          [r],
        );
        await as(p.buyer);
        await assert.rejects(confirm(p.id, r), /quote_expired/);
        await prepare(p.id, "equipo");
      },
    );
    await t.test(
      "downgrade waits for its paid renewal and preserves invoice history and usage",
      async () => {
        const p = await paid("equipo"),
          r = await prepare(p.id, "inicial");
        const customer = randomUUID(),
          estimate = randomUUID();
        await db.query("select save_customer($1,$2,0,$3)", [
          p.id,
          customer,
          JSON.stringify({ full_name: "Fixture buyer", status: "active" }),
        ]);
        await db.query("select save_estimate($1,$2,0,$3)", [
          p.id,
          estimate,
          JSON.stringify({
            customer_id: customer,
            status: "PENDIENTE",
            estimate_date: "2026-01-02",
            valid_until: null,
            discount: "0",
            taxes: "0",
            notes: "Change plan",
            items: [
              { ...emptyItem, name: "Fixture service", unit_price: "10" },
            ],
          }),
        ]);
        await db.query(
          "select approve_estimate($1,$2,1,'2026-01-02','Fixture','Plan change')",
          [p.id, estimate],
        );
        await attach(r);
        await as(p.buyer);
        await confirm(p.id, r);
        const target = {
          ...p.state,
          initial: false,
          plan_code: "inicial",
          plan_change_id: r,
          invoice_paid: true,
          invoice_created: Math.floor(Date.now() / 1000),
          paid_through: new Date((now + 60 * 86400) * 1000).toISOString(),
        };
        await apply(target);
        await as(p.buyer);
        assert.equal((await summary(p.id)).plan_code, "equipo");
        await db.exec("reset role");
        await db.query(
          "update billing_plan_changes set effective_at=now()-interval '1 minute' where id=$1",
          [r],
        );
        await apply({ ...target, invoice_paid: false, status: "past_due" });
        await as(p.buyer);
        assert.equal((await summary(p.id)).plan_code, "equipo");
        assert.equal(
          Date.parse((await summary(p.id)).paid_through as string),
          Date.parse(p.state.paid_through),
        );
        await apply(target);
        await as(p.buyer);
        assert.equal((await summary(p.id)).plan_code, "inicial");
        assert.equal((await summary(p.id)).invoices_this_month, 1);
        assert.equal(
          (
            await db.query("select id from invoices where company_id=$1", [
              p.id,
            ])
          ).rows.length,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
