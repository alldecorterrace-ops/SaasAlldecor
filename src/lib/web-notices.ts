import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertDeploymentEnvironment,
  externalEffectsAllowed,
} from "./deployment-environment";
import { sendInvoiceMail } from "./invoice-email";
import {
  composeWebNotice,
  noticeAddress,
  webNoticeEvent,
  type WebNoticeConfig,
  type WebNoticeEvent,
} from "./web-notice-template";
export type WebNoticeResult = {
  error?: string;
  success?: string;
  eventId?: string;
  status?: WebNoticeEvent["status"];
};
export function webNoticeConfig(
  env: Record<string, string | undefined>,
  company: string,
): WebNoticeConfig | null {
  try {
    assertDeploymentEnvironment(env);
    z.uuid().parse(company);
    const site = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    if (
      site.protocol !== "https:" ||
      site.username ||
      site.password ||
      site.pathname !== "/" ||
      site.search ||
      site.hash
    )
      return null;
    if (env.APP_ENVIRONMENT === "staging")
      return {
        mode: "capture",
        from: "notice@saasalldecor.invalid",
        site: site.origin,
      };
    if (!externalEffectsAllowed(env) || env.WEB_NOTICE_MAIL_ENABLED !== "true")
      return null;
    const companies = (env.WEB_NOTICE_MAIL_COMPANY_IDS ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      !companies.length ||
      companies.some((x) => !z.uuid().safeParse(x).success) ||
      !companies.includes(company)
    )
      return null;
    return {
      mode: "send",
      from: noticeAddress.parse(env.MAIL_FROM_ADDRESS),
      site: site.origin,
    };
  } catch {
    return null;
  }
}
function result(e: WebNoticeEvent): WebNoticeResult {
  const base = { eventId: e.id, status: e.status };
  if (e.status === "captured")
    return {
      ...base,
      success: "Aviso de prueba conservado. No se envió correo.",
    };
  if (e.status === "queued")
    return {
      ...base,
      success:
        "Aviso aceptado por el servidor de correo. La aceptación no confirma recepción.",
    };
  if (e.status === "blocked")
    return {
      ...base,
      error:
        "El aviso interno no tenía destinatario al recibir la solicitud. Se conserva pendiente de revisión; configura la dirección para las próximas solicitudes.",
    };
  if (e.status === "failed")
    return {
      ...base,
      error:
        "No se completó el aviso. Revisa su registro antes de preparar otro envío.",
    };
  return {
    ...base,
    error:
      "Resultado sin confirmar. Revisa el registro y la recepción antes de repetir para evitar duplicados.",
  };
}
export async function deliverWebNotice(
  db: SupabaseClient,
  company: string,
  event: string,
  config: WebNoticeConfig | null,
  send = sendInvoiceMail,
): Promise<WebNoticeResult> {
  if (!config)
    return {
      error: "Los avisos no están habilitados para esta empresa y entorno.",
    };
  const claimed = await db.rpc("claim_web_notice", {
    p_company: company,
    p_event: event,
    p_mode: config.mode,
  });
  if (claimed.error)
    return {
      error: claimed.error.message.includes("synthetic_recipient")
        ? "La prueba requiere correos ficticios @saasalldecor.invalid."
        : "No se pudo preparar el aviso. Revisa tus permisos y su historial.",
    };
  const parsed = z
    .object({ claimed: z.boolean(), event: webNoticeEvent })
    .safeParse(claimed.data);
  if (
    !parsed.success ||
    parsed.data.event.id !== event ||
    parsed.data.event.company_id !== company
  )
    return { error: "No se pudo comprobar el registro del aviso." };
  const e = parsed.data.event;
  if (!parsed.data.claimed) return result(e);
  if (e.mode !== config.mode || e.status !== "processing")
    return { error: "No se pudo comprobar el estado del aviso." };
  let status: "captured" | "queued" | "failed" | "unknown" = "failed",
    sha: string | null = null,
    bytes: number | null = null;
  try {
    const mail = await composeWebNotice(config, e);
    sha = createHash("sha256").update(mail.message).digest("hex");
    bytes = mail.message.length;
    if (config.mode === "capture") {
      const path = `${company}/${e.id}.eml`,
        upload = await db.storage
          .from("web-notice-captures")
          .upload(path, mail.message, {
            contentType: "message/rfc822",
            upsert: false,
          });
      if (upload.error) {
        const existing = await db.storage
          .from("web-notice-captures")
          .download(path);
        if (
          existing.error ||
          !existing.data ||
          existing.data.size !== bytes ||
          createHash("sha256")
            .update(Buffer.from(await existing.data.arrayBuffer()))
            .digest("hex") !== sha
        )
          throw new Error("notice_capture_failed");
      }
      status = "captured";
    } else {
      try {
        status = await send(config, mail);
      } catch {
        status = "unknown";
      }
    }
  } catch {
    status = "failed";
  }
  const saved = await db.rpc("finish_web_notice", {
    p_company: company,
    p_event: e.id,
    p_status: status,
    p_sha256: sha,
    p_bytes: bytes,
  });
  if (saved.error)
    return {
      eventId: e.id,
      status: "unknown",
      error:
        "No se pudo confirmar el registro del aviso. Revisa antes de repetirlo.",
    };
  const final = webNoticeEvent.safeParse(saved.data);
  if (
    !final.success ||
    final.data.id !== e.id ||
    final.data.company_id !== company ||
    final.data.status !== status ||
    final.data.mime_sha256 !== sha ||
    final.data.mime_bytes !== bytes
  )
    return {
      eventId: e.id,
      status: "unknown",
      error: "No se pudo confirmar el resultado guardado del aviso.",
    };
  return result(final.data);
}
export async function downloadWebNotice(
  db: SupabaseClient,
  company: string,
  event: string,
) {
  if (
    !z.uuid().safeParse(company).success ||
    !z.uuid().safeParse(event).success
  )
    return null;
  const row = await db
      .from("web_notice_events")
      .select("*")
      .eq("company_id", company)
      .eq("id", event)
      .maybeSingle(),
    parsed = webNoticeEvent.safeParse(row.data);
  if (
    row.error ||
    !parsed.success ||
    parsed.data.status !== "captured" ||
    parsed.data.mode !== "capture" ||
    parsed.data.company_id !== company ||
    parsed.data.id !== event
  )
    return null;
  const e = parsed.data,
    file = await db.storage
      .from("web-notice-captures")
      .download(`${company}/${event}.eml`);
  if (file.error || !file.data || file.data.size !== e.mime_bytes) return null;
  const bytes = Buffer.from(await file.data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== e.mime_sha256)
    return null;
  return { bytes, name: `Inquiry-${e.request_id}-${e.kind}.eml` };
}
