import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  verifiedBillingSnapshot,
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
  legacyPrices: { equipo: "price_OldEquipo" },
};

function event(type: string, object: Record<string, unknown>) {
  return JSON.stringify({
    id: "evt_scope",
    created: 1900000000,
    livemode: false,
    type,
    data: { object },
  });
}
const foreignSubscription = {
  id: "sub_external",
  livemode: false,
  metadata: { application: "other" },
  // Other products can use multiple items, yearly prices and unrelated statuses.
  status: "active",
  items: {
    data: [
      { price: { id: "price_ExternalYearly" } },
      { price: { id: "price_ExternalExtra" } },
    ],
  },
};
const foreignCheckout = {
  id: "cs_external",
  livemode: false,
  mode: "payment",
  metadata: { application: "other" },
  subscription: null,
};

test("other applications' one-off and setup checkouts are acknowledged without a billing snapshot", async () => {
  for (const type of [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ]) {
    for (const mode of ["payment", "setup"]) {
      const reads: string[] = [];
      const snapshot = await verifiedBillingSnapshot(
        event(type, { id: foreignCheckout.id }),
        config,
        async (path) => {
          reads.push(path);
          return { ...foreignCheckout, mode };
        },
      );
      assert.equal(snapshot, null);
      assert.deepEqual(reads, ["/checkout/sessions/cs_external"]);
    }
  }
});

test("one-off invoice events have no subscription and grant no SaaS access", async () => {
  for (const type of ["invoice.paid", "invoice.payment_failed"]) {
    for (const detail of [
      { subscription: null },
      { parent: null },
      { parent: { type: "quote_details" } },
    ]) {
      assert.equal(
        await verifiedBillingSnapshot(
          event(type, { id: "in_external", ...detail }),
          config,
          async () => {
            throw new Error("one-off invoices must not fetch subscriptions");
          },
        ),
        null,
      );
    }
  }
});

test("unrelated recurring products are ignored after provider identity and ownership checks", async () => {
  for (const type of [
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]) {
    const object = type.startsWith("invoice.")
      ? {
          id: "in_external",
          parent: {
            subscription_details: { subscription: { id: "sub_external" } },
          },
        }
      : { id: "sub_external" };
    const paths: string[] = [];
    assert.equal(
      await verifiedBillingSnapshot(
        event(type, object),
        config,
        async (path) => {
          paths.push(path);
          return foreignSubscription;
        },
      ),
      null,
    );
    assert.deepEqual(paths, [
      "/subscriptions/sub_external?expand[]=latest_invoice",
    ]);
  }
  assert.equal(
    await verifiedBillingSnapshot(
      event("checkout.session.completed", { id: "cs_external" }),
      config,
      async (path) =>
        path.startsWith("/checkout/")
          ? {
              ...foreignCheckout,
              mode: "subscription",
              subscription: "sub_external",
            }
          : foreignSubscription,
    ),
    null,
  );
});

test("missing SaaS ownership on current or legacy prices remains an error, not an ignored event", async () => {
  for (const price of [config.prices.equipo, config.legacyPrices!.equipo!]) {
    const current = {
      ...foreignSubscription,
      items: { data: [{ price: { id: price } }] },
    };
    for (const type of [
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "checkout.session.completed",
    ]) {
      const object = type.startsWith("checkout.")
        ? { id: "cs_external" }
        : type.startsWith("invoice.")
          ? { id: "in_external", subscription: "sub_external" }
          : { id: "sub_external" };
      await assert.rejects(
        verifiedBillingSnapshot(event(type, object), config, async (path) =>
          path.startsWith("/checkout/")
            ? {
                ...foreignCheckout,
                mode: "subscription",
                subscription: "sub_external",
              }
            : current,
        ),
      );
    }
  }
});

test("present but damaged SaaS metadata never classifies an event as unrelated", async () => {
  for (const marker of ["", "bad-order", randomUUID()]) {
    await assert.rejects(
      verifiedBillingSnapshot(
        event("checkout.session.completed", { id: "cs_external" }),
        config,
        async () => ({ ...foreignCheckout, metadata: { saas_order: marker } }),
      ),
    );
    await assert.rejects(
      verifiedBillingSnapshot(
        event("customer.subscription.updated", { id: "sub_external" }),
        config,
        async () => ({
          ...foreignSubscription,
          metadata: { saas_order: marker },
        }),
      ),
    );
    await assert.rejects(
      verifiedBillingSnapshot(
        event("invoice.paid", {
          id: "in_external",
          metadata: { saas_order: marker },
        }),
        config,
        async () => {
          throw new Error("invalid subscription");
        },
      ),
    );
  }
});

test("foreign objects cannot bypass provider ID or environment verification", async () => {
  for (const patch of [{ id: "cs_substituted" }, { livemode: true }]) {
    await assert.rejects(
      verifiedBillingSnapshot(
        event("checkout.session.completed", { id: "cs_external" }),
        config,
        async () => ({ ...foreignCheckout, ...patch }),
      ),
      /billing_checkout_mismatch/,
    );
  }
  for (const patch of [{ id: "sub_substituted" }, { livemode: true }]) {
    await assert.rejects(
      verifiedBillingSnapshot(
        event("customer.subscription.updated", { id: "sub_external" }),
        config,
        async () => ({ ...foreignSubscription, ...patch }),
      ),
      /billing_subscription_mismatch/,
    );
  }
  await assert.rejects(
    verifiedBillingSnapshot(
      JSON.stringify({
        id: "evt_live",
        created: 1900000000,
        livemode: true,
        type: "invoice.paid",
        data: { object: { id: "in_external" } },
      }),
      config,
      async () => {
        throw new Error("must not fetch");
      },
    ),
    /billing_mode_mismatch/,
  );
});

test("provider failures keep webhook retries enabled", async () => {
  for (const [type, id] of [
    ["checkout.session.completed", "cs_external"],
    ["customer.subscription.updated", "sub_external"],
  ]) {
    await assert.rejects(
      verifiedBillingSnapshot(event(type, { id }), config, async () => {
        throw new Error("provider temporarily unavailable");
      }),
      /provider temporarily unavailable/,
    );
  }
});

test("a SaaS checkout cannot substitute an unrelated subscription", async () => {
  const order = randomUUID();
  const checkout = {
    ...foreignCheckout,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    customer: "cus_saas",
    subscription: "sub_external",
    client_reference_id: order,
    metadata: { saas_order: order },
    customer_details: { email: "buyer@example.invalid" },
  };
  await assert.rejects(
    verifiedBillingSnapshot(
      event("checkout.session.completed", { id: checkout.id }),
      config,
      async (path) =>
        path.startsWith("/checkout/") ? checkout : foreignSubscription,
    ),
    /billing_checkout_mismatch/,
  );
});
