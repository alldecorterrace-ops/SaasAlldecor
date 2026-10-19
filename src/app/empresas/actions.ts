"use server";
import { redirect } from "next/navigation";
import { platformContext } from "@/lib/platform";
import { companySchema, uuid } from "@/lib/validation";
export async function createCompany(
  _: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const { db, platform } = await platformContext();
  if (platform?.role !== "manager" || !platform.active)
    return {
      error:
        "Tu acceso no permite crear otra empresa. Revisa el estado y el cupo de tu suscripción.",
    };
  const data = companySchema.safeParse({ name: form.get("name") }),
    id = uuid.safeParse(form.get("request_id"));
  if (!data.success || !id.success)
    return { error: "Escribe un nombre de empresa de 2 a 160 caracteres." };
  const subscription = form.get("subscription_id");
  if (subscription && !uuid.safeParse(subscription).success)
    return { error: "Selecciona una suscripción válida." };
  const { data: company, error } = await db.rpc(
    subscription ? "create_subscription_company" : "create_company",
    {
      ...(subscription ? { p_order: subscription } : {}),
      p_id: id.data,
      p_name: data.data.name,
    },
  );
  if (error)
    return {
      error: error.message.includes("subscription_pending_company_limit")
        ? "La bajada programada no permite más empresas. El dueño puede cancelarla antes de añadir otra empresa."
        : error.message.includes("subscription_company_limit")
          ? "El plan ya cubre el máximo de empresas. Elige una suscripción con capacidad disponible."
          : error.message.includes("subscription_inactive")
            ? "La suscripción debe estar activa para crear otra empresa."
            : error.message.includes("manager_invitation_required")
              ? "Solo los gerentes invitados y activos pueden crear empresas."
              : "No pudimos crear la empresa. Comprueba que tu correo esté confirmado e inténtalo de nuevo.",
    };
  redirect(`/app/${company}`);
}
