"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { companySchema, uuid } from "@/lib/validation";
export async function createCompany(
  _: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const { db } = await requireUser();
  const data = companySchema.safeParse({ name: form.get("name") }),
    id = uuid.safeParse(form.get("request_id"));
  if (!data.success || !id.success)
    return { error: "Escribe un nombre de empresa de 2 a 160 caracteres." };
  const { data: company, error } = await db.rpc("create_company", {
    p_id: id.data,
    p_name: data.data.name,
  });
  if (error)
    return {
      error:
        "No pudimos crear la empresa. Comprueba que tu correo esté confirmado e inténtalo de nuevo.",
    };
  redirect(`/app/${company}`);
}
