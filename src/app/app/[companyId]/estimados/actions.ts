"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { estimateSchema, estimateTotals } from "@/lib/estimates";
import type { CommercialState } from "../leads/actions";
export async function saveEstimate(
  companyId: string,
  _: CommercialState,
  form: FormData,
): Promise<CommercialState> {
  const { db } = await requireModule(companyId, "fin-estimados", "write");
  let raw: unknown;
  try {
    const text = String(form.get("payload") ?? "");
    if (text.length > 200000) throw new Error();
    raw = JSON.parse(text);
  } catch {
    return { error: "No se pudo leer el estimado." };
  }
  const parsed = estimateSchema.safeParse(raw),
    id = uuid.safeParse(form.get("id")),
    version = Number(form.get("version"));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Revisa el estimado." };
  if (parsed.data.status === "APROBADO")
    return {
      error: "Usa Registrar aprobación para generar la factura y el proyecto.",
    };
  if (!id.success || !Number.isSafeInteger(version) || version < 0)
    return { error: "Vuelve a abrir el estimado." };
  try {
    estimateTotals(parsed.data);
  } catch {
    return {
      error:
        "Revisa los importes: el descuento no puede superar el subtotal y los precios admiten dos decimales.",
    };
  }
  const { error } = await db.rpc("save_estimate", {
    p_company: companyId,
    p_id: id.data,
    p_version: version,
    p_data: parsed.data,
  });
  if (error)
    return {
      error:
        error.code === "40001"
          ? "Existe una revisión más reciente. Copia tus cambios y vuelve a abrir el estimado."
          : error.code === "23505"
            ? "Esta solicitud ya se guardó. Vuelve al listado."
            : error.message.includes("customer_access_required")
              ? "Necesitas permiso de lectura de Clientes para seleccionar un cliente."
              : error.message.includes("estimate_voided")
                ? "Un estimado anulado no se puede modificar."
                : "No se pudo guardar. Revisa los datos, el cliente seleccionado y los permisos.",
    };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/estimados/${id.data}?saved=1`);
}
export type CustomerChoice = { id: string; full_name: string };
export type ProductChoice = {
  id: string;
  name: string;
  base: string;
  unit_price: string | number;
};
export async function searchEstimateChoices(
  companyId: string,
  kind: "customers" | "products",
  q: string,
): Promise<{
  error?: string;
  customers?: CustomerChoice[];
  products?: ProductChoice[];
}> {
  const { db } = await requireModule(companyId, "fin-estimados", "write");
  if (kind !== "customers" && kind !== "products")
    return { error: "Selección inválida." };
  await requireModule(
    companyId,
    kind === "customers" ? "clientes" : "productos",
  );
  const escaped = q
    .trim()
    .slice(0, 100)
    .replace(/[\\%_]/g, "\\$&");
  if (kind === "customers") {
    const { data, error } = await db
      .from("customers")
      .select("id,full_name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .ilike("full_name", `%${escaped}%`)
      .order("full_name")
      .order("id")
      .limit(25);
    return error
      ? { error: "No se pudieron buscar clientes." }
      : { customers: data };
  }
  const { data, error } = await db
    .from("products")
    .select("id,name,base,unit_price")
    .eq("company_id", companyId)
    .eq("active", true)
    .ilike("name", `%${escaped}%`)
    .order("name")
    .order("id")
    .limit(25);
  return error
    ? { error: "No se pudo buscar en el catálogo." }
    : { products: data };
}
