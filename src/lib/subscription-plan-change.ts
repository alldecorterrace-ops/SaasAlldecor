import { z } from "zod";
import { billingCatalogVersion } from "./subscription-catalog";
import { verifyCheckoutPrice, type BillingConfig } from "./subscriptions";

const code = z.enum(["inicial", "equipo", "profesional", "crecimiento"]);
const providerId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]+$`));
const reference = (prefix: string) =>
  z
    .union([providerId(prefix), z.object({ id: providerId(prefix) })])
    .transform((v) => (typeof v === "string" ? v : v.id));
export const planQuoteSchema = z.object({
  currency: z.literal("usd"),
  due_cents: z.number().int().nonnegative(),
  item_id: providerId("si"),
  period_start: z.number().int().positive(),
  period_end: z.number().int().positive(),
  proration_date: z.number().int().positive(),
});
export const planChangeOfferSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  company_id: z.uuid(),
  owner_id: z.uuid(),
  subscription_id: providerId("sub"),
  customer_id: providerId("cus"),
  from_code: code,
  to_code: code,
  catalog_version: z.literal(billingCatalogVersion),
  mode: z.enum(["test", "live"]),
  direction: z.enum(["upgrade", "downgrade"]),
  status: z.enum([
    "quoted",
    "processing",
    "pending_payment",
    "scheduled",
    "applied",
    "canceled",
  ]),
  quote: planQuoteSchema.nullable(),
  expires_at: z.string(),
  confirmed_at: z.string().nullable(),
  effective_at: z.string().nullable(),
  schedule_id: providerId("sub_sched").nullable(),
  invoice_id: providerId("in").nullable(),
  completed_schedule_id: providerId("sub_sched").nullish(),
  provider_started_at: z.string().nullish(),
});
export type PlanChangeOffer = z.infer<typeof planChangeOfferSchema>;
export type PlanQuote = z.infer<typeof planQuoteSchema>;
export type StripeCall = (
  path: string,
  params?: URLSearchParams,
  key?: string,
) => Promise<unknown>;
export type ChangePorts = {
  stripe: StripeCall;
  beforeMutation(): Promise<void>;
  record(
    status: "processing" | "pending_payment" | "scheduled" | "canceled",
    schedule?: string,
    invoice?: string,
  ): Promise<void>;
  sync(): Promise<void>;
};
const invoiceSchema = z.object({
  id: providerId("in"),
  customer: reference("cus"),
  livemode: z.boolean(),
  currency: z.literal("usd"),
  status: z.string(),
  amount_remaining: z.number().int().nonnegative(),
  hosted_invoice_url: z.string().nullable().optional(),
});
const currentSchema = z.object({
  id: providerId("sub"),
  customer: reference("cus"),
  livemode: z.boolean(),
  status: z.string(),
  metadata: z.record(z.string(), z.string()),
  cancel_at_period_end: z.boolean(),
  cancel_at: z.number().nullish(),
  pending_update: z.unknown().nullish(),
  schedule: reference("sub_sched").nullish(),
  latest_invoice: invoiceSchema.nullable(),
  collection_method: z.literal("charge_automatically"),
  items: z.object({
    data: z
      .array(
        z.object({
          id: providerId("si"),
          quantity: z.literal(1),
          current_period_start: z.number().int().positive(),
          current_period_end: z.number().int().positive(),
          price: z.object({ id: providerId("price") }),
          tax_rates: z.array(z.unknown()).optional(),
          discounts: z.array(z.unknown()).optional(),
        }),
      )
      .length(1),
  }),
  discounts: z.array(z.unknown()).optional(),
  default_tax_rates: z.array(z.unknown()).optional(),
  automatic_tax: z.object({ enabled: z.boolean() }).optional(),
  pause_collection: z.unknown().nullish(),
  pending_invoice_item_interval: z.unknown().nullish(),
  application_fee_percent: z.number().nullish(),
  transfer_data: z.unknown().nullish(),
  on_behalf_of: z.unknown().nullish(),
  trial_end: z.number().nullish(),
});
type Current = z.infer<typeof currentSchema>;
async function currentSubscription(
  config: BillingConfig,
  offer: PlanChangeOffer,
  stripe: StripeCall,
) {
  if (
    offer.mode !== config.mode ||
    offer.catalog_version !== config.catalogVersion
  )
    throw new Error("billing_mode_mismatch");
  const current = currentSchema.parse(
    await stripe(
      `/subscriptions/${offer.subscription_id}?expand[]=latest_invoice`,
    ),
  );
  if (
    current.id !== offer.subscription_id ||
    current.customer !== offer.customer_id ||
    current.livemode !== (config.mode === "live") ||
    current.metadata.saas_order !== offer.order_id
  )
    throw new Error("billing_subscription_mismatch");
  return current;
}
function sourceIsUnchanged(
  config: BillingConfig,
  offer: PlanChangeOffer,
  current: Current,
) {
  const item = current.items.data[0];
  if (
    current.status !== "active" ||
    current.cancel_at_period_end ||
    current.cancel_at ||
    item.price.id !== config.prices[offer.from_code] ||
    (offer.quote &&
      (item.id !== offer.quote.item_id ||
        item.current_period_start !== offer.quote.period_start ||
        item.current_period_end !== offer.quote.period_end))
  )
    throw new Error("billing_plan_change_conflict");
}
function supportsAutomaticChange(current: Current) {
  const item = current.items.data[0];
  // Preserve negotiated subscriptions: these settings need an explicit quote of
  // their own and must never disappear when a future schedule phase is replaced.
  if (
    current.discounts?.length ||
    current.default_tax_rates?.length ||
    current.automatic_tax?.enabled ||
    item.discounts?.length ||
    item.tax_rates?.length ||
    current.pause_collection ||
    current.pending_invoice_item_interval ||
    current.application_fee_percent ||
    current.transfer_data ||
    current.on_behalf_of ||
    current.trial_end
  )
    throw new Error("billing_plan_change_custom_terms");
}
function previewParameters(
  config: BillingConfig,
  offer: PlanChangeOffer,
  quote: PlanQuote,
) {
  return new URLSearchParams({
    subscription: offer.subscription_id,
    "subscription_details[items][0][id]": quote.item_id,
    "subscription_details[items][0][price]": config.prices[offer.to_code],
    "subscription_details[items][0][quantity]": "1",
    "subscription_details[proration_behavior]": "always_invoice",
    "subscription_details[proration_date]": String(quote.proration_date),
  });
}
async function dueNow(
  config: BillingConfig,
  offer: PlanChangeOffer,
  quote: PlanQuote,
  stripe: StripeCall,
) {
  const invoice = z
    .object({
      currency: z.literal("usd"),
      amount_due: z.number().int().nonnegative(),
    })
    .parse(
      await stripe(
        "/invoices/create_preview",
        previewParameters(config, offer, quote),
      ),
    );
  return invoice.amount_due;
}
export async function quotePlanChange(
  config: BillingConfig,
  offer: PlanChangeOffer,
  stripe: StripeCall,
  now = Date.now(),
): Promise<PlanQuote> {
  if (offer.status !== "quoted" || Date.parse(offer.expires_at) <= now)
    throw new Error("billing_plan_quote_expired");
  let current = await currentSubscription(config, offer, stripe);
  // Stripe retains the final schedule phase for its first cycle. Releasing an
  // already-paid downgrade keeps its current price and allows a later change.
  if (current.schedule && current.schedule === offer.completed_schedule_id) {
    const schedule = scheduleSchema.parse(
      await stripe(`/subscription_schedules/${current.schedule}`),
    );
    if (
      schedule.id !== current.schedule ||
      schedule.subscription !== offer.subscription_id ||
      schedule.livemode !== (config.mode === "live") ||
      schedule.status !== "active" ||
      !current.metadata.saas_plan_change ||
      schedule.metadata.saas_plan_change !== current.metadata.saas_plan_change
    )
      throw new Error("billing_schedule_mismatch");
    await stripe(
      `/subscription_schedules/${schedule.id}/release`,
      new URLSearchParams({ preserve_cancel_date: "true" }),
      `saas-plan-completed-release-${schedule.id}`,
    );
    current = await currentSubscription(config, offer, stripe);
  }
  sourceIsUnchanged(config, offer, current);
  supportsAutomaticChange(current);
  if (current.pending_update || current.schedule)
    throw new Error("billing_plan_change_conflict");
  await verifyCheckoutPrice(config, offer.to_code, stripe);
  const item = current.items.data[0];
  const quote: PlanQuote = offer.quote ?? {
    currency: "usd",
    due_cents: 0,
    item_id: item.id,
    period_start: item.current_period_start,
    period_end: item.current_period_end,
    proration_date: Math.floor(now / 1000),
  };
  if (quote.period_end * 1000 <= now)
    throw new Error("billing_plan_quote_expired");
  const amount =
    offer.direction === "upgrade"
      ? await dueNow(config, offer, quote, stripe)
      : 0;
  if (offer.quote && amount !== offer.quote.due_cents)
    throw new Error("billing_plan_quote_changed");
  return { ...quote, due_cents: amount };
}
export function upgradeParameters(
  config: BillingConfig,
  offer: PlanChangeOffer,
) {
  if (!offer.quote || offer.direction !== "upgrade")
    throw new Error("billing_plan_quote_missing");
  return new URLSearchParams({
    "items[0][id]": offer.quote.item_id,
    "items[0][price]": config.prices[offer.to_code],
    "items[0][quantity]": "1",
    payment_behavior: "pending_if_incomplete",
    proration_behavior: "always_invoice",
    proration_date: String(offer.quote.proration_date),
    "metadata[saas_plan_change]": offer.id,
    "expand[]": "latest_invoice",
  });
}
const scheduleSchema = z.object({
  id: providerId("sub_sched"),
  subscription: reference("sub").nullish(),
  released_subscription: reference("sub").nullish(),
  livemode: z.boolean(),
  status: z.enum([
    "not_started",
    "active",
    "completed",
    "released",
    "canceled",
  ]),
  metadata: z.record(z.string(), z.string()),
  phases: z
    .array(z.object({ start_date: z.number(), end_date: z.number() }))
    .optional(),
});
function verifySchedule(
  value: unknown,
  config: BillingConfig,
  offer: PlanChangeOffer,
) {
  const schedule = scheduleSchema.parse(value);
  if (
    schedule.livemode !== (config.mode === "live") ||
    (schedule.subscription ?? schedule.released_subscription) !==
      offer.subscription_id ||
    (offer.schedule_id && schedule.id !== offer.schedule_id) ||
    (schedule.metadata.saas_plan_change &&
      schedule.metadata.saas_plan_change !== offer.id)
  )
    throw new Error("billing_schedule_mismatch");
  return schedule;
}
export function downgradeParameters(
  config: BillingConfig,
  offer: PlanChangeOffer,
  metadata: Record<string, string>,
) {
  if (!offer.quote || offer.direction !== "downgrade")
    throw new Error("billing_plan_quote_missing");
  const params = new URLSearchParams({
    end_behavior: "release",
    proration_behavior: "none",
    "metadata[saas_plan_change]": offer.id,
    "phases[0][start_date]": String(offer.quote.period_start),
    "phases[0][end_date]": String(offer.quote.period_end),
    "phases[0][items][0][price]": config.prices[offer.from_code],
    "phases[0][items][0][quantity]": "1",
    "phases[0][proration_behavior]": "none",
    "phases[1][items][0][price]": config.prices[offer.to_code],
    "phases[1][items][0][quantity]": "1",
    "phases[1][duration][interval]": "month",
    "phases[1][duration][interval_count]": "1",
    "phases[1][proration_behavior]": "none",
  });
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`phases[0][metadata][${key}]`, value);
    params.set(`phases[1][metadata][${key}]`, value);
  }
  params.set("phases[1][metadata][saas_plan_change]", offer.id);
  return params;
}
function invoicePaymentUrl(
  invoice: z.infer<typeof invoiceSchema>,
  offer: PlanChangeOffer,
) {
  if (
    invoice.customer !== offer.customer_id ||
    invoice.livemode !== (offer.mode === "live")
  )
    throw new Error("billing_invoice_mismatch");
  if (!invoice.hosted_invoice_url || invoice.status !== "open")
    return undefined;
  const url = new URL(invoice.hosted_invoice_url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "invoice.stripe.com" ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error("invalid_billing_redirect");
  return url.href;
}
export async function executePlanChange(
  config: BillingConfig,
  offer: PlanChangeOffer,
  ports: ChangePorts,
  now = Date.now(),
): Promise<{ paymentUrl?: string }> {
  if (offer.status === "applied" || offer.status === "canceled") return {};
  if (!offer.confirmed_at || !offer.quote || offer.status === "quoted")
    throw new Error("billing_plan_not_confirmed");
  const current = await currentSubscription(config, offer, ports.stripe);
  if (
    current.items.data[0].price.id === config.prices[offer.to_code] &&
    current.metadata.saas_plan_change === offer.id
  ) {
    await ports.sync();
    return {};
  }
  sourceIsUnchanged(config, offer, current);
  if (offer.status === "pending_payment" && offer.invoice_id) {
    const invoice = invoiceSchema.parse(
      await ports.stripe(`/invoices/${offer.invoice_id}`),
    );
    if (invoice.id !== offer.invoice_id)
      throw new Error("billing_invoice_mismatch");
    const paymentUrl = invoicePaymentUrl(invoice, offer);
    if (invoice.status === "void" || invoice.status === "uncollectible")
      await ports.record("canceled");
    await ports.sync();
    return { paymentUrl };
  }
  if (offer.status === "scheduled") {
    if (!offer.schedule_id) throw new Error("billing_schedule_mismatch");
    const schedule = verifySchedule(
      await ports.stripe(`/subscription_schedules/${offer.schedule_id}`),
      config,
      offer,
    );
    if (["released", "canceled", "completed"].includes(schedule.status))
      await ports.record("canceled");
    await ports.sync();
    return {};
  }
  // A retry uses identical parameters and the same idempotency key. After the
  // provider's retention window, reconcile/cancel first rather than charge again.
  if (now - Date.parse(offer.confirmed_at) > 22 * 3600000)
    throw new Error("billing_plan_retry_expired");
  supportsAutomaticChange(current);
  await verifyCheckoutPrice(config, offer.to_code, ports.stripe);
  if (offer.direction === "upgrade") {
    if (current.schedule) throw new Error("billing_plan_change_conflict");
    if (
      !current.pending_update &&
      (await dueNow(config, offer, offer.quote, ports.stripe)) !==
        offer.quote.due_cents
    )
      throw new Error("billing_plan_quote_changed");
    await ports.beforeMutation();
    const result = currentSchema.parse(
      await ports.stripe(
        `/subscriptions/${offer.subscription_id}`,
        upgradeParameters(config, offer),
        `saas-plan-upgrade-${offer.id}`,
      ),
    );
    if (
      result.id !== offer.subscription_id ||
      result.customer !== offer.customer_id ||
      result.livemode !== (config.mode === "live")
    )
      throw new Error("billing_subscription_mismatch");
    const invoice = result.latest_invoice;
    if (!invoice) throw new Error("billing_invoice_missing");
    const paymentUrl = invoicePaymentUrl(invoice, offer);
    await ports.record("pending_payment", undefined, invoice.id);
    await ports.sync();
    return { paymentUrl };
  }
  if (
    current.pending_update ||
    (current.schedule &&
      offer.schedule_id &&
      current.schedule !== offer.schedule_id)
  )
    throw new Error("billing_plan_change_conflict");
  // from_subscription cannot be combined with phases. Persist its ID before the
  // second request so a disconnect can resume/release precisely this schedule.
  if (!offer.schedule_id) await ports.beforeMutation();
  const schedule = verifySchedule(
    offer.schedule_id
      ? await ports.stripe(`/subscription_schedules/${offer.schedule_id}`)
      : await ports.stripe(
          "/subscription_schedules",
          new URLSearchParams({ from_subscription: offer.subscription_id }),
          `saas-plan-schedule-${offer.id}`,
        ),
    config,
    offer,
  );
  await ports.record("processing", schedule.id);
  if (
    schedule.status !== "active" ||
    schedule.phases?.[0]?.start_date !== offer.quote.period_start ||
    schedule.phases[0].end_date !== offer.quote.period_end
  )
    throw new Error("billing_schedule_mismatch");
  verifySchedule(
    await ports.stripe(
      `/subscription_schedules/${schedule.id}`,
      downgradeParameters(config, offer, current.metadata),
      `saas-plan-phases-${offer.id}`,
    ),
    config,
    { ...offer, schedule_id: schedule.id },
  );
  await ports.record("scheduled", schedule.id);
  return {};
}
export async function cancelPlanChange(
  config: BillingConfig,
  offer: PlanChangeOffer,
  ports: ChangePorts,
) {
  if (["applied", "canceled"].includes(offer.status)) return;
  if (offer.status === "quoted") {
    await ports.record("canceled");
    return;
  }
  const current = await currentSubscription(config, offer, ports.stripe);
  if (
    current.items.data[0].price.id === config.prices[offer.to_code] &&
    current.metadata.saas_plan_change === offer.id
  ) {
    await ports.sync();
    return;
  }
  if (current.items.data[0].price.id !== config.prices[offer.from_code])
    throw new Error("billing_plan_change_conflict");
  if (offer.provider_started_at && !offer.invoice_id && !offer.schedule_id)
    throw new Error("billing_plan_reconcile_first");
  if (offer.direction === "downgrade") {
    if (current.schedule && !offer.schedule_id)
      throw new Error("billing_plan_reconcile_first");
    if (offer.schedule_id) {
      const schedule = verifySchedule(
        await ports.stripe(`/subscription_schedules/${offer.schedule_id}`),
        config,
        offer,
      );
      if (schedule.status === "active" || schedule.status === "not_started")
        verifySchedule(
          await ports.stripe(
            `/subscription_schedules/${schedule.id}/release`,
            new URLSearchParams({ preserve_cancel_date: "true" }),
            `saas-plan-release-${offer.id}`,
          ),
          config,
          offer,
        );
    }
  } else if (current.pending_update) {
    if (!offer.invoice_id || current.latest_invoice?.id !== offer.invoice_id)
      throw new Error("billing_plan_reconcile_first");
    const invoice = invoiceSchema.parse(
      await ports.stripe(`/invoices/${offer.invoice_id}`),
    );
    invoicePaymentUrl(invoice, offer);
    if (invoice.status === "paid") {
      await ports.sync();
      return;
    }
    if (invoice.status !== "open")
      throw new Error("billing_plan_reconcile_first");
    await ports.stripe(
      `/invoices/${offer.invoice_id}/void`,
      new URLSearchParams(),
      `saas-plan-void-${offer.id}`,
    );
  }
  // Re-read after release/void: a simultaneous payment must win over cancellation.
  const after = await currentSubscription(config, offer, ports.stripe);
  if (after.items.data[0].price.id === config.prices[offer.to_code]) {
    await ports.sync();
    return;
  }
  if (
    after.pending_update ||
    (offer.direction === "downgrade" && after.schedule)
  )
    throw new Error("billing_plan_reconcile_first");
  await ports.record("canceled");
  await ports.sync();
}
export function planChangeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("subscription_company_limit"))
    return "El plan no cubre todas tus empresas. Elige uno con capacidad suficiente; tus datos se conservan.";
  if (message.includes("subscription_user_limit"))
    return "El plan no cubre tu equipo y las invitaciones pendientes. Libera plazas o elige un plan mayor.";
  if (message.includes("quote_changed"))
    return "Stripe cambió el importe de la propuesta. Descarta este cambio y revísalo de nuevo antes de pagar.";
  if (message.includes("quote_expired"))
    return "La propuesta venció. Descártala y solicita un nuevo importe.";
  if (message.includes("custom_terms"))
    return "Esta suscripción tiene condiciones especiales. Contacta con atención al cliente para conservarlas al cambiar de plan.";
  if (message.includes("retry_expired"))
    return "Esta solicitud necesita reconciliarse. Comprueba o cancela el cambio antes de crear otra propuesta.";
  if (message.includes("operation_busy"))
    return "Hay una comprobación en curso. Espera unos momentos y actualiza el estado; no necesitas confirmar otra compra.";
  if (message.includes("reconcile_first"))
    return "Stripe todavía debe confirmar el resultado de la operación. Usa «Comprobar cambio» antes de cancelar; se conserva la misma solicitud.";
  return "No se pudo completar el cambio. Comprueba su estado antes de volver a intentarlo; las empresas y facturas se conservan.";
}
