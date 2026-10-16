"use client";
import { useActionState } from "react";
import {
  beginCompanyReactivation,
  type PurchaseState,
} from "@/app/planes/actions";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
import { planUsersLabel } from "@/lib/subscription-catalog";

export function SubscriptionReactivation({
  companyId,
  requestId,
  planCode,
  pendingPlan,
  usedSeats,
  usedCompanies,
  testMode,
  plans,
}: {
  companyId: string;
  requestId: string;
  planCode: string;
  pendingPlan: string | null;
  usedSeats: number;
  usedCompanies: number;
  testMode: boolean;
  plans: Array<{
    code: string;
    name: string;
    amount: number;
    users: number | null;
    companies: number | null;
  }>;
}) {
  const [state, action, pending] = useActionState(
    beginCompanyReactivation.bind(null, companyId),
    {} as PurchaseState,
  );
  return (
    <form action={action} className="mt-4 grid gap-3 border-t pt-4">
      <h3 className="font-semibold">Reactivar la suscripción</h3>
      <p className="text-sm text-muted-foreground">
        Conservas tus empresas, su equipo y su historial. Solo el dueño
        principal puede contratar el nuevo plan; el acceso se habilita al
        verificar el pago.
      </p>
      {pendingPlan && (
        <p role="status" className="text-sm">
          Hay un pago de reactivación en curso. Puedes continuar la misma
          sesión; después de pagar, actualiza esta pantalla para comprobar la
          activación.
        </p>
      )}
      <Feedback error={state.error} />
      <input type="hidden" name="request_id" value={requestId} />
      <label className="field">
        Plan para reactivar
        <select
          name="plan"
          defaultValue={pendingPlan ?? planCode}
          disabled={pending}
        >
          {plans.map((plan) => (
            <option
              key={plan.code}
              value={plan.code}
              disabled={
                (plan.users !== null && plan.users < usedSeats) ||
                (plan.companies !== null && plan.companies < usedCompanies) ||
                (!!pendingPlan && pendingPlan !== plan.code)
              }
            >
              {plan.name} · ${(plan.amount / 100).toFixed(2)}/mes ·{" "}
              {planUsersLabel(plan.users)}
              {plan.users !== null && plan.users < usedSeats
                ? " · plazas insuficientes"
                : ""}
              {plan.companies !== null && plan.companies < usedCompanies
                ? " · empresas excedidas"
                : ""}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton>
        {pendingPlan
          ? "Continuar pago de reactivación"
          : testMode
            ? "Reactivar con pago de prueba"
            : "Reactivar suscripción"}
      </SubmitButton>
    </form>
  );
}
