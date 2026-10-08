import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionPortal } from "./subscription-checkout";
import { billingConfig } from "@/lib/subscriptions";
const summary = z.object({
  plan: z.string(),
  amount_cents: z.number(),
  user_limit: z.number(),
  status: z.string(),
  paid_through: z.string().nullable(),
  mode: z.string(),
  cancel_at_period_end: z.boolean(),
  active_users: z.number(),
  pending_invitations: z.number(),
  writable: z.boolean(),
});
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
  const value = summary.parse(data);
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
      aria-label="Suscripción de la empresa"
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
        invitaciones pendientes de {value.user_limit} plazas. El dueño cuenta
        como un usuario.
      </p>
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
      {value.active_users + value.pending_invitations > value.user_limit && (
        <p role="status">
          El equipo supera el límite del plan. Los accesos existentes se
          conservan; libera plazas o amplía el plan antes de invitar.
        </p>
      )}
      {owner && billingConfig(process.env) && (
        <SubscriptionPortal companyId={companyId} />
      )}
    </section>
  );
}
