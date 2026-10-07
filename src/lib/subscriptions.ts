import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { assertDeploymentEnvironment } from "./deployment-environment";

export const subscriptionPlans = [
  {
    code: "inicial",
    name: "Inicial",
    amount: 2900,
    users: 3,
    description: "Para empezar con tu equipo",
  },
  {
    code: "equipo",
    name: "Equipo",
    amount: 5900,
    users: 5,
    description: "Para una empresa que está creciendo",
  },
  {
    code: "profesional",
    name: "Profesional",
    amount: 9900,
    users: 10,
    description: "Para coordinar oficina y campo",
  },
  {
    code: "crecimiento",
    name: "Crecimiento",
    amount: 17900,
    users: 25,
    description: "Para equipos con más personas",
  },
] as const;
export type PlanCode = (typeof subscriptionPlans)[number]["code"];
export type BillingConfig = {
  mode: "test" | "live";
  secret: string;
  webhookSecret: string;
  serviceKey: string;
  site: string;
  database: string;
  prices: Record<PlanCode, string>;
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
    if (
      !secret.startsWith(`sk_${mode}_`) ||
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
    if (
      Object.values(prices).some(
        (v) => !v || !/^price_[A-Za-z0-9]+$/.test(v),
      ) ||
      new Set(Object.values(prices)).size !== subscriptionPlans.length
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
  metadata: z.object({ saas_order: z.uuid() }),
  cancel_at_period_end: z.boolean(),
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
    })
    .nullable(),
});
type StripeReader = (path: string) => Promise<unknown>;

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
        paid: boolean;
      }
    | undefined;
  let subscriptionId = event.data.object.id;
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
      })
      .parse(event.data.object);
    subscriptionId =
      invoice.subscription ??
      invoice.parent?.subscription_details?.subscription ??
      "";
  }
  if (checkout) {
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
        metadata: z.object({ saas_order: z.uuid() }),
        customer_details: z.object({ email: z.email() }),
      })
      .parse(
        await read(
          `/checkout/sessions/${encodeURIComponent(event.data.object.id)}`,
        ),
      );
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
      paid: data.payment_status === "paid",
    };
    subscriptionId = data.subscription;
  }
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId))
    throw new Error("invalid_subscription");
  const current = subscription.parse(
    await read(
      `/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice`,
    ),
  );
  if (current.id !== subscriptionId || current.livemode !== event.livemode)
    throw new Error("billing_subscription_mismatch");
  if (
    session &&
    (session.customer !== current.customer ||
      session.order !== current.metadata.saas_order)
  )
    throw new Error("billing_checkout_mismatch");
  const item = current.items.data[0];
  const plan = subscriptionPlans.find(
    (p) => config.prices[p.code] === item.price.id,
  );
  if (
    !plan ||
    item.quantity !== 1 ||
    item.price.unit_amount !== plan.amount ||
    item.price.currency !== "usd"
  )
    throw new Error("billing_price_mismatch");
  const until = item.current_period_end ?? current.current_period_end;
  if (!until) throw new Error("billing_period_missing");
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
      subscription_id: current.id,
      customer_id: current.customer,
      mode: config.mode,
      plan_code: plan.code,
      status: current.status,
      paid: !!paid,
      paid_through: new Date(until * 1000).toISOString(),
      cancel_at_period_end: current.cancel_at_period_end,
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
