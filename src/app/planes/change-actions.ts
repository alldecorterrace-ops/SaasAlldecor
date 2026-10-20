"use server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { companyContext } from "@/lib/auth";
import {
  requireBilling,
  billingDatabase,
  stripeRequest,
} from "@/lib/subscription-server";
import { verifiedBillingSnapshot } from "@/lib/subscriptions";
import {
  cancelPlanChange,
  executePlanChange,
  planChangeError,
  planChangeOfferSchema,
  quotePlanChange,
  type ChangePorts,
} from "@/lib/subscription-plan-change";

export type PlanChangeState = { error?: string; message?: string };
export async function changeSubscriptionPlan(
  companyId: string,
  _: PlanChangeState,
  form: FormData,
): Promise<PlanChangeState> {
  const { db, member } = await companyContext(companyId);
  if (member.role !== "owner")
    return { error: "Solo el dueño principal puede cambiar la suscripción." };
  const input = z
    .object({
      id: z.uuid(),
      action: z.enum(["quote", "confirm", "check", "cancel"]),
      code: z
        .enum(["inicial", "equipo", "profesional", "crecimiento"])
        .optional(),
    })
    .safeParse({
      id: form.get("request_id"),
      action: form.get("action"),
      code: form.get("plan") ?? undefined,
    });
  if (!input.success) return { error: "Selecciona un cambio válido." };
  let destination: string | undefined;
  let state: PlanChangeState = {};
  try {
    const config = requireBilling(),
      service = billingDatabase(config);
    const { id, action, code } = input.data;
    const initial =
      action === "quote" && code
        ? await db.rpc("prepare_company_plan_change", {
            p_company: companyId,
            p_id: id,
            p_code: code,
            p_mode: config.mode,
          })
        : await db.rpc("company_plan_change", {
            p_company: companyId,
            p_id: id,
          });
    if (initial.error) throw new Error(initial.error.message);
    planChangeOfferSchema.parse(initial.data);
    const operation = randomUUID();
    const lease = await service.rpc("lease_plan_change", {
      p_id: id,
      p_operation: operation,
    });
    if (lease.error) throw new Error(lease.error.message);
    try {
      const result = await db.rpc("company_plan_change", {
        p_company: companyId,
        p_id: id,
        p_confirm: action === "confirm",
      });
      if (result.error) throw new Error(result.error.message);
      const offer = planChangeOfferSchema.parse(result.data);
      const ports: ChangePorts = {
        stripe: (path, params, key) => stripeRequest(config, path, params, key),
        async beforeMutation() {
          const result = await service.rpc("start_plan_change_provider", {
            p_id: id,
          });
          if (result.error) throw new Error(result.error.message);
        },
        async record(status, schedule, invoice) {
          const result = await service.rpc("record_plan_change_result", {
            p_id: id,
            p_status: status,
            p_schedule: schedule ?? null,
            p_invoice: invoice ?? null,
          });
          if (result.error) throw new Error(result.error.message);
        },
        async sync() {
          // Reconcile a fresh provider response; never manufacture a paid status.
          const body = JSON.stringify({
            id: `evt_sync_${randomUUID().replaceAll("-", "")}`,
            created: Math.floor(Date.now() / 1000),
            livemode: config.mode === "live",
            type: "customer.subscription.updated",
            data: { object: { id: offer.subscription_id } },
          });
          const verified = await verifiedBillingSnapshot(body, config, (path) =>
            stripeRequest(config, path),
          );
          if (!verified) throw new Error("billing_plan_change_unavailable");
          const result = await service.rpc("apply_billing_snapshot", {
            p_event: verified.event,
            p_created: verified.created,
            p_hash: createHash("sha256").update(body).digest("hex"),
            p_snapshot: verified.snapshot,
          });
          if (result.error) throw new Error(result.error.message);
        },
      };
      if (action === "quote") {
        const quote = await quotePlanChange(config, offer, ports.stripe);
        const result = await service.rpc("attach_plan_change_quote", {
          p_id: id,
          p_quote: quote,
        });
        if (result.error) throw new Error(result.error.message);
        state = { message: "Revisa el importe y la fecha antes de confirmar." };
      } else if (action === "cancel") {
        await cancelPlanChange(config, offer, ports);
        state = {
          message:
            "Se comprobó la cancelación. Revisa el estado actualizado de la suscripción.",
        };
      } else {
        const result = await executePlanChange(config, offer, ports);
        destination = result.paymentUrl;
        state = {
          message:
            "Estado comprobado con Stripe. Los límites se actualizan cuando el pago queda confirmado.",
        };
      }
    } finally {
      await service.rpc("lease_plan_change", {
        p_id: id,
        p_operation: operation,
        p_release: true,
      });
    }
  } catch (error) {
    state = { error: planChangeError(error) };
  }
  revalidatePath(`/app/${companyId}/configuracion`);
  revalidatePath("/empresas");
  if (destination) redirect(destination);
  return state;
}
