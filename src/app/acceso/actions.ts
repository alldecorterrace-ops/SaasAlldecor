"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
export async function accessShare(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{64}$/.test(token))
    return { error: "El enlace no es válido." };
  const db = await createClient(),
    { data, error } = await db.rpc("read_client_share", { p_token: token });
  if (error || !data)
    return { error: "El enlace venció, fue revocado o no está disponible." };
  (await cookies()).set("client_access", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });
  redirect("/cliente");
}
export async function respondShare(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = (await cookies()).get("client_access")?.value;
  if (!token) return { error: "Abre de nuevo tu enlace privado." };
  const db = await createClient(),
    { error } = await db.rpc("respond_client_share", {
      p_token: token,
      p_response: form.get("response"),
      p_name: form.get("name"),
      p_note: String(form.get("note") ?? ""),
    });
  if (error)
    return {
      error:
        "No se pudo registrar. La propuesta pudo cambiar, vencer o tener una respuesta anterior. Recarga la página.",
    };
  revalidatePath("/cliente");
  return {
    success: "Tu respuesta quedó registrada para revisión de la empresa.",
  };
}
export async function leaveShare() {
  (await cookies()).delete("client_access");
  redirect("/acceso");
}
