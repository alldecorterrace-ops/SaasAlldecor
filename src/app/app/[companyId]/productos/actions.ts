"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { productSchema, commercialError } from "@/lib/commercial";
import type { CommercialState } from "../leads/actions";
export async function saveProduct(
  companyId: string,
  _: CommercialState,
  form: FormData,
): Promise<CommercialState> {
  const { db } = await requireModule(companyId, "productos", "write");
  let payload: unknown;
  try {
    const raw = String(form.get("payload") ?? "");
    if (raw.length > 110000) throw new Error();
    payload = JSON.parse(raw);
  } catch {
    return { error: "No se pudieron leer los detalles del producto." };
  }
  const input = productSchema.safeParse(payload),
    id = uuid.safeParse(form.get("id")),
    version = Number(form.get("version"));
  if (!input.success)
    return { error: input.error.issues[0]?.message ?? "Revisa el producto." };
  if (!id.success || !Number.isSafeInteger(version) || version < 0)
    return { error: "Vuelve a abrir la ficha." };
  const { error } = await db.rpc("save_product", {
    p_company: companyId,
    p_id: id.data,
    p_version: version,
    p_data: input.data,
  });
  if (error) return { error: commercialError(error.code) };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/productos/${id.data}?saved=1`);
}
