"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { financeError, paymentSchema, projectSchema } from "@/lib/finance";
export type FinanceState = { error?: string; success?: string };
export async function financeAction(
  companyId: string,
  _: FinanceState,
  form: FormData,
): Promise<FinanceState> {
  const op = String(form.get("operation")),
    id = uuid.safeParse(form.get("id")),
    version = Number(form.get("version"));
  if (!id.success || !Number.isSafeInteger(version) || version < 1)
    return { error: "Vuelve a abrir el documento." };
  const { db } = await requireModule(
    companyId,
    op === "project"
      ? "fin-proyectos"
      : op === "approve"
        ? "fin-estimados"
        : "fin-invoices",
    "write",
  );
  const text = (key: string) => String(form.get(key) ?? "");
  let result: {
    data: unknown;
    error: { code?: string; message: string } | null;
  };
  if (op === "approve") {
    await requireModule(companyId, "fin-invoices", "write");
    await requireModule(companyId, "fin-proyectos", "write");
    const parsed = z
      .object({
        date: z.iso.date(),
        name: z.string().trim().min(2).max(255),
        note: z.string().trim().min(3).max(2000),
      })
      .safeParse({
        date: text("date"),
        name: text("name"),
        note: text("note"),
      });
    if (!parsed.success)
      return {
        error:
          "Completa fecha, nombre del proyecto y constancia de aprobación.",
      };
    result = await db.rpc("approve_estimate", {
      p_company: companyId,
      p_id: id.data,
      p_version: version,
      p_date: parsed.data.date,
      p_name: parsed.data.name,
      p_note: parsed.data.note,
    });
  } else if (op === "payment") {
    const parsed = paymentSchema.safeParse(Object.fromEntries(form)),
      pid = uuid.safeParse(form.get("payment_id"));
    if (!parsed.success || !pid.success)
      return { error: "Revisa importe, fecha y método de pago." };
    result = await db.rpc("record_payment", {
      p_company: companyId,
      p_id: pid.data,
      p_invoice: id.data,
      p_version: version,
      p_data: parsed.data,
    });
  } else if (op === "void-payment") {
    const reason = text("reason").trim();
    if (reason.length < 3 || reason.length > 2000)
      return { error: "Indica el motivo de la reversión." };
    result = await db.rpc("void_payment", {
      p_company: companyId,
      p_id: id.data,
      p_version: version,
      p_reason: reason,
    });
  } else if (op === "invoice" || op === "void-invoice") {
    const parsed = z
      .object({
        date: z.iso.date(),
        due: z.iso.date().nullable(),
        notes: z.string().max(10000),
      })
      .refine((v) => !v.due || v.due >= v.date)
      .safeParse({
        date: text("date"),
        due: text("due") || null,
        notes: text("notes"),
      });
    if (!parsed.success)
      return { error: "Revisa las fechas y las notas de la factura." };
    const reason = op === "void-invoice" ? text("reason").trim() : null;
    if (reason !== null && (reason.length < 3 || reason.length > 2000))
      return { error: "Indica el motivo de anulación." };
    result = await db.rpc("update_invoice", {
      p_company: companyId,
      p_id: id.data,
      p_version: version,
      p_date: parsed.data.date,
      p_due: parsed.data.due,
      p_notes: parsed.data.notes,
      p_void_reason: reason,
    });
  } else if (op === "project") {
    const parsed = projectSchema.safeParse({
      ...Object.fromEntries(form),
      start_date: text("start_date") || null,
      end_date: text("end_date") || null,
    });
    if (!parsed.success)
      return { error: "Revisa nombre, estado y fechas del proyecto." };
    result = await db.rpc("update_project", {
      p_company: companyId,
      p_id: id.data,
      p_version: version,
      p_data: parsed.data,
    });
  } else return { error: "Operación no disponible." };
  if (result.error) return { error: financeError(result.error) };
  revalidatePath(`/app/${companyId}`, "layout");
  if (op === "approve") redirect(`/app/${companyId}/facturas/${result.data}`);
  return {
    success: "Cambio guardado. El historial conserva los datos anteriores.",
  };
}
