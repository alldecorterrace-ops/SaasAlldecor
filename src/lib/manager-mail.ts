import {
  invitationMailConfig,
  sendInvitationMail,
  type InvitationNotice,
  type MailConfig,
} from "./invitation-mail";
export { invitationMailConfig };
type MailDb = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export async function notifyManagerInvitation(
  db: MailDb,
  id: string,
  retry: boolean,
  config: MailConfig | null,
  send = sendInvitationMail,
) {
  if (!config)
    return {
      success:
        "Invitación guardada. El destinatario puede entrar al SaaS con su correo confirmado y aceptarla. El correo está desactivado en este entorno.",
    };
  const claimed = await db.rpc("claim_manager_invitation_email", {
    p_invitation: id,
    p_retry: retry,
  });
  if (claimed.error)
    return {
      error: claimed.error.message.includes("mail_rate_limited")
        ? "Espera cinco minutos antes de reenviar. Límite: tres avisos diarios por invitación."
        : "El aviso no se pudo preparar. Comprueba el estado de la invitación.",
    };
  const notice = (claimed.data as InvitationNotice[] | null)?.[0];
  if (!notice)
    return {
      success:
        "El aviso ya tiene un intento registrado. Comprueba su estado antes de reenviar.",
    };
  let outcome: "queued" | "failed" | "unknown";
  try {
    outcome = await send(config, { ...notice, kind: "manager" });
  } catch {
    outcome = "unknown";
  }
  const saved = await db.rpc("finish_manager_invitation_email", {
    p_attempt: notice.attempt_id,
    p_status: outcome,
  });
  if (saved.error || outcome === "unknown")
    return {
      error:
        "Invitación guardada. Resultado del correo sin confirmar; comprueba la recepción antes de reenviar.",
    };
  return outcome === "queued"
    ? {
        success:
          "Invitación guardada; aviso aceptado por el servidor de correo.",
      }
    : { error: "Invitación guardada, pero el servidor no aceptó el correo." };
}
