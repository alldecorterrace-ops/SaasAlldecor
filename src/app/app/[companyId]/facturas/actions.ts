"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { financeError } from "@/lib/finance";
import { parseFinanceRequest, financeRequestResult } from "@/lib/finance-requests";
export type FinanceState = { error?: string; success?: string };
export async function financeAction(companyId: string, _: FinanceState, form: FormData): Promise<FinanceState> {
  const parsed = parseFinanceRequest(form);
  if (!parsed.success) return { error: parsed.error };
  const { operation, id, version, request, payload } = parsed.data;
  const { db } = await requireModule(companyId, operation === "project" ? "fin-proyectos" : operation === "approve" ? "fin-estimados" : "fin-invoices", "write");
  if (operation === "approve") {
    await requireModule(companyId, "fin-invoices", "write");
    await requireModule(companyId, "fin-proyectos", "write");
  }
  const result = await db.rpc("execute_finance_action", {
    p_company: companyId, p_request: request, p_operation: operation,
    p_id: id, p_version: version, p_data: payload,
  });
  if (result.error) return { error: financeError(result.error) };
  const receipt = financeRequestResult.safeParse(result.data);
  if (!receipt.success || receipt.data.operation !== operation)
    return { error: "La respuesta no se pudo confirmar. Conserva el formulario y repite la misma solicitud." };
  revalidatePath(`/app/${companyId}`, "layout");
  if (operation === "approve") redirect(`/app/${companyId}/facturas/${receipt.data.id}`);
  return { success: "Cambio guardado. El historial conserva los datos anteriores." };
}
