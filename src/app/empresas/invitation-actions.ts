"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { companyContext, requireUser } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { workspaceModules } from "@/lib/modules";
import { invitationMailConfig, notifyInvitation } from "@/lib/invitation-mail";
import {
  stagingInvitationTest,
  stagingInvitationTestFormAllowed,
} from "@/lib/staging-invitation-test";

export type InvitationState = { error?: string; success?: string };
export async function createInvitation(
  companyId: string,
  _: InvitationState,
  form: FormData,
): Promise<InvitationState> {
  const { db, member } = await companyContext(companyId);
  if (!["owner", "admin"].includes(member.role))
    return { error: "No puedes administrar este equipo." };
  const parsed = z
    .object({ id: uuid, email: z.string().trim().max(254).pipe(z.email()) })
    .safeParse({ id: form.get("request_id"), email: form.get("email") });
  if (!parsed.success) return { error: "Revisa el correo del destinatario." };
  const permissions: Record<string, string[]> = {};
  for (const m of workspaceModules.filter((m) => m.ready)) {
    const actions = [
      ...(form.get(`read:${m.id}`) === "on" ? ["read"] : []),
      ...(form.get(`write:${m.id}`) === "on" ? ["write"] : []),
    ];
    if (actions.length) permissions[m.id] = actions;
  }
  const role = z
    .enum(["admin", "member"])
    .safeParse(form.get("role") ?? "member");
  if (!role.success) return { error: "No puedes invitar con ese rol." };
  const qa = stagingInvitationTest(process.env);
  if (
    qa &&
    !stagingInvitationTestFormAllowed(qa, {
      company: companyId,
      invitation: parsed.data.id,
      email: parsed.data.email,
      role: role.data,
      permissions,
    })
  )
    return {
      error:
        "La invitación de prueba está limitada al empleado y los permisos de consulta previstos.",
    };
  const { data: invitationId, error } = await db.rpc("invite_company_user", {
    p_company: companyId,
    p_id: parsed.data.id,
    p_email: parsed.data.email,
    p_role: role.data,
    p_permissions: role.data === "admin" ? {} : permissions,
  });
  if (error?.message.includes("subscription_pending_user_limit"))
    return {
      error:
        "La bajada programada no permite más personas. Libera una plaza o pide al dueño que cancele la bajada antes de invitar.",
    };
  if (error?.message.includes("subscription_user_limit"))
    return {
      error:
        "El plan ya tiene todas sus plazas ocupadas o reservadas. Revoca una invitación pendiente o libera una plaza antes de invitar.",
    };
  if (error?.message.includes("subscription_inactive"))
    return {
      error:
        "La suscripción necesita regularizarse. El propietario puede revisar el pago para habilitar nuevas invitaciones.",
    };
  if (error)
    return {
      error: error.message.includes("member_exists")
        ? "Esta persona ya está en el equipo. Revisa sus permisos o suspensión abajo."
        : "No se pudo crear la invitación. Actualiza la página y vuelve a intentarlo.",
    };
  const delivery = await notifyInvitation(
    db,
    companyId,
    invitationId,
    false,
    invitationMailConfig(process.env),
  );
  revalidatePath(`/app/${companyId}/configuracion`);
  revalidatePath("/empresas");
  return delivery;
}
export async function resendInvitation(
  companyId: string,
  id: string,
): Promise<InvitationState> {
  const { db, member } = await companyContext(companyId);
  if (!["owner", "admin"].includes(member.role) || !uuid.safeParse(id).success)
    return { error: "No puedes enviar esta invitación." };
  const result = await notifyInvitation(
    db,
    companyId,
    id,
    true,
    invitationMailConfig(process.env),
  );
  revalidatePath(`/app/${companyId}/configuracion`);
  return result;
}
export async function revokeInvitation(
  companyId: string,
  id: string,
): Promise<InvitationState> {
  const { db, member } = await companyContext(companyId);
  if (!["owner", "admin"].includes(member.role) || !uuid.safeParse(id).success)
    return { error: "No puedes realizar este cambio." };
  const { error } = await db.rpc("revoke_company_invitation", {
    p_company: companyId,
    p_id: id,
  });
  if (error)
    return {
      error: "La invitación cambió o no está disponible. Actualiza la página.",
    };
  revalidatePath(`/app/${companyId}/configuracion`);
  revalidatePath("/empresas");
  return { success: "Invitación revocada." };
}
export async function respondInvitation(
  id: string,
  accept: boolean,
): Promise<InvitationState> {
  const { db } = await requireUser();
  if (!uuid.safeParse(id).success)
    return { error: "Invitación no disponible." };
  const { data, error } = await db.rpc("respond_company_invitation", {
    p_id: id,
    p_accept: accept,
  });
  if (error)
    return {
      error:
        "No se pudo aceptar o rechazar. Comprueba el correo de tu cuenta; la invitación puede haber vencido o sido revocada.",
    };
  revalidatePath("/empresas");
  if (accept && data) redirect(`/app/${data}`);
  return { success: "Invitación rechazada." };
}
