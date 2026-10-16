"use client";
import { useActionState } from "react";
import {
  beginSubscription,
  openSubscriptionPortal,
  type PurchaseState,
} from "@/app/planes/actions";
import { Input } from "./ui/input";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function SubscriptionCheckout({
  plan,
  requestId,
  enabled,
  testMode,
}: {
  plan: string;
  requestId: string;
  enabled: boolean;
  testMode: boolean;
}) {
  const [state, action] = useActionState(
    beginSubscription,
    {} as PurchaseState,
  );
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="request_id" value={requestId} />
      <Feedback error={state.error} />
      <label className="field">
        Nombre de tu empresa
        <Input
          name="company_name"
          minLength={2}
          maxLength={160}
          required
          disabled={!enabled}
        />
      </label>
      <label className="field">
        Tu correo como dueño
        <Input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={!enabled}
        />
      </label>
      <small className="text-muted-foreground">
        Este correo será el del dueño principal. Después del pago crearás tu
        contraseña y confirmarás el correo.
      </small>
      {enabled ? (
        <SubmitButton>
          {testMode ? "Continuar a pago de prueba" : "Continuar al pago"}
        </SubmitButton>
      ) : (
        <p role="status" className="rounded-xl bg-accent p-3 text-sm">
          Contratación aún no disponible. Puedes revisar los planes y sus
          accesos.
        </p>
      )}
    </form>
  );
}
export function SubscriptionPortal({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(
    openSubscriptionPortal.bind(null, companyId),
    {} as PurchaseState,
  );
  return (
    <form action={action} className="mt-4 grid gap-3">
      <Feedback error={state.error} />
      <SubmitButton>Gestionar suscripción y pagos</SubmitButton>
    </form>
  );
}
