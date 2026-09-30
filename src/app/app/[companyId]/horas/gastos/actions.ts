"use server";
import { requireModule } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  workforceExpenseSchema,
  workforceDecisionSchema,
  workforceExpenseError,
} from "@/lib/workforce-expenses";
import {
  workforceReceiptSchema,
  verifyWorkforceReceipt,
} from "@/lib/workforce-receipts";
export type WorkforceExpenseState = { error?: string; success?: string };
export async function submitWorkforceExpense(
  company: string,
  _: WorkforceExpenseState,
  form: FormData,
): Promise<WorkforceExpenseState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = workforceExpenseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  try {
    const candidate = await db
      .from("workforce_receipt_uploads")
      .select("*")
      .eq("company_id", company)
      .eq("expense_id", v.id)
      .eq("id", v.receipt_id)
      .maybeSingle();
    if (candidate.error || !candidate.data)
      throw new Error("receipt_unavailable");
    await verifyWorkforceReceipt(
      db,
      workforceReceiptSchema.parse(candidate.data),
    );
    const result = await db.rpc("submit_workforce_expense", {
      p_company: company,
      p_request: v.request,
      p_id: v.id,
      p_project: v.project_id,
      p_at: v.expense_at,
      p_amount: v.amount,
      p_category: v.category,
      p_description: v.description,
      p_receipt: v.receipt_id,
      p_pay_method: v.pay_method,
    });
    if (result.error) throw result.error;
  } catch (error) {
    return { error: workforceExpenseError(error) };
  }
  revalidatePath(`/app/${company}/horas/gastos`);
  redirect(`/app/${company}/horas/gastos?saved=${v.id}`);
}
export async function decideWorkforceExpense(
  company: string,
  _: WorkforceExpenseState,
  form: FormData,
): Promise<WorkforceExpenseState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = workforceDecisionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data,
    result = await db.rpc("decide_workforce_expense", {
      p_company: company,
      p_request: v.request,
      p_id: v.id,
      p_version: v.version,
      p_decision: v.decision,
      p_reason: v.reason,
    });
  if (result.error) return { error: workforceExpenseError(result.error) };
  revalidatePath(`/app/${company}/horas/gastos`);
  return {
    success:
      v.decision === "RECLASSIFY_GENERAL"
        ? "Reclasificado a gasto general. Se conservan importe, recibo y aprobaciones; no se registra un pago."
        : "Decisión registrada. La aprobación no registra un pago.",
  };
}
