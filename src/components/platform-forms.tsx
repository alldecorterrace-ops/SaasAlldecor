"use client";
import { useActionState } from "react";
import {
  inviteManager,
  revokeManager,
  resendManager,
  respondManager,
  setManagerActive,
  type PlatformState,
} from "@/app/administracion-saas/actions";
import { Feedback } from "./feedback";
import { Input } from "./ui/input";
import { SubmitButton } from "./submit-button";
export function InviteManager({
  requestId,
  mailEnabled,
}: {
  requestId: string;
  mailEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    inviteManager,
    {} as PlatformState,
  );
  return (
    <form action={action} className="card grid gap-4">
      <h2 className="text-lg font-semibold">Invitar gerente</h2>
      <p className="text-sm text-muted-foreground">
        El gerente acepta con su correo confirmado. Después puede crear sus
        empresas e invitar a sus equipos. La invitación vence en siete días.
      </p>
      <Feedback {...state} />
      <input type="hidden" name="request_id" value={requestId} />
      <label className="field">
        Correo del gerente
        <Input
          name="email"
          type="email"
          required
          maxLength={254}
          disabled={pending}
        />
      </label>
      <SubmitButton>
        {mailEnabled ? "Crear y enviar invitación" : "Crear invitación"}
      </SubmitButton>
    </form>
  );
}
export function ManagerInvitationControls({
  id,
  mailEnabled,
}: {
  id: string;
  mailEnabled: boolean;
}) {
  const [revoked, revoke] = useActionState(
    revokeManager.bind(null, id),
    {} as PlatformState,
  );
  const [sent, resend] = useActionState(
    resendManager.bind(null, id),
    {} as PlatformState,
  );
  return (
    <div className="grid gap-3">
      <Feedback {...revoked} />
      <Feedback {...sent} />
      {mailEnabled && (
        <form action={resend}>
          <SubmitButton>Reenviar aviso</SubmitButton>
        </form>
      )}
      <form action={revoke}>
        <SubmitButton>Revocar invitación</SubmitButton>
      </form>
    </div>
  );
}
export function IncomingManagerInvitation({
  id,
  expires,
}: {
  id: string;
  expires: string;
}) {
  const [accepted, accept, accepting] = useActionState(
    respondManager.bind(null, id, true),
    {} as PlatformState,
  );
  const [declined, decline, declining] = useActionState(
    respondManager.bind(null, id, false),
    {} as PlatformState,
  );
  return (
    <article className="card">
      <h2 className="font-semibold">Invitación como gerente</h2>
      <p className="my-3 text-sm text-muted-foreground">
        Crea tus empresas y administra sus equipos. Vence {expires}.
      </p>
      <Feedback {...accepted} />
      <Feedback {...declined} />
      <fieldset
        disabled={accepting || declining}
        className="flex flex-wrap gap-3"
      >
        <form action={accept}>
          <SubmitButton>Aceptar como gerente</SubmitButton>
        </form>
        <form action={decline}>
          <SubmitButton>Rechazar</SubmitButton>
        </form>
      </fieldset>
    </article>
  );
}
export function ManagerAccess({
  id,
  version,
  active,
}: {
  id: string;
  version: number;
  active: boolean;
}) {
  const [state, action] = useActionState(
    setManagerActive.bind(null, id, version, !active),
    {} as PlatformState,
  );
  return (
    <form action={action} className="grid gap-3">
      <Feedback {...state} />
      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="confirmed" required />
        Confirmo {active ? "suspender" : "activar"} esta cuenta
      </label>
      <p className="text-xs text-muted-foreground">
        La suspensión bloquea la creación de empresas y el acceso de esta
        cuenta; conserva las empresas y sus equipos.
      </p>
      <SubmitButton>
        {active ? "Suspender gerente" : "Activar gerente"}
      </SubmitButton>
    </form>
  );
}
