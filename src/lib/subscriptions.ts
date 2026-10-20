import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { assertDeploymentEnvironment } from "./deployment-environment";
import {
  billingCatalogVersion,
  legacyBillingCatalogVersion,
  legacySubscriptionPlans,
  subscriptionPlans,
  type PlanCode,
} from "./subscription-catalog";
export { subscriptionPlans, type PlanCode } from "./subscription-catalog";

// Pin REST responses and webhook endpoints to the same tested provider contract.
export const stripeApiVersion = "2026-09-30.endive";

export type BillingConfig = {
  mode: "test" | "live";
  secret: string;
  webhookSecret: string;
  serviceKey: string;
  site: string;
  database: string;
  prices: Record<PlanCode, string>;
  catalogVersion?: string;
  legacyPrices?: Partial<Record<PlanCode, string>>;
};
export function billingConfig(
  env: Record<string, string | undefined>,
): BillingConfig | null {
  try {
    const mode = z.enum(["test", "live"]).parse(env.SAAS_BILLING_MODE);
    assertDeploymentEnvironment(env);
    const site = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    const database = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (
      site.protocol !== "https:" ||
      site.username ||
      site.password ||
      database.protocol !== "https:" ||
      !/^[a-z]{20}[.]supabase[.]co$/.test(database.hostname) ||
      database.username ||
      database.password ||
      database.pathname !== "/"
    )
      return null;
    if (
      (mode === "live" && env.APP_ENVIRONMENT !== "production") ||
      (mode === "test" && env.APP_ENVIRONMENT !== "staging")
    )
      return null;
    const secret = env.SAAS_STRIPE_SECRET_KEY ?? "";
    const allowedKey =
      mode === "test"
        ? secret.startsWith("sk_test_") ||
          secret.startsWith("rk_test_") ||
          secret.startsWith("rkcs_test_")
        : secret.startsWith("sk_live_") || secret.startsWith("rk_live_");
    if (
      !allowedKey ||
      !env.SAAS_STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") ||
      !env.SAAS_BILLING_SUPABASE_SERVICE_KEY
    )
      return null;
    const prices = Object.fromEntries(
      subscriptionPlans.map((p) => [
        p.code,
        env[`SAAS_STRIPE_PRICE_${p.code.toUpperCase()}`],
      ]),
    ) as Record<PlanCode, string>;
    const catalogVersion =
      env.SAAS_BILLING_CATALOG_VERSION ?? legacyBillingCatalogVersion;
    if (
      ![billingCatalogVersion, legacyBillingCatalogVersion].includes(
        catalogVersion,
      )
    )
      return null;
    const legacyPrices = Object.fromEntries(
      subscriptionPlans.flatMap((p) => {
        const price = env[`SAAS_STRIPE_LEGACY_PRICE_${p.code.toUpperCase()}`];
        return price ? [[p.code, price]] : [];
      }),
    ) as Partial<Record<PlanCode, string>>;
    if (
      Object.values(prices).some(
        (v) => !v || !/^price_[A-Za-z0-9]+$/.test(v),
      ) ||
      new Set(Object.values(prices)).size !== subscriptionPlans.length ||
      Object.values(legacyPrices).some(
        (p) => !/^price_[A-Za-z0-9]+$/.test(p),
      ) ||
      new Set([...Object.values(prices), ...Object.values(legacyPrices)])
        .size !==
        subscriptionPlans.length + Object.keys(legacyPrices).length
    )
      return null;
    return {
      mode,
      secret,
      webhookSecret: env.SAAS_STRIPE_WEBHOOK_SECRET,
      serviceKey: env.SAAS_BILLING_SUPABASE_SERVICE_KEY,
      site: site.origin,
      database: database.origin,
      prices,
      catalogVersion,
      legacyPrices,
    };
  } catch {
    return null;
  }
}

