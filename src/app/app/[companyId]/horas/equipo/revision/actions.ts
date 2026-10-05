"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import {
  timeApprovalFormSchema,
  timeApprovalResultSchema,
  timeApprovalError,
} from "@/lib/workforce-time-approval";
export type TimeApprovalState = { error?: string; success?: string };
export async function approveTeamTime(
  company: string,
  _: TimeApprovalState,
  form: FormData,
): Promise<TimeApprovalState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = timeApprovalFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error: "La selección no es válida. Recarga y vuelve a intentarlo.",
    };
  const v = parsed.data;
  const { data, error } = await db.rpc("approve_workforce_time", {
    p_company: company,
    p_request: v.request,
    p_entry: v.entry,
    p_version: v.version,
  });
  if (error) return { error: timeApprovalError(error) };
  const result = timeApprovalResultSchema.parse(data);
  if (result.entry !== v.entry) throw new Error("Time approval scope mismatch");
  revalidatePath(`/app/${company}`, "layout");
  return { success: `Turno aprobado: ${result.minutes} minutos.` };
}
