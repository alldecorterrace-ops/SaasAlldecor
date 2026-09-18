import nodemailer from "nodemailer";
import { spawn } from "node:child_process";
import { z } from "zod";

const address = z
  .string()
  .max(254)
  .pipe(z.email())
  .refine((value) => !value.startsWith("-") && !/[\r\n]/.test(value));
export type InvitationNotice = {
  attempt_id: string;
  email: string;
  company_name: string;
  expires_at: string;
};
export type MailConfig = { from: string; name: string; site: string };
export type MailOutcome = "queued" | "failed" | "unknown";

export function invitationMailConfig(
  env: Record<string, string | undefined>,
): MailConfig | null {
  if (env.INVITATION_MAIL_ENABLED !== "true") return null;
  const from = address.safeParse(env.MAIL_FROM_ADDRESS);
  const name = env.MAIL_FROM_NAME ?? "SaasAlldecor";
  try {
    const site = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    if (
      !from.success ||
      !name.trim() ||
      name.length > 80 ||
      /[\r\n]/.test(name) ||
      site.protocol !== "https:" ||
      site.username ||
      site.password
    )
      return null;
    return { from: from.data, name, site: site.origin };
  } catch {
    return null;
  }
}

// Build MIME with a maintained library; never accept recipient, body, or headers
// from a form. Callers use the database invitation returned by the claim RPC.
export async function composeInvitationMail(
  config: MailConfig,
  notice: InvitationNotice,
) {
  const to = address.parse(notice.email);
  address.parse(config.from);
  const id = z.uuid().parse(notice.attempt_id);
  const site = new URL(config.site);
  if (site.protocol !== "https:" || site.username || site.password)
    throw new Error("invalid_mail_origin");
  const company = z
    .string()
    .min(2)
    .max(160)
    .parse(notice.company_name)
    .replace(/[\r\n]+/g, " ");
  const expires = new Intl.DateTimeFormat("es", {
    timeZone: "UTC",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(notice.expires_at));
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const mail = await composer.sendMail({
    from: { name: config.name, address: config.from },
    to: { name: "", address: to },
    envelope: { from: config.from, to: [to] },
    messageId: `<invitation-${id}@${site.hostname}>`,
    subject: `Invitación a ${company} · SaasAlldecor`,
    text: `Te invitaron a formar parte de ${company} en SaasAlldecor.\n\nAbre ${site.origin}/empresas e inicia sesión con ${to}. Si todavía no tienes una cuenta, regístrate con ese mismo correo y confírmalo. En Tus empresas encontrarás la invitación para aceptarla o rechazarla.\n\nLa invitación vence el ${expires} UTC. Al aceptar entrarás sin módulos asignados; el administrador definirá tus permisos.\n\nEste aviso no cambia tu contraseña ni otorga acceso por sí solo. Si no esperabas esta invitación, puedes ignorarla.\n\nSaasAlldecor`,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return { message: mail.message as Buffer, from: config.from, to };
}

// Bound the provider's sendmail wrapper. A timeout/abnormal signal is uncertain:
// the MTA may already have accepted the message, so do not retry automatically.
export async function sendInvitationMail(
  config: MailConfig,
  notice: InvitationNotice,
): Promise<MailOutcome> {
  let mail: Awaited<ReturnType<typeof composeInvitationMail>>;
  try {
    mail = await composeInvitationMail(config, notice);
  } catch {
    return "failed";
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: MailOutcome) => {
      if (!done) {
        done = true;
        resolve(value);
      }
    };
    try {
      const child = spawn(
        "/usr/sbin/sendmail",
        ["-i", "-f", mail.from, "--", mail.to],
        {
          shell: false,
          stdio: ["pipe", "ignore", "ignore"],
          timeout: 20000,
          killSignal: "SIGKILL",
        },
      );
      child.once("error", () => finish("failed"));
      child.once("close", (code, signal) =>
        finish(signal ? "unknown" : code === 0 ? "queued" : "failed"),
      );
      child.stdin.once("error", () => finish("unknown"));
      child.stdin.end(mail.message);
    } catch {
      finish("failed");
    }
  });
}

type MailDb = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export async function notifyInvitation(
  db: MailDb,
  company: string,
  invitation: string,
  retry: boolean,
  config: MailConfig | null,
  send = sendInvitationMail,
): Promise<{ error?: string; success?: string }> {
  if (!config)
    return {
      error:
        "Invitación guardada. El correo no está habilitado en este entorno; puedes compartir el acceso al SaaS.",
    };
  const claimed = await db.rpc("claim_invitation_email", {
    p_company: company,
    p_invitation: invitation,
    p_retry: retry,
  });
  if (claimed.error)
    return {
      error: claimed.error.message.includes("mail_rate_limited")
        ? "Espera al menos cinco minutos. Se permiten tres intentos diarios por invitación y 50 por empresa."
        : "El aviso no se pudo preparar. Revisa si la invitación sigue pendiente.",
    };
  const rows = claimed.data as InvitationNotice[] | null;
  if (!rows?.length)
    return {
      success:
        "La invitación ya tiene un intento de envío. Revisa su estado antes de reenviar.",
    };
  const notice = rows[0];
  let outcome: MailOutcome;
  try {
    outcome = await send(config, notice);
  } catch {
    outcome = "unknown";
  }
  const saved = await db.rpc("finish_invitation_email", {
    p_company: company,
    p_attempt: notice.attempt_id,
    p_status: outcome,
  });
  if (saved.error || outcome === "unknown")
    return {
      error:
        "Invitación guardada. No se pudo confirmar el estado del correo. Comprueba la recepción antes de reenviar para evitar duplicados.",
    };
  if (outcome === "failed")
    return {
      error:
        "Invitación guardada, pero el servidor no aceptó el correo. Puedes reintentar más tarde o compartir el acceso al SaaS.",
    };
  return {
    success:
      "Invitación guardada y aviso aceptado por el servidor de correo. La recepción en la bandeja del destinatario aún debe comprobarse.",
  };
}
