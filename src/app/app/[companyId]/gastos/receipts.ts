"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { imageFormat } from "@/lib/image-validation";
import { financeError } from "@/lib/finance";
import type { OperationState } from "../operaciones/actions";
export async function setExpenseReceipt(
  companyId: string,
  id: string,
  version: number,
  _: OperationState,
  form: FormData,
): Promise<OperationState> {
  const { db } = await requireModule(companyId, "gastos", "write");
  if (
    !uuid.safeParse(id).success ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    return { error: "Guarda primero el gasto." };
  let path: string | null = null;
  if (form.get("remove") !== "true") {
    const file = form.get("receipt");
    if (!(file instanceof File) || file.size < 12 || file.size > 5000000)
      return { error: "Selecciona PNG, JPG, WebP o PDF de hasta 5 MB." };
    const bytes = new Uint8Array(await file.arrayBuffer()),
      format =
        imageFormat(bytes) ??
        (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
          ? { extension: "pdf", contentType: "application/pdf" }
          : null);
    if (!format)
      return {
        error: "El contenido del archivo no corresponde a un formato admitido.",
      };
    path = `${companyId}/${id}/${randomUUID()}.${format.extension}`;
    const { error } = await db.storage
      .from("expense-receipts")
      .upload(path, bytes, {
        contentType: format.contentType,
        upsert: false,
        cacheControl: "60",
      });
    if (error)
      return {
        error:
          "No se pudo subir el recibo. Revisa tu acceso y el tamaño del archivo.",
      };
  }
  const { error } = await db.rpc("set_expense_receipt", {
    p_company: companyId,
    p_id: id,
    p_version: version,
    p_path: path,
  });
  if (error) return { error: financeError(error) };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/gastos/${id}?saved=1`);
}
