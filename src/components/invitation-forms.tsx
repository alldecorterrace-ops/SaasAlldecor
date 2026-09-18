"use client";
import { useActionState, useState } from "react";
import {
  createInvitation,
  revokeInvitation,
  respondInvitation,
  type InvitationState,
} from "@/app/empresas/invitation-actions";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";

export function InviteMember({
  companyId,
  requestId,
}: {
  companyId: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(
    createInvitation.bind(null, companyId),
    {} as InvitationState,
  );
  const [copied, setCopied] = useState(false);
  return (
    <section className="card grid gap-4">
      <h2 className="font-semibold">Invitar al equipo</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        La invitación vence en siete días. El destinatario debe registrarse o
        iniciar sesión con ese correo confirmado y aceptar en Tus empresas.
        Entrará sin módulos; asigna sus permisos después.
      </p>
      <Feedback {...state} />
      <form action={action} className="grid gap-4">
        <input type="hidden" name="request_id" value={requestId} />
        <label className="field">
          Correo del destinatario
          <Input
            name="email"
            type="email"
            autoComplete="off"
            required
            maxLength={254}
            disabled={pending}
          />
        </label>
        <div>
          <SubmitButton>Crear invitación</SubmitButton>
        </div>
      </form>
      <p className="text-xs leading-5 text-muted-foreground">
        Las invitaciones aparecen dentro de la aplicación. El envío automático
        por correo aún no está habilitado. Comparte el acceso al SaaS con el
        destinatario.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              `${window.location.origin}/empresas`,
            );
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        Copiar acceso al SaaS
      </Button>
      {copied && (
        <p role="status" className="text-sm">
          Enlace copiado. Solo el correo invitado podrá aceptar.
        </p>
      )}
    </section>
  );
}
export function RevokeInvitation({
  companyId,
  id,
}: {
  companyId: string;
  id: string;
}) {
  const [state, action] = useActionState(
    revokeInvitation.bind(null, companyId, id),
    {} as InvitationState,
  );
  return (
    <form action={action}>
      <Feedback {...state} />
      <SubmitButton>Revocar invitación</SubmitButton>
    </form>
  );
}
export function IncomingInvitation({
  id,
  name,
  expires,
}: {
  id: string;
  name: string;
  expires: string;
}) {
  const [accepted, acceptAction, accepting] = useActionState(
    respondInvitation.bind(null, id, true),
    {} as InvitationState,
  );
  const [declined, declineAction, declining] = useActionState(
    respondInvitation.bind(null, id, false),
    {} as InvitationState,
  );
  return (
    <article className="card">
      <h3 className="font-semibold break-words">{name}</h3>
      <p className="my-3 text-sm text-muted-foreground">
        Vence: {expires}. Al aceptar entrarás sin módulos asignados. El
        administrador configurará tus permisos.
      </p>
      <Feedback {...accepted} />
      <Feedback {...declined} />
      <fieldset
        disabled={accepting || declining}
        className="flex flex-wrap gap-3"
      >
        <form action={acceptAction}>
          <SubmitButton>Aceptar invitación</SubmitButton>
        </form>
        <form action={declineAction}>
          <SubmitButton>Rechazar</SubmitButton>
        </form>
      </fieldset>
    </article>
  );
}
