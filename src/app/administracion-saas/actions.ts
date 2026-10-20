"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdministrator, platformContext } from "@/lib/platform";
import {
  notifyManagerInvitation,
  invitationMailConfig,
} from "@/lib/manager-mail";
export type PlatformState = { error?: string; success?: string };
const refresh = () => {
  revalidatePath("/administracion-saas");
  revalidatePath("/empresas");
};
export async function inviteManager(
  _: PlatformState,
  form: FormData,
): Promise<PlatformState> {
  const { db } = await requirePlatformAdministrator();
  const value = z
    .object({ id: z.uuid(), email: z.string().trim().max(254).pipe(z.email()) })
    .safeParse({ id: form.get("request_id"), email: form.get("email") });
  if (!value.success) return { error: "Revisa el correo del gerente." };
  const { data, error } = await db.rpc("invite_platform_manager", {
    p_id: value.data.id,
    p_email: value.data.email,
  });
  if (error)
    return {
      error: error.message.includes("account_exists")
        ? "La cuenta ya tiene acceso al SaaS. Revisa su estado en Gerentes."
        : "No se pudo crear la invitación. Actualiza la página e inténtalo de nuevo.",
    };
  const result = await notifyManagerInvitation(
    db,
    data,
    false,
    invitationMailConfig(process.env),
  );
  refresh();
  return result;
}
export async function revokeManager(id: string): Promise<PlatformState> {
  const { db } = await requirePlatformAdministrator();
  if (!z.uuid().safeParse(id).success) return { error: "Invitación inválida." };
  const { error } = await db.rpc("revoke_manager_invitation", { p_id: id });
  refresh();
  return error
    ? { error: "La invitación cambió. Actualiza la página." }
    : { success: "Invitación revocada." };
}
export async function resendManager(id: string): Promise<PlatformState> {
  const { db } = await requirePlatformAdministrator();
  if (!z.uuid().safeParse(id).success) return { error: "Invitación inválida." };
  const result = await notifyManagerInvitation(
    db,
    id,
    true,
    invitationMailConfig(process.env),
  );
  refresh();
  return result;
}
export async function respondManager(
  id: string,
  accept: boolean,
): Promise<PlatformState> {
  const { db } = await platformContext();
  if (!z.uuid().safeParse(id).success) return { error: "Invitación inválida." };
  const { error } = await db.rpc("respond_manager_invitation", {
    p_id: id,
    p_accept: accept,
  });
  if (error)
    return {
      error:
        "Invitación no disponible. Comprueba el correo confirmado de tu cuenta y si la invitación sigue vigente.",
    };
  refresh();
  if (accept) redirect("/empresas");
  return { success: "Invitación rechazada." };
}
export async function setManagerActive(
  id: string,
  version: number,
  active: boolean,
  _: PlatformState,
  form: FormData,
): Promise<PlatformState> {
  const { db } = await requirePlatformAdministrator();
  if (!z.uuid().safeParse(id).success) return { error: "Cuenta inválida." };
  const { error } = await db.rpc("set_platform_manager_active", {
    p_user: id,
    p_version: version,
    p_active: active,
    p_confirmed: form.get("confirmed") === "on",
  });
  refresh();
  return error
    ? { error: "Confirma el cambio. Si la cuenta cambió, actualiza la página." }
    : { success: active ? "Gerente activado." : "Gerente suspendido." };
}
