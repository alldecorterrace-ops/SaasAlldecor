"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import type { ActionState } from "@/components/action-form";
import { noticeAddress } from "@/lib/web-notice-template";
import { webNoticeConfig, deliverWebNotice } from "@/lib/web-notices";
export async function saveNoticeSettings(
  company: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  void _;
  const { db, member } = await requireModule(company, "estimadosweb", "write");
  if (!["owner", "admin"].includes(member.role))
    return { error: "Solo Administración configura el destinatario." };
  const email = noticeAddress.safeParse(String(form.get("email") ?? "")),
    version = Number(form.get("version"));
  if (!email.success || !Number.isSafeInteger(version) || version < 0)
    return { error: "Revisa el correo y vuelve a abrir la pantalla." };
  if (
    process.env.APP_ENVIRONMENT === "staging" &&
    !/@saasalldecor[.]invalid$/i.test(email.data)
  )
    return {
      error: "En staging utiliza una dirección ficticia @saasalldecor.invalid.",
    };
  if (form.get("confirmed") !== "yes")
    return { error: "Confirma la dirección de esta empresa." };
  const saved = await db.rpc("save_web_notice_settings", {
    p_company: company,
    p_version: version,
    p_email: email.data,
  });
  if (saved.error)
    return {
      error:
        "No se pudo guardar. Recarga la pantalla y revisa permisos/destinatario.",
    };
  revalidatePath(`/app/${company}/solicitudes-web`);
  return {
    success:
      "Dirección guardada para las próximas solicitudes. Los avisos anteriores conservan su destinatario.",
  };
}
export async function processNotice(
  company: string,
  event: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  void _;
  const { db } = await requireModule(company, "estimadosweb", "write");
  if (!uuid.safeParse(event).success) return { error: "Aviso no disponible." };
  const config = webNoticeConfig(process.env, company);
  if (config?.mode === "send" && form.get("confirmed") !== "yes")
    return {
      error: "Confirma el envío de este aviso al destinatario guardado.",
    };
  const result = await deliverWebNotice(db, company, event, config);
  revalidatePath(`/app/${company}/solicitudes-web`);
  return { error: result.error, success: result.success };
}

export async function assignBlockedNotice(
  company: string,
  event: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  void _;
  const { db } = await requireModule(company, "estimadosweb", "write");
  if (!uuid.safeParse(event).success || form.get("confirmed") !== "yes")
    return { error: "Confirma la dirección de este aviso." };
  const recipient = noticeAddress.safeParse(
    String(form.get("recipient") ?? ""),
  );
  if (!recipient.success)
    return { error: "Recarga la pantalla y confirma la dirección vigente." };
  const saved = await db.rpc("assign_blocked_web_notice", {
    p_company: company,
    p_event: event,
    p_expected_recipient: recipient.data,
  });
  if (saved.error)
    return {
      error:
        "No se pudo asignar. Recarga la pantalla y revisa permisos y dirección.",
    };
  revalidatePath(`/app/${company}/solicitudes-web`);
  return {
    success:
      "Destinatario asignado y auditado. El aviso queda pendiente; no se envió correo.",
  };
}
