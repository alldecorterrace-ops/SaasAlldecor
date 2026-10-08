import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  billingConfig,
  stripeApiVersion,
  type BillingConfig,
} from "./subscriptions";
export function requireBilling() {
  const config = billingConfig(process.env);
  if (!config) throw new Error("billing_not_configured");
  return config;
}
export function billingDatabase(config: BillingConfig) {
  return createClient(config.database, config.serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function stripeRequest(
  config: BillingConfig,
  path: string,
  params?: URLSearchParams,
  requestId?: string,
): Promise<unknown> {
  if (
    !/^\/(checkout\/sessions|subscriptions|billing_portal\/sessions)(\/|\?|$)/.test(
      path,
    )
  )
    throw new Error("invalid_stripe_path");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${config.secret}`,
      "Stripe-Version": stripeApiVersion,
      ...(params
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
      ...(requestId ? { "Idempotency-Key": requestId } : {}),
    },
    body: params?.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("billing_provider_unavailable");
  return response.json();
}
export function hostedBillingUrl(
  value: unknown,
  host: "checkout.stripe.com" | "billing.stripe.com",
) {
  const url = new URL(z.object({ url: z.string() }).parse(value).url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== host ||
    url.username ||
    url.password
  )
    throw new Error("invalid_billing_redirect");
  return url.href;
}
