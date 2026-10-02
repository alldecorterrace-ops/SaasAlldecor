"use server";
import { requireModule } from "@/lib/auth";
import {
  reimbursementFormSchema,
  reimbursementError,
} from "@/lib/workforce-reimbursements";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export type ReimbursementState = { error?: string; success?: string };
export async function recordReimbursement(
  company: string,
  _: ReimbursementState,
  form: FormData,
): Promise<ReimbursementState> {
  const { db } = await requireModule(company, "horasfix", "write"),
    parsed = reimbursementFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data,
    { error } = await db.rpc("record_workforce_reimbursement", {
      p_company: company,
      p_request: v.request,
      p_worker: v.worker,
      p_items: v.items,
      p_total: v.total,
      p_all: v.all,
      p_note: v.note,
    });
  if (error) return { error: reimbursementError(error) };
  for (const route of ["horas/reembolsos", "horas/gastos", "gastos"])
    revalidatePath(`/app/${company}/${route}`);
  redirect(`/app/${company}/horas/reembolsos?recorded=${v.request}`);
}
