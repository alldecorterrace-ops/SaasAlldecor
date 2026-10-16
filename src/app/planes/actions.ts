"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  requireBilling,
  billingDatabase,
  stripeRequest,
  hostedBillingUrl,
} from "@/lib/subscription-server";
import {
  checkoutParameters,
  verifyCheckoutPrice,
  type PlanCode,
} from "@/lib/subscriptions";
import { companyContext } from "@/lib/auth";
import { startCompanyReactivation } from "@/lib/subscription-reactivation";
export type PurchaseState = { error?: string };
export async function beginSubscription(
  _: PurchaseState,
  form: FormData,
): Promise<PurchaseState> {
  const value = z
    .object({
      id: z.uuid(),
      email: z.email().max(254),
      name: z.string().trim().min(2).max(160),
      code: z.enum(["inicial", "equipo", "profesional", "crecimiento"]),
    })
    .safeParse({
      id: form.get("request_id"),
      email: String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      name: form.get("company_name"),
      code: form.get("plan"),
    });
  if (!value.success)
    return { error: "Revisa el correo, la empresa y el plan." };
  let destination: string;
  try {
    const config = requireBilling();
    await verifyCheckoutPrice(config, value.data.code, (path) =>
      stripeRequest(config, path),
    );
    const db = billingDatabase(config);
    const { error } = await db.rpc("prepare_billing_order", {
      p_id: value.data.id,
      p_email: value.data.email,
      p_name: value.data.name,
      p_code: value.data.code,
      p_mode: config.mode,
    });
    if (error) throw new Error("order_unavailable");
    const session = await stripeRequest(
      config,
      "/checkout/sessions",
      checkoutParameters(config, {
        id: value.data.id,
        email: value.data.email,
        code: value.data.code as PlanCode,
      }),
      `saas-subscription-${value.data.id}`,
    );
    const checkout = z
      .object({
        id: z.string().regex(/^cs_[A-Za-z0-9_]+$/),
        livemode: z.boolean(),
      })
      .parse(session);
    if (checkout.livemode !== (config.mode === "live"))
      throw new Error("billing_mode_mismatch");
    destination = hostedBillingUrl(session, "checkout.stripe.com");
    const { error: attachError } = await db.rpc("attach_billing_checkout", {
      p_id: value.data.id,
      p_checkout: checkout.id,
    });
    if (attachError) throw new Error("checkout_unavailable");
  } catch {
    return {
      error:
        "La compra no está disponible en este entorno. No se activó ningún acceso. Si ya completaste un pago, espera su verificación e inicia sesión con el correo de compra.",
    };
  }
  redirect(destination);
}
export async function openSubscriptionPortal(
  companyId: string,
): Promise<PurchaseState> {
  const { db, member } = await companyContext(companyId);
  if (member.role !== "owner")
    return { error: "La suscripción la gestiona el dueño principal." };
  let destination: string;
  try {
    const config = requireBilling();
    const { data: customer, error } = await db.rpc(
      "subscription_portal_customer",
      { p_company: companyId },
    );
    if (
      error ||
      typeof customer !== "string" ||
      !/^cus_[A-Za-z0-9_]+$/.test(customer)
    )
      throw new Error("portal_unavailable");
    const result = await stripeRequest(
      config,
      "/billing_portal/sessions",
      new URLSearchParams({
        customer,
        return_url: `${config.site}/app/${companyId}/configuracion`,
      }),
    );
    destination = hostedBillingUrl(result, "billing.stripe.com");
  } catch {
    return {
      error:
        "No se pudo abrir la gestión de la suscripción. Inténtalo más tarde.",
    };
  }
  redirect(destination);
}

export async function beginCompanyReactivation(
  companyId: string,
  _: PurchaseState,
  form: FormData,
): Promise<PurchaseState> {
  const { db, member } = await companyContext(companyId);
  if (member.role !== "owner")
    return { error: "La reactivación la gestiona el dueño principal." };
  const parsed = z
    .object({
      id: z.uuid(),
      code: z.enum(["inicial", "equipo", "profesional", "crecimiento"]),
    })
    .safeParse({ id: form.get("request_id"), code: form.get("plan") });
  if (!parsed.success) return { error: "Selecciona un plan válido." };
  let destination: string;
  try {
    const config = requireBilling();
    const service = billingDatabase(config);
    await verifyCheckoutPrice(config, parsed.data.code, (path) =>
      stripeRequest(config, path),
    );
    destination = await startCompanyReactivation(
      config,
      companyId,
      parsed.data.id,
      parsed.data.code,
      {
        async prepare(id, code) {
          const { data, error } = await db.rpc("prepare_company_reactivation", {
            p_company: companyId,
            p_id: id,
            p_code: code,
            p_mode: config.mode,
          });
          if (error) throw new Error(error.message);
          return data;
        },
        read: (id) => stripeRequest(config, `/checkout/sessions/${id}`),
        create: (offer, params) =>
          stripeRequest(
            config,
            "/checkout/sessions",
            params,
            `saas-reactivation-${offer.id}`,
          ),
        async attach(offer, checkout) {
          const { error } = await service.rpc("attach_reactivation_checkout", {
            p_id: offer.id,
            p_checkout: checkout.id,
            p_expires_at: new Date(checkout.expires_at * 1000).toISOString(),
          });
          if (error) throw new Error("billing_reactivation_unavailable");
        },
        async expire(offer) {
          const { error } = await service.rpc("expire_reactivation_checkout", {
            p_id: offer.id,
            p_checkout: offer.checkout_id,
          });
          if (error) throw new Error("billing_reactivation_unavailable");
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("subscription_company_limit"))
      return {
        error:
          "Este plan no cubre todas tus empresas. Elige uno con capacidad suficiente; tus empresas se conservan.",
      };
    if (message.includes("subscription_user_limit"))
      return {
        error:
          "Este plan no tiene plazas suficientes para tu equipo y sus invitaciones pendientes. Elige un plan con más usuarios.",
      };
    if (message.includes("billing_reactivation_verifying"))
      return {
        error:
          "El pago ya fue completado y está en verificación. Actualiza la configuración en unos momentos; no necesitas pagar otra vez.",
      };
    if (message.includes("billing_reactivation_conflict"))
      return {
        error:
          "Hay una reactivación en curso con otro plan. Continúa ese pago o espera a que su sesión venza antes de cambiar de plan.",
      };
    if (message.includes("billing_reactivation_not_needed"))
      return {
        error:
          "La suscripción todavía no está cancelada. Revisa su estado en configuración y gestiona el pago actual desde el portal.",
      };
    return {
      error:
        "No pudimos iniciar la reactivación. Actualiza la configuración y vuelve a intentarlo. Tu empresa y equipo se conservan.",
    };
  }
  redirect(destination);
}
