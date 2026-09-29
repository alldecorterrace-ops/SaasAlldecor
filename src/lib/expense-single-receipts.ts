import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  identifyReceipt,
  verifyStoredReceipt,
  receiptLimit,
} from "./expense-batch-receipts";
export const singleReceiptSchema = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  batch_id: z.null(),
  expense_id: z.uuid(),
  actor_id: z.uuid(),
  expense_version: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(12).max(receiptLimit),
  extension: z.enum(["png", "jpg", "webp", "pdf"]),
});
export async function prepareExpenseReceipt(
  db: SupabaseClient,
  company: string,
  expense: string,
  version: number,
  bytes: Uint8Array,
) {
  const format = identifyReceipt(bytes, true);
  const { data, error } = await db.rpc("prepare_expense_receipt", {
    p_company: company,
    p_expense: expense,
    p_version: version,
    p_sha256: format.sha256,
    p_bytes: bytes.length,
    p_extension: format.extension,
  });
  if (error) throw error;
  const receipt = singleReceiptSchema.parse(data);
  if (
    receipt.company_id !== company ||
    receipt.expense_id !== expense ||
    receipt.expense_version !== version ||
    receipt.sha256 !== format.sha256 ||
    receipt.bytes !== bytes.length ||
    receipt.extension !== format.extension
  )
    throw new Error("receipt_mismatch");
  const path = `${company}/${expense}/${receipt.id}.${receipt.extension}`;
  await db.storage
    .from("expense-receipts")
    .upload(path, bytes, {
      contentType: format.contentType,
      upsert: false,
      cacheControl: "60",
    });
  return verifyStoredReceipt(db, receipt);
}
export async function verifyExpenseReceipt(
  db: SupabaseClient,
  company: string,
  expense: string,
  version: number,
  id: string,
) {
  const { data, error } = await db
    .from("expense_receipt_uploads")
    .select("*")
    .eq("company_id", company)
    .eq("expense_id", expense)
    .eq("id", id)
    .is("batch_id", null)
    .eq("expense_version", version)
    .maybeSingle();
  if (error || !data) throw new Error("receipt_unavailable");
  const receipt = singleReceiptSchema.parse(data);
  if (
    receipt.company_id !== company ||
    receipt.expense_id !== expense ||
    receipt.expense_version !== version ||
    receipt.id !== id
  )
    throw new Error("receipt_mismatch");
  return verifyStoredReceipt(db, receipt);
}
export function singleReceiptError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("duplicate_expense_receipt"))
    return "Este comprobante ya está adjunto a otro gasto activo de la empresa.";
  if (
    message.includes("record_conflict") ||
    message.includes("receipt_request_conflict")
  )
    return "El gasto cambió. Recarga la ficha y revisa el recibo antes de guardar.";
  if (message.includes("invalid_receipt"))
    return "Selecciona JPG, PNG, WebP o PDF de hasta 8 MiB. Las imágenes deben tener al menos 400 bytes.";
  if (message.includes("receipt_upload_limit"))
    return "Se alcanzó el límite de correcciones para esta versión. Revisa los comprobantes preparados.";
  return "No se pudo confirmar el recibo. Conserva esta página y reintenta con el mismo archivo.";
}
