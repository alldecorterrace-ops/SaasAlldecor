"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isConfigured } from "@/lib/supabase/server";
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
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await db.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${site}/auth/callback` },
  });
  if (error)
    return {
      error:
        "No pudimos completar el registro. Inténtalo más tarde o contacta al administrador.",
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
