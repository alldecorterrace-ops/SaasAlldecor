"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { companyContext, requireUser } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { invitationMailConfig, notifyInvitation } from "@/lib/invitation-mail";

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
  const { data: invitationId, error } = await db.rpc(
    "create_company_invitation",
    {
      p_company: companyId,
      p_id: parsed.data.id,
      p_email: parsed.data.email,
    },
  );
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
