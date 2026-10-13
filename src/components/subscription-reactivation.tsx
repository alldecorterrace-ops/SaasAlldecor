"use client";
import { useActionState } from "react";
import {
  beginCompanyReactivation,
  type PurchaseState,
} from "@/app/planes/actions";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";

export function SubscriptionReactivation({
  companyId,
  requestId,
  planCode,
  pendingPlan,
  usedSeats,
  testMode,
  plans,
}: {
  companyId: string;
  requestId: string;
  planCode: string;
  pendingPlan: string | null;
  usedSeats: number;
  testMode: boolean;
  plans: Array<{ code: string; name: string; amount: number; users: number }>;
}) {
  const [state, action, pending] = useActionState(
    beginCompanyReactivation.bind(null, companyId),
    {} as PurchaseState,
  );
  return (
    <form action={action} className="mt-4 grid gap-3 border-t pt-4">
      <h3 className="font-semibold">Reactivar esta empresa</h3>
      <p className="text-sm text-muted-foreground">
        Conservas la misma empresa, su equipo y su historial. Solo el dueño
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
                plan.users < usedSeats ||
                (!!pendingPlan && pendingPlan !== plan.code)
              }
            >
              {plan.name} · ${plan.amount / 100}/mes · {plan.users} usuarios
              {plan.users < usedSeats ? " · plazas insuficientes" : ""}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton>
        {pendingPlan
          ? "Continuar pago de reactivación"
          : testMode
            ? "Reactivar con pago de prueba"
            : "Reactivar empresa"}
      </SubmitButton>
    </form>
  );
}
