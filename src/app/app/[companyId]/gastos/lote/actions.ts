"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { expenseBatchSchema, expenseBatchError } from "@/lib/expense-batch";
export type ExpenseBatchState = {
  error?: string;
  success?: string;
  ids?: string[];
};
export async function saveExpenseBatch(
  companyId: string,
  batchId: string,
  _: ExpenseBatchState,
  form: FormData,
): Promise<ExpenseBatchState> {
  const { db, member } = await requireModule(companyId, "gastos", "write");
  if (
    !["owner", "admin"].includes(member.role) ||
    !uuid.safeParse(batchId).success
  )
    return { error: "El registro de lotes requiere administración." };
  try {
    const ids = JSON.parse(String(form.get("rows") ?? "[]"));
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 100 ||
      !ids.every((x) => uuid.safeParse(x).success)
    )
      return { error: "Revisa las filas del lote." };
    const fields = [
      "project_id",
      "worker_id",
      "expense_date",
      "category",
      "description",
      "vendor",
      "document_number",
      "amount",
      "method",
      "payer",
    ];
    const rows = ids.map((id) => ({
      id,
      ...Object.fromEntries(
        fields.map((f) => [
          f,
          f.endsWith("_id")
            ? form.get(`${id}.${f}`) || null
            : form.get(`${id}.${f}`),
        ]),
      ),
    }));
    const parsed = expenseBatchSchema.safeParse(rows);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        error: `Fila ${Number(issue.path[0] ?? 0) + 1}: revisa ${String(issue.path[1] ?? "los campos")}. No se guardó ninguna fila.`,
      };
    }
    const { data, error } = await db.rpc("save_expense_batch", {
      p_company: companyId,
      p_batch: batchId,
      p_rows: parsed.data,
    });
    if (error) return { error: expenseBatchError(error.message) };
    if (
      !Array.isArray(data) ||
      data.length !== ids.length ||
      !data.every((x) => uuid.safeParse(x).success)
    )
      return { error: expenseBatchError("") };
    revalidatePath(`/app/${companyId}`, "layout");
    return { success: `Lote registrado: ${data.length} gastos.`, ids: data };
  } catch {
    return { error: expenseBatchError("") };
  }
}
