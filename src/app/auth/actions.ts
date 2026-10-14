"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { authRegistrationAllowed } from "@/lib/deployment-environment";
import { checkRegistrationInvitation } from "@/lib/registration";
import {
  authFailureMessage,
  registrationConfirmationMessage,
} from "@/lib/auth-feedback";
export type AuthState = { error?: string; success?: string };
export async function authenticate(
  mode: "login" | "register",
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  if (!isConfigured())
    return { error: "La conexión de este entorno está pendiente." };
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
  if (
    mode === "register" &&
    !authRegistrationAllowed(process.env, parsed.data.email)
  )
    return {
      error:
        "En este entorno solo se permite registrar cuentas de prueba autorizadas.",
    };
  const db = await createClient();
  if (mode === "login") {
    const { error } = await db.auth.signInWithPassword(parsed.data);
    if (error) return { error: authFailureMessage("login", error) };
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
      error: authFailureMessage("register", {
        ...error,
        // The Before User Created hook reports its safe denial as its message.
        code:
          error.message === "signup_invitation_required"
            ? "signup_invitation_required"
            : error.code,
      }),
    };
  if (data.session) redirect("/empresas");
  return {
    success: registrationConfirmationMessage(
      process.env.APP_ENVIRONMENT === "staging",
    ),
  };
}
export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/login");
}
