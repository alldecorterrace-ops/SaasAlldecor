"use server";
import { requireModule } from "@/lib/auth";
import { designModule, rateLabels, dimensionLabels } from "@/lib/designs";
import { uuid } from "@/lib/validation";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
export async function priceAction(
  companyId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await requireModule(companyId, "adm-precios", "write");
  const rates = Object.fromEntries(
    Object.keys(rateLabels).map((k) => [k, String(form.get(k) ?? "")]),
  );
  const { error } = await db.rpc("save_price_book", {
    p_company: companyId,
    p_version: Number(form.get("version")),
    p_rates: rates,
  });
  if (error)
    return {
      error:
        error.code === "40001"
          ? "Hay otra revisión. Vuelve a abrir Precios."
          : "Revisa todas las tarifas. Los techos deben tener precio positivo; admite dos decimales.",
    };
  revalidatePath(`/app/${companyId}`, "layout");
  return {
    success:
      "Tarifas guardadas. Los diseños existentes conservan sus precios hasta que solicites actualizarlos.",
  };
}
export async function designAction(
  companyId: string,
  kind: string,
  operation: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!designModule(kind)) return { error: "Diseño inválido." };
  const { db } = await requireModule(companyId, kind, "write"),
    id = String(form.get("id")),
    version = Number(form.get("version"));
  if (!uuid.safeParse(id).success) return { error: "Registro inválido." };
  if (operation === "estimate") {
    await requireModule(companyId, "fin-estimados", "write");
    const { data, error } = await db.rpc("design_to_estimate", {
      p_company: companyId,
      p_id: id,
      p_version: version,
      p_estimate: form.get("estimate_id"),
    });
    if (error)
      return {
        error:
          "No se pudo generar. Comprueba la revisión, el cliente y tus permisos de Estimados.",
      };
    revalidatePath(`/app/${companyId}`, "layout");
    redirect(`/app/${companyId}/estimados/${data}`);
  }
  const spec: Record<string, unknown> = Object.fromEntries(
    [...Object.keys(dimensionLabels), "roof", "wall", "color"].map((k) => [
      k,
      String(form.get(k) ?? ""),
    ]),
  );
  spec.permit = form.get("permit") === "on";
  const { error } = await db.rpc("save_design", {
    p_company: companyId,
    p_id: id,
    p_version: version,
    p_kind: kind,
    p_refresh: form.get("refresh") === "on",
    p_data: {
      name: form.get("name"),
      customer_id: form.get("customer_id"),
      spec,
      archived: form.get("archived") === "on",
    },
  });
  if (error)
    return {
      error:
        error.code === "40001"
          ? "Hay otra revisión. Recarga antes de guardar."
          : error.message.includes("prices_required")
            ? "Primero configura las tarifas de esta empresa en Precios."
            : "Revisa el cliente, las medidas (0–200 ft), el tipo de pared y tus permisos.",
    };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/disenos/${kind}/${id}?saved=1`);
}
