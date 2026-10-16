import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  reactivationCheckoutParameters,
  type BillingConfig,
  type PlanCode,
} from "./subscriptions";

const offerSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  email: z.email(),
  plan_code: z.enum(["inicial", "equipo", "profesional", "crecimiento"]),
  mode: z.enum(["test", "live"]),
  customer_id: z.string().regex(/^cus_[A-Za-z0-9_]+$/),
  checkout_id: z
    .string()
    .regex(/^cs_[A-Za-z0-9_]+$/)
    .nullable(),
});
export type ReactivationOffer = z.infer<typeof offerSchema>;
const checkoutSchema = z.object({
  id: z.string().regex(/^cs_[A-Za-z0-9_]+$/),
  mode: z.literal("subscription"),
  livemode: z.boolean(),
  client_reference_id: z.uuid(),
  customer: z.string().regex(/^cus_[A-Za-z0-9_]+$/),
  metadata: z.object({ saas_order: z.uuid(), saas_reactivation: z.uuid() }),
  status: z.enum(["open", "complete", "expired"]),
  payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  expires_at: z.number().int().positive(),
  url: z.string().nullable(),
});
export type ReactivationCheckout = z.infer<typeof checkoutSchema>;
export type ReactivationGateway = {
  prepare: (id: string, code: PlanCode) => Promise<unknown>;
  read: (checkout: string) => Promise<unknown>;
  create: (
    offer: ReactivationOffer,
    params: URLSearchParams,
  ) => Promise<unknown>;
  attach: (
    offer: ReactivationOffer,
    checkout: ReactivationCheckout,
  ) => Promise<void>;
  expire: (offer: ReactivationOffer) => Promise<void>;
};

// Resume one existing Checkout. An expired, unpaid provider session is the only
// condition that lets the server retire an attempt and reserve a new one.
export async function startCompanyReactivation(
  config: BillingConfig,
  companyId: string,
  requestId: string,
  code: PlanCode,
  gateway: ReactivationGateway,
) {
  z.uuid().parse(companyId);
  z.uuid().parse(requestId);
  const reserve = async (id: string) => {
    const offer = offerSchema.parse(await gateway.prepare(id, code));
    if (offer.mode !== config.mode || offer.plan_code !== code)
      throw new Error("billing_reactivation_mismatch");
    return offer;
  };
  const inspect = (value: unknown, offer: ReactivationOffer) => {
    const checkout = checkoutSchema.parse(value);
    if (
      checkout.livemode !== (config.mode === "live") ||
      checkout.client_reference_id !== offer.order_id ||
      checkout.metadata.saas_order !== offer.order_id ||
      checkout.metadata.saas_reactivation !== offer.id ||
      checkout.customer !== offer.customer_id ||
      (offer.checkout_id && offer.checkout_id !== checkout.id)
    )
      throw new Error("billing_reactivation_mismatch");
    return checkout;
  };
  let offer = await reserve(requestId);
  let checkout = offer.checkout_id
    ? inspect(await gateway.read(offer.checkout_id), offer)
    : null;
  if (checkout?.status === "expired" && checkout.payment_status !== "paid") {
    await gateway.expire(offer);
    offer = await reserve(randomUUID());
    checkout = offer.checkout_id
      ? inspect(await gateway.read(offer.checkout_id), offer)
      : null;
  }
  if (!checkout) {
    checkout = inspect(
      await gateway.create(
        offer,
        reactivationCheckoutParameters(config, {
          ...offer,
          company_id: companyId,
        }),
      ),
      offer,
    );
    await gateway.attach(offer, checkout);
  }
  if (checkout.status === "complete" || checkout.payment_status === "paid")
    throw new Error("billing_reactivation_verifying");
  if (checkout.status !== "open" || !checkout.url)
    throw new Error("billing_reactivation_unavailable");
  const destination = new URL(checkout.url);
  if (
    destination.protocol !== "https:" ||
    destination.hostname !== "checkout.stripe.com" ||
    destination.username ||
    destination.password
  )
    throw new Error("invalid_billing_redirect");
  return destination.href;
}
