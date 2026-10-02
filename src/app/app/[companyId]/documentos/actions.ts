"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { commercialKind, commercialModule } from "@/lib/commercial-documents";
import { renderCommercialPdf } from "@/lib/commercial-pdf";
import { generateCommercialDocument } from "@/lib/commercial-document-service";
import {
  invoiceEmailConfig,
  deliverInvoiceEmail,
  type InvoiceEmailResult,
} from "@/lib/invoice-email";
export type CommercialState = { error?: string; documentId?: string };
export async function generatePdf(
  companyId: string,
  _: CommercialState,
  form: FormData,
): Promise<CommercialState> {
  const kind = commercialKind.safeParse(form.get("kind")),
    record = uuid.safeParse(form.get("record")),
    version = Number(form.get("version"));
  if (
    !kind.success ||
    !record.success ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    return { error: "Recarga el documento antes de generar el PDF." };
  const { db } = await requireModule(
    companyId,
    commercialModule(kind.data),
    "write",
  );
  try {
    const documentId = await generateCommercialDocument(
      db,
      companyId,
      kind.data,
      record.data,
      version,
      (d) => renderCommercialPdf(d, process.env.APP_ENVIRONMENT === "staging"),
    );
    revalidatePath(`/app/${companyId}`, "layout");
    return { documentId };
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
    return {
      error: message.includes("record_conflict")
        ? "El documento cambió. Recarga la ficha antes de generar el PDF."
        : message.includes("unsupported_document_character")
          ? "El texto contiene caracteres que la fuente del PDF no admite. El archivo no se publicó."
          : "No se pudo conservar el PDF. Puedes reintentar; se conservará una sola copia por revisión.",
    };
  }
}
export async function sendInvoiceEmail(
  companyId: string,
  _: InvoiceEmailResult,
  form: FormData,
): Promise<InvoiceEmailResult> {
  const record = uuid.safeParse(form.get("record")),
    request = uuid.safeParse(form.get("request")),
    version = Number(form.get("version"));
  if (
    !record.success ||
    !request.success ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    return { error: "Recarga la factura antes de preparar el correo." };
  const { db } = await requireModule(companyId, "fin-invoices", "write");
  const config = invoiceEmailConfig(process.env, companyId);
  if (!config)
    return {
      error: "El envío de facturas no está habilitado en este entorno.",
    };
  const recipient = String(form.get("recipient") ?? "");
  if (!recipient.trim() || recipient.length > 254 || /[\r\n]/.test(recipient))
    return { error: "El cliente no tiene un correo válido. Revisa su ficha." };
  if (config.mode === "send" && form.get("confirmed") !== "yes")
    return { error: "Confirma el destinatario y el envío de esta factura." };
  // A retry after a lost response must consult the durable attempt first. The
  // invoice may have changed since that request; never generate/send it again.
  const prior = await db
    .from("invoice_email_attempts")
    .select("document_id,record_version,invoice_id,mode")
    .eq("company_id", companyId)
    .eq("request_id", request.data)
    .maybeSingle();
  if (prior.error)
    return {
      error:
        "No se pudo comprobar el envío anterior. Revisa el historial antes de repetirlo.",
    };
  let documentId: string;
  if (prior.data) {
    if (
      prior.data.invoice_id !== record.data ||
      prior.data.record_version !== version ||
      prior.data.mode !== config.mode
    )
      return {
        error: "La solicitud corresponde a otro envío. Recarga la ficha.",
      };
    documentId = prior.data.document_id;
  } else {
    try {
      documentId = await generateCommercialDocument(
        db,
        companyId,
        "invoice",
        record.data,
        version,
        (d) => renderCommercialPdf(d, config.mode === "capture"),
      );
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "";
      return {
        error: message.includes("record_conflict")
          ? "La factura cambió. Recarga la ficha antes de enviar."
          : "No se pudo conservar el PDF adjunto. No se envió el correo; puedes revisar la factura y reintentar.",
      };
    }
  }
  const result = await deliverInvoiceEmail(
    db,
    companyId,
    record.data,
    version,
    documentId,
    request.data,
    config,
    undefined,
    recipient,
  );
  revalidatePath(`/app/${companyId}`, "layout");
  return result;
}
