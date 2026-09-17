"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyContext, requireModule } from "@/lib/auth";
import { modules } from "@/lib/modules";
import { uuid, companySchema } from "@/lib/validation";
export type SettingsState = { error?: string; success?: string };
export async function updateCompany(
  companyId: string,
  _: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { db } = await requireModule(companyId, "config", "write");
  const parsed = companySchema.safeParse({ name: form.get("name") });
  if (!parsed.success) return { error: "Revisa el nombre de la empresa." };
  const { error } = await db.rpc("update_company", {
    p_company: companyId,
    p_name: parsed.data.name,
    p_timezone: String(form.get("timezone") ?? ""),
  });
  if (error)
    return { error: "No pudimos guardar la configuración. Revisa los datos." };
  revalidatePath(`/app/${companyId}`, "layout");
  return { success: "Configuración guardada." };
}
export async function addMember(
  companyId: string,
  _: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { db, member } = await companyContext(companyId);
  if (!["owner", "admin"].includes(member.role))
    return { error: "No tienes permiso para administrar el equipo." };
  const email = z.email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { error: "Escribe un correo válido." };
  const { error } = await db.rpc("add_company_member", {
    p_company: companyId,
    p_email: email.data,
  });
  if (error)
    return {
      error:
        "No se pudo agregar la cuenta. La persona debe registrarse y confirmar su correo primero.",
    };
  revalidatePath(`/app/${companyId}/configuracion`);
  return {
    success: "Acceso incorporado, o ya existente. Revisa sus permisos abajo.",
  };
}
export async function updateMember(
  companyId: string,
  userId: string,
  _: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { db, member } = await companyContext(companyId);
  if (
    !["owner", "admin"].includes(member.role) ||
    !uuid.safeParse(userId).success
  )
    return { error: "No tienes permiso para realizar este cambio." };
  const permissions: Record<string, string[]> = {};
  for (const m of modules) {
    const list: string[] = [];
    if (form.get(`read:${m.id}`) === "on") list.push("read");
    if (form.get(`write:${m.id}`) === "on") list.push("write");
    if (list.length) permissions[m.id] = list;
  }
  const role = String(form.get("role") ?? "member");
  const { error } = await db.rpc("set_member_access", {
    p_company: companyId,
    p_user: userId,
    p_role: role,
    p_active: form.get("active") === "on",
    p_permissions: permissions,
  });
  if (error)
    return {
      error:
        "No pudimos actualizar el acceso. Tu rol no permite ese cambio o la cuenta cambió.",
    };
  revalidatePath(`/app/${companyId}/configuracion`);
  return { success: "Permisos actualizados." };
}
