"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { customerFromForm, uuid } from "@/lib/validation";
export type CustomerState = { error?: string };
export async function saveCustomer(
  companyId: string,
  _: CustomerState,
  form: FormData,
): Promise<CustomerState> {
  const { db } = await requireModule(companyId, "clientes", "write");
  const input = customerFromForm(form),
    id = uuid.safeParse(form.get("id")),
    version = Number(form.get("version"));
  if (!input.success)
    return {
      error: input.error.issues[0]?.message ?? "Revisa los campos del cliente.",
    };
  if (!id.success || !Number.isSafeInteger(version) || version < 0)
    return {
      error: "No se pudo identificar esta edición. Vuelve a abrir el cliente.",
    };
  const { error } = await db.rpc("save_customer", {
    p_company: companyId,
    p_id: id.data,
    p_version: version,
    p_data: input.data,
  });
  if (error)
    return {
      error:
        error.code === "40001"
          ? "Este cliente cambió mientras lo editabas. Conserva tus cambios y vuelve a abrir su ficha para revisar la última versión."
          : error.code === "23505"
            ? "Esta solicitud ya se guardó. Vuelve al listado para consultar el cliente."
            : "No pudimos guardar el cliente. Revisa tu acceso e inténtalo de nuevo.",
    };
  revalidatePath(`/app/${companyId}/clientes`);
  revalidatePath(`/app/${companyId}`);
  redirect(`/app/${companyId}/clientes/${id.data}?saved=1`);
}
