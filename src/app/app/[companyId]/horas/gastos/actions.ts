"use server";
import {
  receiptReviewFormSchema,
  receiptConfirmationSchema,
} from "@/lib/receipt-review";
import { receiptReviewError } from "@/lib/workforce-expenses";
import { runWorkforceReceiptReview } from "@/lib/receipt-review-server";
import { requireModule } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  workforceExpenseSchema,
  workforceArchiveSchema,
  workforceCorrectionSchema,
  workforceResubmissionSchema,
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

export async function correctWorkforceExpense(
  company: string,
  _: WorkforceExpenseState,
  form: FormData,
): Promise<WorkforceExpenseState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = workforceCorrectionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  try {
    const locator = await db.rpc("workforce_expense_receipt_version", {
      p_company: company,
      p_id: v.id,
      p_receipt: v.receipt_id,
    });
    if (locator.error) throw locator.error;
    const receipt = workforceReceiptSchema.parse(locator.data);
    if (
      receipt.id !== v.receipt_id ||
      receipt.company_id !== company ||
      receipt.expense_id !== v.id
    )
      throw new Error("record_conflict");
    await verifyWorkforceReceipt(db, receipt);
    if (v.replacement_receipt_id) {
      const replacement = await db.rpc("workforce_expense_receipt_version", {
        p_company: company,
        p_id: v.id,
        p_receipt: v.replacement_receipt_id,
      });
      if (replacement.error) throw replacement.error;
      const next = workforceReceiptSchema.parse(replacement.data);
      if (
        next.company_id !== company ||
        next.expense_id !== v.id ||
        next.id !== v.replacement_receipt_id ||
        next.bytes < 400 ||
        !["jpg", "png", "webp"].includes(next.extension)
      )
        throw new Error("invalid_workforce_receipt_replacement");
      await verifyWorkforceReceipt(db, next);
    }
    const result = await db.rpc("correct_workforce_expense", {
      p_company: company,
      p_request: v.request,
      p_id: v.id,
      p_version: v.version,
      p_project: v.project_id === "GENERAL" ? null : v.project_id,
      p_general: v.project_id === "GENERAL",
      p_date: v.expense_date,
      p_amount: v.amount,
      p_category: v.category,
      p_description: v.description,
      p_pay_method: v.pay_method,
      p_receipt: v.receipt_id,
      ...(v.replacement_receipt_id
        ? { p_new_receipt: v.replacement_receipt_id }
        : {}),
      p_reason: v.reason,
    });
    if (result.error) throw result.error;
  } catch (error) {
    return { error: workforceExpenseError(error) };
  }
  revalidatePath(`/app/${company}/horas/gastos`);
  return {
    success:
      "Gasto corregido y revisado manualmente. Vuelve al encargado y después a oficina; no registra un pago.",
  };
}

