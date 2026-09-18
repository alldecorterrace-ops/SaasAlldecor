"use client";
import { useActionState } from "react";
import Link from "next/link";
import {
  requestPasswordReset,
  updatePassword,
} from "@/app/auth/password-actions";
import type { RecoveryState } from "@/lib/password-recovery";
import { Input } from "./ui/input";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";

export function PasswordForm({ mode }: { mode: "request" | "update" }) {
  const requesting = mode === "request";
  const [state, action, pending] = useActionState(
    requesting ? requestPasswordReset : updatePassword,
    {} as RecoveryState,
  );
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-md card">
        <p className="eyebrow">All Decor · Tu cuenta</p>
        <h1 className="page-title mt-3">
          {requesting ? "Recuperar contraseña" : "Elige tu nueva contraseña"}
        </h1>
        <p className="my-5 text-sm leading-6 text-muted-foreground">
          {requesting
            ? "Escribe el correo de tu cuenta. Abre el enlace que recibas en este mismo navegador para completar la recuperación."
            : "Usa una contraseña de al menos 12 caracteres que no utilices en otros sitios."}
        </p>
        <Feedback error={state.error} success={state.success} />
        {!state.success && (
          <form action={action} className="space-y-5">
            <fieldset disabled={pending} className="space-y-5">
              {requesting ? (
                <label className="field">
                  Correo electrónico
                  <Input
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    Nueva contraseña
                    <Input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                    />
                  </label>
                  <label className="field">
                    Repite la nueva contraseña
                    <Input
                      name="confirmation"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                    />
                  </label>
                </>
              )}
              <SubmitButton pending="Procesando…">
                {requesting ? "Solicitar enlace" : "Guardar contraseña"}
              </SubmitButton>
            </fieldset>
          </form>
        )}
        <Link
          className="mt-7 inline-block text-sm font-semibold text-primary underline"
          href={!requesting && state.success ? "/empresas" : "/login"}
        >
          {!requesting && state.success
            ? "Continuar a mis empresas"
            : "Volver al inicio de sesión"}
        </Link>
      </section>
    </main>
  );
}
