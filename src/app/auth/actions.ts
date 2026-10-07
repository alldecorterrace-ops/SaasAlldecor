"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { externalEffectsAllowed } from "@/lib/deployment-environment";
import {
  checkRegistrationInvitation,
  invitationRequiredMessage,
} from "@/lib/registration";
export type AuthState = { error?: string; success?: string };
export async function authenticate(
  mode: "login" | "register",
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  if (!isConfigured())
    return { error: "La conexión de este entorno está pendiente." };
  if (mode === "register" && !externalEffectsAllowed(process.env))
    return {
      error:
        "El registro por correo está desactivado en el entorno de pruebas. Usa una cuenta de prueba preparada.",
    };
  const parsed = z
    .object({
      email: z.email(),
      password: z
        .string()
        .min(mode === "register" ? 12 : 1)
        .max(128),
    })
    .safeParse({
      email: String(form.get("email") ?? "").trim(),
      password: form.get("password"),
    });
  if (!parsed.success)
    return {
      error:
        mode === "register"
          ? "Revisa el correo y usa una contraseña de al menos 12 caracteres."
          : "Escribe tu correo y contraseña.",
    };
  const db = await createClient();
  if (mode === "login") {
    const { error } = await db.auth.signInWithPassword(parsed.data);
    if (error)
      return {
        error:
          "No pudimos iniciar sesión. Revisa tus datos y confirma tu correo.",
      };
    redirect("/empresas");
  }
  const invitation = await checkRegistrationInvitation(() =>
    db.rpc("registration_invitation_available", { p_email: parsed.data.email }),
  );
  if (invitation.error) return invitation;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await db.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${site}/auth/callback` },
  });
  if (error)
    return {
      error: error.message.includes("signup_invitation_required")
        ? invitationRequiredMessage
        : "No pudimos completar el registro. Inténtalo más tarde o contacta al administrador.",
    };
  if (data.session) redirect("/empresas");
  return {
    success:
      "Revisa tu correo para confirmar el acceso. Si ya tienes una cuenta, puedes iniciar sesión.",
  };
}
export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/login");
}
