"use server";
import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
export async function webAction(
  companyId: string,
  operation: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await requireModule(companyId, "estimadosweb", "write");
  if (operation === "create" || operation === "revoke") {
    const id = operation === "create" ? randomUUID() : String(form.get("id"));
    const { error } = await db.rpc("manage_web_form", {
      p_company: companyId,
      p_id: id,
      p_create: operation === "create",
    });
    if (error) return { error: "No se pudo guardar el formulario." };
    revalidatePath(`/app/${companyId}/solicitudes-web`);
    return {
      success:
        operation === "create"
          ? "Formulario creado. El enlace público aparece en el listado."
          : "Formulario desactivado.",
    };
  }
  if (operation !== "convert" && operation !== "archive")
    return { error: "Acción inválida." };
  const { data, error } = await db.rpc("review_web_request", {
    p_company: companyId,
    p_id: form.get("id"),
    p_convert: operation === "convert",
  });
  if (error)
    return {
      error:
        "No se pudo revisar. Convertir requiere permiso de escritura en Leads.",
    };
  revalidatePath(`/app/${companyId}`, "layout");
  if (data) redirect(`/app/${companyId}/leads/${data}`);
  return {
    success:
      "Solicitud archivada. Sus datos se conservan y aún puede convertirse en lead.",
  };
}