export async function resubmitWorkforceExpense(
  company: string,
  _: WorkforceExpenseState,
  form: FormData,
): Promise<WorkforceExpenseState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = workforceResubmissionSchema.safeParse(
    Object.fromEntries(form),
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  try {
    const locator = await db.rpc("workforce_expense_receipt_version", {
      p_company: company,
      p_id: v.id,
      p_receipt: v.receipt_id,
    });
    if (locator.error) throw locator.error;
    const receipt = workforceReceiptSchema.parse(locator.data);
    if (
      receipt.id !== v.receipt_id ||
      receipt.company_id !== company ||
      receipt.expense_id !== v.id
    )
      throw new Error("record_conflict");
    await verifyWorkforceReceipt(db, receipt);
    if (v.replacement_receipt_id) {
      const replacement = await db.rpc("workforce_expense_receipt_version", {
        p_company: company,
        p_id: v.id,
        p_receipt: v.replacement_receipt_id,
      });
      if (replacement.error) throw replacement.error;
      const next = workforceReceiptSchema.parse(replacement.data);
      if (
        next.company_id !== company ||
        next.expense_id !== v.id ||
        next.id !== v.replacement_receipt_id ||
        next.bytes < 400 ||
        !["jpg", "png", "webp"].includes(next.extension)
      )
        throw new Error("invalid_workforce_receipt_replacement");
      await verifyWorkforceReceipt(db, next);
    }
    const result = await db.rpc("resubmit_workforce_expense", {
      p_company: company,
      p_request: v.request,
      p_id: v.id,
      p_version: v.version,
      p_project: v.project_id === "GENERAL" ? null : v.project_id,
      p_general: v.project_id === "GENERAL",
      p_date: v.expense_date,
      p_amount: v.amount,
      p_category: v.category,
      p_description: v.description,
      p_pay_method: v.pay_method,
      p_receipt: v.receipt_id,
      ...(v.replacement_receipt_id
        ? { p_new_receipt: v.replacement_receipt_id }
        : {}),
    });
    if (result.error) throw result.error;
  } catch (error) {
    return { error: workforceExpenseError(error) };
  }
  revalidatePath(`/app/${company}/horas/gastos`);
  return {
    success:
      "Gasto corregido y reenviado. Vuelve al encargado y después a oficina; no registra un pago.",
  };
}

export async function archiveWorkforceExpense(
  company: string,
  _: WorkforceExpenseState,
  form: FormData,
): Promise<WorkforceExpenseState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = workforceArchiveSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const result = await db.rpc("archive_workforce_expense", {
    p_company: company,
    p_request: v.request,
    p_id: v.id,
    p_version: v.version,
    p_restore: v.operation === "restore",
    p_reason: v.reason,
  });
  if (result.error) return { error: workforceExpenseError(result.error) };
  revalidatePath(`/app/${company}/horas/gastos`);
  revalidatePath(`/app/${company}/historial/workforce_expenses/${v.id}`);
  redirect(
    `/app/${company}/horas/gastos?${v.operation === "archive" ? "status=ARCHIVED&" : ""}changed=${v.operation}`,
  );
}

export async function analyzeWorkforceReceipt(
  company: string,
  _: WorkforceExpenseState,
  form: FormData,
): Promise<WorkforceExpenseState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = receiptReviewFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  try {
    const result = await runWorkforceReceiptReview(
      db,
      company,
      v.request,
      v.id,
      v.version,
    );
    revalidatePath(`/app/${company}/horas/gastos`);
    revalidatePath(`/app/${company}/historial/workforce_expenses/${v.id}`);
    return result.status === "DONE"
      ? {
          success:
            "Análisis registrado. Comprueba el resultado y el recibo; la revisión humana sigue pendiente.",
        }
      : result.status === "RUNNING"
        ? {
            success:
              "Procesando. Actualiza la página para consultar el resultado de esta solicitud.",
          }
        : {
            error:
              result.status === "STALE"
                ? "El gasto, la jornada o el acceso cambiaron. La respuesta se conserva sin modificar el gasto."
                : "El análisis no se completó. Consulta el error registrado en el historial.",
          };
  } catch (error) {
    revalidatePath(`/app/${company}/horas/gastos`);
    return { error: receiptReviewError(error) };
  }
}
export async function confirmWorkforceReceipt(
  company: string,
  _: WorkforceExpenseState,
  form: FormData,
): Promise<WorkforceExpenseState> {
  const { db } = await requireModule(company, "horasfix", "write");
  const parsed = receiptConfirmationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const result = await db.rpc("confirm_workforce_receipt_review", {
    p_company: company,
    p_request: v.request,
    p_id: v.id,
    p_version: v.version,
    p_job: v.job,
    p_note: v.note,
  });
  if (result.error) return { error: receiptReviewError(result.error) };
  revalidatePath(`/app/${company}/horas/gastos`);
  revalidatePath(`/app/${company}/historial/workforce_expenses/${v.id}`);
  return {
    success:
      "Revisión humana registrada con tu cuenta y fecha. No se aprobó ni pagó el gasto.",
  };
}