// Validate the unmodified body, timestamp and any rotating v1 signature.
export function verifyBillingSignature(
  body: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  if (Buffer.byteLength(body) > 262144 || header.length > 2048)
    throw new Error("invalid_billing_signature");
  const parts = header.split(",").map((p) => p.split("="));
  const timestamps = parts.filter(([k]) => k === "t");
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0][1] ?? ""))
    throw new Error("invalid_billing_signature");
  const stamp = Number(timestamps[0][1]);
  if (!Number.isSafeInteger(stamp) || Math.abs(now / 1000 - stamp) > 300)
    throw new Error("invalid_billing_signature");
  const expected = createHmac("sha256", secret)
    .update(`${stamp}.${body}`)
    .digest();
  if (
    !parts.some(
      ([k, v]) =>
        k === "v1" &&
        /^[a-f0-9]{64}$/i.test(v ?? "") &&
        timingSafeEqual(expected, Buffer.from(v, "hex")),
    )
  )
    throw new Error("invalid_billing_signature");
  return createHash("sha256").update(body).digest("hex");
}

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]+$`));
const reference = (prefix: string) =>
  z
    .union([id(prefix), z.object({ id: id(prefix) })])
    .transform((v) => (typeof v === "string" ? v : v.id));
const stripeEvent = z.object({
  id: id("evt"),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  type: z.string(),
  data: z.object({
    object: z
      .object({ id: z.string(), subscription: reference("sub").nullish() })
      .passthrough(),
  }),
});
const subscription = z.object({
  id: id("sub"),
  customer: reference("cus"),
  livemode: z.boolean(),
  status: z.enum([
    "active",
    "past_due",
    "unpaid",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "paused",
    "trialing",
  ]),
  metadata: z.object({
    saas_order: z.uuid(),
    saas_reactivation: z.uuid().optional(),
    saas_plan_change: z.uuid().optional(),
  }),
  cancel_at_period_end: z.boolean(),
  cancel_at: z.number().int().positive().nullish(),
  pending_update: z.unknown().nullish(),
  items: z.object({
    data: z
      .array(
        z.object({
          quantity: z.number().int(),
          current_period_end: z.number().int().positive().optional(),
          price: z.object({
            id: id("price"),
            unit_amount: z.number().int(),
            currency: z.string(),
            recurring: z.object({
              interval: z.literal("month"),
              interval_count: z.literal(1),
            }),
          }),
        }),
      )
      .length(1),
  }),
  current_period_end: z.number().int().positive().optional(),
  latest_invoice: z
    .object({
      paid: z.boolean().optional(),
      status: z.string(),
      amount_paid: z.number().int().nonnegative(),
      currency: z.string(),
      id: z.string().optional(),
      amount_remaining: z.number().int().nonnegative().optional(),
      created: z.number().int().positive().optional(),
    })
    .nullable(),
});
type StripeReader = (path: string) => Promise<unknown>;

async function readScopedSubscription(
  subscriptionId: string,
  config: BillingConfig,
  read: StripeReader,
) {
  const raw = await read(
    `/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice`,
  );
  const routing = z
    .object({
      id: id("sub"),
      livemode: z.boolean(),
      metadata: z.record(z.string(), z.string()),
      items: z.object({
        data: z.array(z.object({ price: z.object({ id: id("price") }) })),
      }),
    })
    .parse(raw);
  if (
    routing.id !== subscriptionId ||
    routing.livemode !== (config.mode === "live")
  )
    throw new Error("billing_subscription_mismatch");
  const prices = new Set([
    ...Object.values(config.prices),
    ...Object.values(config.legacyPrices ?? {}),
  ]);
  // One Stripe account can serve other applications. A known SaaS price still
  // requires strict validation when its ownership metadata is missing or damaged.
  if (
    !Object.hasOwn(routing.metadata, "saas_order") &&
    !routing.items.data.some((item) => prices.has(item.price.id))
  )
    return null;
  return subscription.parse(raw);
}

// Verify the provider price BEFORE opening a payable Checkout. A stale price ID
// must never charge the previous catalog while advertising the new amount.
export async function verifyCheckoutPrice(
  config: BillingConfig,
  code: PlanCode,
  read: StripeReader,
) {
  if (config.catalogVersion !== billingCatalogVersion)
    throw new Error("billing_catalog_not_configured");
  const plan = subscriptionPlans.find((p) => p.code === code);
  if (!plan) throw new Error("billing_price_mismatch");
  const price = z
    .object({
      id: id("price"),
      active: z.literal(true),
      livemode: z.boolean(),
      currency: z.literal("usd"),
      unit_amount: z.number().int(),
      recurring: z.object({
        interval: z.literal("month"),
        interval_count: z.literal(1),
      }),
    })
    .parse(await read(`/prices/${encodeURIComponent(config.prices[code])}`));
  if (
    price.id !== config.prices[code] ||
    price.unit_amount !== plan.amount ||
    price.livemode !== (config.mode === "live")
  )
    throw new Error("billing_price_mismatch");
}

export async function verifiedBillingSnapshot(
  body: string,
  config: BillingConfig,
  read: StripeReader,
) {
  const event = stripeEvent.parse(JSON.parse(body));
  if (event.livemode !== (config.mode === "live"))
    throw new Error("billing_mode_mismatch");
  const checkout = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ].includes(event.type);
  const invoiceEvent = ["invoice.paid", "invoice.payment_failed"].includes(
    event.type,
  );
  if (
    !checkout &&
    !invoiceEvent &&
    ![
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  )
    return null;
  let session:
    | {
        id: string;
        customer: string;
        subscription: string;
        email: string;
        order: string;
        reactivation?: string;
        paid: boolean;
      }
    | undefined;
  let subscriptionId = event.data.object.id;
  let fetchedSubscription: z.infer<typeof subscription> | undefined;
  if (invoiceEvent) {
    const invoice = z
      .object({
        subscription: reference("sub").nullish(),
        parent: z
          .object({
            subscription_details: z
              .object({ subscription: reference("sub") })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
        metadata: z.record(z.string(), z.string()).nullish(),
      })
      .parse(event.data.object);
    subscriptionId =
      invoice.subscription ??
      invoice.parent?.subscription_details?.subscription ??
      "";
    // A paid one-off invoice from another application has no subscription.
    if (!subscriptionId && !Object.hasOwn(invoice.metadata ?? {}, "saas_order"))
      return null;
  }
  if (checkout) {
    const raw = await read(
      `/checkout/sessions/${encodeURIComponent(event.data.object.id)}`,
    );
    const routing = z
      .object({
        id: id("cs"),
        livemode: z.boolean(),
        mode: z.enum(["payment", "setup", "subscription"]),
        metadata: z.record(z.string(), z.string()),
        subscription: reference("sub").nullish(),
      })
      .parse(raw);
    if (
      routing.id !== event.data.object.id ||
      routing.livemode !== event.livemode
    )
      throw new Error("billing_checkout_mismatch");
    if (!Object.hasOwn(routing.metadata, "saas_order")) {
      if (routing.mode !== "subscription") return null;
      if (!routing.subscription) throw new Error("invalid_subscription");
      const scoped = await readScopedSubscription(
        routing.subscription,
        config,
        read,
      );
      if (!scoped) return null;
      fetchedSubscription = scoped;
    }
    const data = z
      .object({
        id: id("cs"),
        mode: z.literal("subscription"),
        status: z.literal("complete"),
        livemode: z.boolean(),
        customer: reference("cus"),
        subscription: reference("sub"),
        payment_status: z.string(),
        client_reference_id: z.uuid(),
        metadata: z.object({
          saas_order: z.uuid(),
          saas_reactivation: z.uuid().optional(),
        }),
        customer_details: z.object({ email: z.email() }),
      })
      .parse(raw);
    if (
      data.livemode !== event.livemode ||
      data.metadata.saas_order !== data.client_reference_id ||
      data.id !== event.data.object.id
    )
      throw new Error("billing_checkout_mismatch");
    session = {
      id: data.id,
      customer: data.customer,
      subscription: data.subscription,
      email: data.customer_details.email.toLowerCase(),
      order: data.client_reference_id,
      reactivation: data.metadata.saas_reactivation,
      paid: data.payment_status === "paid",
    };
    subscriptionId = data.subscription;
  }
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId))
    throw new Error("invalid_subscription");
  const current =
    fetchedSubscription ??
    (await readScopedSubscription(subscriptionId, config, read));
  if (!current) {
    if (session) throw new Error("billing_checkout_mismatch");
    return null;
  }
  if (current.id !== subscriptionId || current.livemode !== event.livemode)
    throw new Error("billing_subscription_mismatch");
  if (
    session &&
    (session.customer !== current.customer ||
      session.order !== current.metadata.saas_order ||
      session.reactivation !== current.metadata.saas_reactivation)
  )
    throw new Error("billing_checkout_mismatch");
  const item = current.items.data[0];
  const catalogVersion = config.catalogVersion ?? legacyBillingCatalogVersion;
  const catalog =
    catalogVersion === billingCatalogVersion
      ? subscriptionPlans
      : legacySubscriptionPlans;
  const currentPlan = catalog.find(
    (p) => config.prices[p.code] === item.price.id,
  );
  const legacyPlan = legacySubscriptionPlans.find(
    (p) => config.legacyPrices?.[p.code] === item.price.id,
  );
  const plan = currentPlan ?? legacyPlan;
  const verifiedCatalogVersion = currentPlan
    ? catalogVersion
    : legacyBillingCatalogVersion;
  if (
    !plan ||
    item.quantity !== 1 ||
    item.price.unit_amount !== plan.amount ||
    item.price.currency !== "usd"
  )
    throw new Error("billing_price_mismatch");
  const until = item.current_period_end ?? current.current_period_end;
  if (!until) throw new Error("billing_period_missing");
  // The portal can schedule cancellation with a timestamp while leaving the
  // boolean false. A cancellation within this paid period also bounds access.
  const paidUntil = Math.min(until, current.cancel_at ?? until);
  const endsThisPeriod =
    current.cancel_at_period_end ||
    (current.cancel_at != null && current.cancel_at <= until);
  const paid = session
    ? session.paid
    : current.latest_invoice?.status === "paid" &&
      current.latest_invoice.currency === "usd" &&
      current.latest_invoice.amount_paid >= plan.amount;
  return {
    event: event.id,
    created: event.created,
    snapshot: {
      order_id: current.metadata.saas_order,
      reactivation_id: current.metadata.saas_reactivation ?? null,
      plan_change_id: current.metadata.saas_plan_change ?? null,
      invoice_created: current.latest_invoice?.created ?? null,
      has_pending_update: current.pending_update != null,
      invoice_paid:
        current.latest_invoice?.status === "paid" &&
        current.latest_invoice.currency === "usd" &&
        current.latest_invoice.amount_remaining === 0,
      subscription_id: current.id,
      customer_id: current.customer,
      mode: config.mode,
      plan_code: plan.code,
      catalog_version: verifiedCatalogVersion,
      status: current.status,
      paid: !!paid,
      paid_through: new Date(paidUntil * 1000).toISOString(),
      cancel_at_period_end: endsThisPeriod,
      initial: !!session,
      checkout_id: session?.id ?? null,
      email: session?.email ?? null,
    },
  };
}

export function checkoutParameters(
  config: BillingConfig,
  order: { id: string; email: string; code: PlanCode },
) {
  z.uuid().parse(order.id);
  z.email().parse(order.email);
  const params = new URLSearchParams({
    mode: "subscription",
    customer_email: order.email,
    client_reference_id: order.id,
    "line_items[0][price]": config.prices[order.code],
    "line_items[0][quantity]": "1",
    success_url: `${config.site}/suscripcion/completada`,
    cancel_url: `${config.site}/planes?cancelado=1`,
    "metadata[saas_order]": order.id,
    "subscription_data[metadata][saas_order]": order.id,
  });
  return params;
}

export function reactivationCheckoutParameters(
  config: BillingConfig,
  offer: {
    id: string;
    order_id: string;
    company_id: string;
    email: string;
    plan_code: PlanCode;
    customer_id: string;
  },
) {
  z.uuid().parse(offer.id);
  z.uuid().parse(offer.company_id);
  id("cus").parse(offer.customer_id);
  const params = checkoutParameters(config, {
    id: offer.order_id,
    email: offer.email,
    code: offer.plan_code,
  });
  params.delete("customer_email");
  params.set("customer", offer.customer_id);
  params.set("metadata[saas_reactivation]", offer.id);
  params.set("subscription_data[metadata][saas_reactivation]", offer.id);
  const destination = `${config.site}/app/${offer.company_id}/configuracion`;
  params.set("success_url", destination);
  params.set("cancel_url", destination);
  return params;
}
