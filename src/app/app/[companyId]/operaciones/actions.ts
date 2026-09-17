"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { workerSchema, expenseSchema } from "@/lib/operations";
import { financeError } from "@/lib/finance";
export type OperationState = { error?: string; success?: string };
export async function saveOperation(
  companyId: string,
  kind: "workers" | "expenses",
  _: OperationState,
  form: FormData,
): Promise<OperationState> {
  if (!["workers", "expenses"].includes(kind))
    return { error: "Operación inválida." };
  const { db } = await requireModule(
    companyId,
    kind === "workers" ? "trabajadores" : "gastos",
    "write",
  );
  const id = uuid.safeParse(form.get("id")),
    version = Number(form.get("version"));
  if (!id.success || !Number.isSafeInteger(version) || version < 0)
    return { error: "Vuelve a abrir el registro." };
  const raw = Object.fromEntries(form),
    parsed =
      kind === "workers"
        ? workerSchema.safeParse({
            ...raw,
            active: form.get("active") === "on",
          })
        : expenseSchema.safeParse({
            ...raw,
            project_id: raw.project_id || null,
            worker_id: raw.worker_id || null,
          });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  const { error } = await db.rpc(
    kind === "workers" ? "save_worker" : "save_expense",
    {
      p_company: companyId,
      p_id: id.data,
      p_version: version,
      p_data: parsed.data,
    },
  );
  if (error)
    return {
      error: error.message.includes("manager_required")
        ? "La aprobación, anulación y registro de reembolsos requieren un administrador."
        : financeError(error),
    };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(
    `/app/${companyId}/${kind === "workers" ? "trabajadores" : "gastos"}/${id.data}?saved=1`,
  );
}
export async function searchOperationChoices(
  companyId: string,
  kind: "workers" | "projects",
  q: string,
): Promise<{ error?: string; data?: { id: string; name: string }[] }> {
  if (!["workers", "projects"].includes(kind))
    return { error: "Selección inválida." };
  const { db } = await requireModule(
    companyId,
    kind === "workers" ? "trabajadores" : "fin-proyectos",
  );
  let query = db
    .from(kind)
    .select("id,name")
    .eq("company_id", companyId)
    .ilike(
      "name",
      `%${q
        .trim()
        .slice(0, 100)
        .replace(/[\\%_]/g, "\\$&")}%`,
    )
    .order("name")
    .order("id")
    .limit(25);
  if (kind === "workers") query = query.eq("active", true);
  const { data, error } = await query;
  return error ? { error: "No se pudieron buscar los registros." } : { data };
}
