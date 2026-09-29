import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { imageFormat } from "./image-validation";
export const receiptLimit = 8388608;
export const receiptSchema = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  batch_id: z.uuid(),
  expense_id: z.uuid(),
  actor_id: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(400).max(receiptLimit),
  extension: z.enum(["png", "jpg", "webp"]),
});
export function identifyReceipt(bytes: Uint8Array, allowPdf = false) {
  const format =
    imageFormat(bytes) ??
    (allowPdf &&
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-"
      ? { extension: "pdf", contentType: "application/pdf" }
      : null);
  if (
    !format ||
    bytes.length < (format?.extension === "pdf" ? 12 : 400) ||
    bytes.length > receiptLimit
  )
    throw new Error("invalid_receipt");
  return {
    ...format,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
export async function verifyStoredReceipt(
  db: SupabaseClient,
  receipt: {
    id: string;
    company_id: string;
    expense_id: string;
    extension: string;
    sha256: string;
    bytes: number;
  },
) {
  const path = `${receipt.company_id}/${receipt.expense_id}/${receipt.id}.${receipt.extension}`;
  const stored = await db.storage.from("expense-receipts").download(path);
  if (stored.error || !stored.data || stored.data.size !== receipt.bytes)
    throw new Error("receipt_unavailable");
  const actual = identifyReceipt(
    new Uint8Array(await stored.data.arrayBuffer()),
    receipt.extension === "pdf",
  );
  if (
    actual.extension !== receipt.extension ||
    actual.sha256 !== receipt.sha256 ||
    stored.data.type.split(";")[0] !== actual.contentType
  )
    throw new Error("receipt_mismatch");
  return receipt.id;
}
export async function prepareExpenseBatchReceipt(
  db: SupabaseClient,
  company: string,
  batch: string,
  expense: string,
  bytes: Uint8Array,
) {
  const format = identifyReceipt(bytes);
  const prepared = await db.rpc("prepare_expense_batch_receipt", {
    p_company: company,
    p_batch: batch,
    p_expense: expense,
    p_sha256: format.sha256,
    p_bytes: bytes.length,
    p_extension: format.extension,
  });
  if (prepared.error) throw prepared.error;
  const receipt = receiptSchema.parse(prepared.data);
  if (
    receipt.company_id !== company ||
    receipt.batch_id !== batch ||
    receipt.expense_id !== expense ||
    receipt.sha256 !== format.sha256 ||
    receipt.bytes !== bytes.length ||
    receipt.extension !== format.extension
  )
    throw new Error("receipt_mismatch");
  const path = `${company}/${expense}/${receipt.id}.${receipt.extension}`;
  // Never overwrite/delete: a lost upload response is resolved by reading the same candidate.
  await db.storage.from("expense-receipts").upload(path, bytes, {
    contentType: format.contentType,
    upsert: false,
    cacheControl: "60",
  });
  return verifyStoredReceipt(db, receipt);
}
export async function verifyExpenseBatchReceipt(
  db: SupabaseClient,
  company: string,
  batch: string,
  expense: string,
  receiptId: string,
) {
  const result = await db
    .from("expense_receipt_uploads")
    .select("*")
    .eq("company_id", company)
    .eq("batch_id", batch)
    .eq("expense_id", expense)
    .eq("id", receiptId)
    .maybeSingle();
  if (result.error || !result.data) throw new Error("receipt_unavailable");
  const receipt = receiptSchema.parse(result.data);
  if (
    receipt.company_id !== company ||
    receipt.batch_id !== batch ||
    receipt.expense_id !== expense ||
    receipt.id !== receiptId
  )
    throw new Error("receipt_mismatch");
  return verifyStoredReceipt(db, receipt);
}
export function expenseReceiptError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("duplicate_expense_receipt"))
    return "Esta imagen ya estÃ¡ adjunta a otro gasto activo.";
  if (message.includes("invalid_receipt"))
    return "El comprobante debe ser una imagen JPG, PNG o WebP de entre 400 bytes y 8 MiB.";
  if (message.includes("expense_batch_conflict"))
    return "Este lote ya se guardÃ³. Abre de nuevo su resultado.";
  if (message.includes("receipt_upload_limit"))
    return "Este lote alcanzÃ³ el lÃ­mite de correcciones de comprobantes. Revisa los archivos preparados antes de continuar.";
  return "No se pudo verificar el comprobante. Conserva el archivo y reintenta; no se guardÃ³ el lote.";
}
