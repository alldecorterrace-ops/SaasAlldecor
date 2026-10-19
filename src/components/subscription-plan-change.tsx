"use client";
import { useActionState } from "react";
import { z } from "zod";
import {
  changeSubscriptionPlan,
  type PlanChangeState,
} from "@/app/planes/change-actions";
import { pendingPlanChangeSchema } from "@/lib/subscription-summary";
import { subscriptionPlans } from "@/lib/subscription-catalog";
import { Button } from "./ui/button";

const money = (cents: number) =>
  (cents / 100).toLocaleString("es", { style: "currency", currency: "USD" });
const date = (value: string) =>
  new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
export function SubscriptionPlanChange({
  companyId,
  requestId,
  currentCode,
  usedSeats,
  usedCompanies,
  change,
  testMode,
}: {
  companyId: string;
  requestId: string;
  currentCode: string;
  usedSeats: number;
  usedCompanies: number;
  change?: z.infer<typeof pendingPlanChangeSchema> | null;
  testMode: boolean;
}) {
  const [state, action, pending] = useActionState(
    changeSubscriptionPlan.bind(null, companyId),
    {} as PlanChangeState,
  );
  const choices = subscriptionPlans.filter((p) => p.code !== currentCode);
  const fits = (p: (typeof choices)[number]) =>
    (p.users === null || usedSeats <= p.users) &&
    (p.companies === null || usedCompanies <= p.companies);
  const needsQuote = change?.status === "quoted" && change.due_cents === null;
  return (
    <div
      className="grid gap-3 border-t border-border pt-5"
      aria-label="Cambiar de plan"
    >
      <h3 className="font-semibold">Cambiar de plan</h3>
      <p className="text-sm text-muted-foreground">
        La subida se activa al confirmar Stripe el cobro de la diferencia. La
        bajada se programa para la próxima renovación. El historial y las
        facturas de este mes se conservan.
      </p>
      {testMode && (
        <p className="text-sm">Prueba de Stripe: los importes son ficticios.</p>
      )}
      <form action={action} className="grid gap-3">
        <input
          type="hidden"
          name="request_id"
          value={change?.id ?? requestId}
        />
        {!change ? (
          <>
            <label className="grid gap-1 text-sm">
              Nuevo plan
              <select
                name="plan"
                required
                className="input"
                defaultValue={choices.find(fits)?.code ?? ""}
                disabled={pending}
              >
                <option value="" disabled>
                  Selecciona un plan
                </option>
                {choices.map((p) => (
                  <option key={p.code} value={p.code} disabled={!fits(p)}>
                    {p.name} · {money(p.amount)}/mes
                    {!fits(p) ? " · capacidad insuficiente" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm">
              Tu suscripción ocupa {usedSeats} plazas y {usedCompanies}{" "}
              empresas. Las invitaciones pendientes reservan plaza.
            </p>
            <Button
              className="w-fit"
              variant="outline"
              name="action"
              value="quote"
              disabled={pending}
            >
              Revisar cambio
            </Button>
          </>
        ) : (
          <>
            <input type="hidden" name="plan" value={change.plan_code} />
            <p className="font-medium">
              Nuevo plan: {change.plan} · {money(change.amount_cents)}/mes
            </p>
            {change.status === "quoted" && (
              <>
                {change.due_cents !== null && (
                  <p>
                    {change.direction === "upgrade"
                      ? `Diferencia a pagar ahora: ${money(change.due_cents)}.`
                      : "A pagar ahora: $0.00. Tu precio actual continúa hasta la renovación."}
                  </p>
                )}
                {change.effective_at && (
                  <p>Fecha del cambio: {date(change.effective_at)}.</p>
                )}
                <p className="text-sm">
                  Propuesta válida hasta {date(change.expires_at)}.
                </p>
                {change.direction === "downgrade" && (
                  <p className="text-sm">
                    Desde que confirmes, las nuevas empresas e invitaciones
                    deberán caber en el nuevo plan. El cupo de facturas se
                    comparte y no vuelve a cero por este cambio.
                  </p>
                )}
              </>
            )}
            {change.status === "scheduled" && (
              <p role="status">
                Bajada programada
                {change.effective_at
                  ? ` para el ${date(change.effective_at)}`
                  : ""}
                . Tu plan actual sigue activo hasta esa fecha. Puedes cancelar
                la bajada.
              </p>
            )}
            {change.status === "pending_payment" && (
              <p role="status">
                Stripe está verificando el pago. Tu plan actual se conserva
                mientras lo completas.
              </p>
            )}
            {change.status === "processing" && (
              <p role="status">
                Estamos comprobando el cambio con Stripe. Usa «Comprobar cambio»
                para continuar la misma solicitud.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                className="w-fit"
                name="action"
                value={
                  needsQuote
                    ? "quote"
                    : change.status === "quoted"
                      ? "confirm"
                      : "check"
                }
                disabled={pending}
              >
                {needsQuote
                  ? "Volver a calcular"
                  : change.status === "quoted"
                    ? change.direction === "upgrade"
                      ? "Confirmar y pagar la diferencia"
                      : "Confirmar bajada programada"
                    : change.status === "pending_payment"
                      ? "Continuar pago o comprobar"
                      : "Comprobar cambio"}
              </Button>
              <Button
                className="w-fit"
                variant="outline"
                name="action"
                value="cancel"
                disabled={pending}
              >
                {change.status === "quoted"
                  ? "Descartar propuesta"
                  : "Cancelar cambio"}
              </Button>
            </div>
          </>
        )}
        {pending && (
          <p role="status" className="text-sm">
            Comprobando con Stripe…
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-sm">
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
