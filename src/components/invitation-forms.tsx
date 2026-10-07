"use client";
import { useActionState, useState } from "react";
import {
  createInvitation,
  revokeInvitation,
  respondInvitation,
  resendInvitation,
  type InvitationState,
} from "@/app/empresas/invitation-actions";
import { modules } from "@/lib/modules";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";

export function InviteMember({
  companyId,
  requestId,
  mailEnabled,
  canInviteAdmin,
}: {
  companyId: string;
  requestId: string;
  mailEnabled: boolean;
  canInviteAdmin: boolean;
}) {
  const [state, action, pending] = useActionState(
    createInvitation.bind(null, companyId),
    {} as InvitationState,
  );
  const [role, setRole] = useState("member");
  const [copied, setCopied] = useState(false);
  return (
    <section className="card grid gap-4">
      <h2 className="font-semibold">Invitar al equipo</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        La invitación vence en siete días. El destinatario debe registrarse o
        iniciar sesión con ese correo confirmado y aceptar en Tus empresas.
        Selecciona el rol y sus permisos antes de enviar; se aplican cuando
        acepte.
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
        <label className="field">
          Rol en la empresa
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={pending}
          >
            <option value="member">Miembro con permisos definidos</option>
            {canInviteAdmin && (
              <option value="admin">Administrador de empresa</option>
            )}
          </select>
        </label>
        {role === "member" && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Definir permisos del usuario
            </summary>
            <div className="mt-4 overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Consultar</th>
                    <th>Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {modules
                    .filter((m) => m.ready)
                    .map((m) => (
                      <tr key={m.id}>
                        <td>{m.label}</td>
                        <td>
                          <input
                            type="checkbox"
                            name={`read:${m.id}`}
                            aria-label={`Invitar con consulta ${m.label}`}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            name={`write:${m.id}`}
                            aria-label={`Invitar con edición ${m.label}`}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <div>
          <SubmitButton>
            {mailEnabled ? "Crear y enviar invitación" : "Crear invitación"}
          </SubmitButton>
        </div>
      </form>
      <p className="text-xs leading-5 text-muted-foreground">
        {mailEnabled
          ? "Enviaremos un aviso al destinatario. La aceptación se realiza dentro de la aplicación con su correo confirmado."
          : "El correo no está habilitado en este entorno. Comparte el acceso al SaaS con el destinatario."}
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
export function ResendInvitation({
  companyId,
  id,
}: {
  companyId: string;
  id: string;
}) {
  const [state, action] = useActionState(
    resendInvitation.bind(null, companyId, id),
    {} as InvitationState,
  );
  return (
    <form action={action}>
      <Feedback {...state} />
      <SubmitButton>Reenviar aviso</SubmitButton>
    </form>
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
  role,
  permissions,
}: {
  id: string;
  name: string;
  expires: string;
  role: string;
  permissions: Record<string, string[]>;
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
        Vence: {expires}. Rol:{" "}
        {role === "admin" ? "Administrador de empresa" : "Miembro con permisos"}
        .{" "}
        {role === "member" &&
          `${Object.keys(permissions).length} módulos asignados.`}
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
