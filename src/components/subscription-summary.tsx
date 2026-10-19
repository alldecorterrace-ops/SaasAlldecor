import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionPortal } from "./subscription-checkout";
import { billingConfig, subscriptionPlans } from "@/lib/subscriptions";
import { SubscriptionReactivation } from "./subscription-reactivation";
import { subscriptionSummarySchema } from "@/lib/subscription-summary";
import { billingCatalogVersion } from "@/lib/subscription-catalog";
import { SubscriptionPlanChange } from "./subscription-plan-change";
export async function SubscriptionSummary({
  companyId,
  owner,
}: {
  companyId: string;
  owner: boolean;
}) {
  const db = await createClient();
  const { data, error } = await db.rpc("company_subscription_summary", {
    p_company: companyId,
  });
  if (error) throw new Error("No se pudo comprobar la suscripción.");
  if (!data) return null;
  const value = subscriptionSummarySchema.parse(data);
  const config = billingConfig(process.env);
  const labels: Record<string, string> = {
    active: "Activa",
    past_due: "Pago pendiente",
    unpaid: "Sin pago",
    canceled: "Cancelada",
    incomplete: "Pago incompleto",
    incomplete_expired: "Pago vencido",
    paused: "Pausada",
    trialing: "Prueba",
  };
  return (
    <section
      className="card mb-8 grid gap-3"
      aria-label="Suscripción compartida por tus empresas"
    >
      <h2 className="text-lg font-semibold">
        Plan {value.plan} ·{" "}
        {(value.amount_cents / 100).toLocaleString("es", {
          style: "currency",
          currency: "USD",
        })}
        /mes
      </h2>
      <p>
        {labels[value.status] ?? "Por verificar"}
        {value.mode === "test" ? " · entorno de prueba" : ""}
      </p>
      <p className="text-sm text-muted-foreground">
        {value.active_users} usuarios activos + {value.pending_invitations}{" "}
        invitaciones de personas adicionales pendientes.{" "}
        {value.user_limit === null
          ? "Usuarios ilimitados."
          : `${value.user_limit} plazas en total.`}{" "}
        El dueño cuenta y cada persona ocupa una sola plaza entre todas las
        empresas.
      </p>
      <p className="text-sm">
        {value.companies} empresas
        {value.company_limit === null
          ? " · sin límite"
          : ` de ${value.company_limit} disponibles en el plan`}
        .
      </p>
      <p className="text-sm">
        {value.invoices_this_month} facturas creadas este mes
        {value.invoice_limit === null
          ? " · sin límite"
          : ` de ${value.invoice_limit}`}
        . Cupo compartido; se renueva el {value.invoice_period_end} a las 00:00
        UTC.
      </p>
      {(value.support === "email" || value.support === "phone") && (
        <p className="text-sm">
          Atención incluida por email
          {value.support === "phone" ? " y teléfono" : ""}.
        </p>
      )}
      {(value.custom_website || value.custom_modules) && (
        <p className="text-sm">
          Incluye creación de sitio web y cambios personalizados en módulos,
          coordinados con nuestro equipo.
        </p>
      )}
      {value.paid_through && (
        <p className="text-sm">
          Período pagado hasta{" "}
          {new Intl.DateTimeFormat("es", {
            dateStyle: "medium",
            timeZone: "UTC",
          }).format(new Date(value.paid_through))}
          .
        </p>
      )}
      {value.cancel_at_period_end && (
        <p role="status">
          La suscripción termina al finalizar el período pagado.
        </p>
      )}
      {!value.writable && (
        <p role="status">
          Puedes consultar la información. El dueño debe regularizar la
          suscripción para habilitar cambios e invitaciones.
        </p>
      )}
      {value.user_limit !== null &&
        value.active_users + value.pending_invitations > value.user_limit && (
          <p role="status">
            El equipo supera el límite del plan. Los accesos existentes se
            conservan; libera plazas o amplía el plan antes de invitar.
          </p>
        )}
      {owner &&
        config?.catalogVersion === billingCatalogVersion &&
        value.can_reactivate && (
          <SubscriptionReactivation
            companyId={companyId}
            requestId={randomUUID()}
            planCode={value.plan_code}
            pendingPlan={value.reactivation_plan}
            usedSeats={value.active_users + value.pending_invitations}
            usedCompanies={value.companies}
            testMode={config.mode === "test"}
            plans={subscriptionPlans.map(
              ({ code, name, amount, users, companies }) => ({
                code,
                name,
                amount,
                users,
                companies,
              }),
            )}
          />
        )}
      {owner &&
        config?.catalogVersion === billingCatalogVersion &&
        value.catalog_version === billingCatalogVersion &&
        (value.plan_change ||
          (value.writable &&
            value.status === "active" &&
            !value.cancel_at_period_end)) && (
          <SubscriptionPlanChange
            key={value.plan_change?.id ?? value.plan_code}
            companyId={companyId}
            requestId={randomUUID()}
            currentCode={value.plan_code}
            usedSeats={value.active_users + value.pending_invitations}
            usedCompanies={value.companies}
            change={value.plan_change}
            testMode={config.mode === "test"}
          />
        )}
      {owner && config && <SubscriptionPortal companyId={companyId} />}
    </section>
  );
}
