"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import {
  fieldTimeFormSchema,
  fieldTimeSubmitResultSchema,
  fieldTimeReviewFormSchema,
  fieldTimeReviewResultSchema,
  fieldTimeError,
} from "@/lib/field-time";
export type FieldTimeState = { error?: string; success?: string };
export async function submitFieldTime(
  company: string,
  _: FieldTimeState,
  form: FormData,
): Promise<FieldTimeState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = fieldTimeFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Revisa las horas y el motivo de la propuesta." };
  const v = parsed.data;
  const { data, error } = await db.rpc("submit_field_time", {
    p_company: company,
    p_request: v.request,
    p_entry: v.entry,
    p_version: v.version,
    p_kind: v.kind,
    p_data: {
      start_hour: v.start_hour,
      end_hour: v.end_hour,
      reason: v.reason,
    },
  });
  if (error) return { error: fieldTimeError(error) };
  const result = fieldTimeSubmitResultSchema.parse(data);
  if (result.entry !== v.entry || result.kind !== v.kind)
    throw new Error("Field time submission scope mismatch");
  revalidatePath(`/app/${company}`, "layout");
  return {
    success: `Propuesta enviada: ${result.proposed_minutes} minutos. Los minutos vigentes se conservan hasta la revisión.`,
  };
}
export async function reviewFieldTime(
  company: string,
  _: FieldTimeState,
  form: FormData,
): Promise<FieldTimeState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = fieldTimeReviewFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Revisa la decisión. El rechazo requiere un motivo." };
  const v = parsed.data;
  const { data, error } = await db.rpc("review_field_time", {
    p_company: company,
    p_request: v.request,
    p_entry: v.entry,
    p_version: v.version,
    p_approve: v.decision === "approve",
    p_note: v.note,
  });
  if (error) return { error: fieldTimeError(error) };
  const result = fieldTimeReviewResultSchema.parse(data);
  if (
    result.entry !== v.entry ||
    result.approved !== (v.decision === "approve")
  )
    throw new Error("Field time review scope mismatch");
  revalidatePath(`/app/${company}`, "layout");
  return {
    success: result.approved
      ? `Minutos aprobados: ${result.minutes ?? 0}.${result.formal_pending ? " El horario solicitado sigue pendiente de Administración." : ""}`
      : "Propuesta rechazada. Los minutos vigentes se conservaron.",
  };
}
