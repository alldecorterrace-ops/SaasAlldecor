"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Layers3, ShieldCheck } from "lucide-react";
import { authenticate, type AuthState } from "@/app/auth/actions";
import { Input } from "./ui/input";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function AuthForm({
  mode,
  error,
}: {
  mode: "login" | "register";
  error?: string;
}) {
  const [state, action] = useActionState(
    authenticate.bind(null, mode),
    {} as AuthState,
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const registering = mode === "register";
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#123e31] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -bottom-48 -right-36 size-[600px] rounded-full border border-white/10" />
        <div className="absolute -bottom-24 -right-12 size-[400px] rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border border-white/25 text-xl font-bold">
            a.
          </span>
          <span className="text-xl font-semibold tracking-tight">
            all decor
            <span className="ml-2 text-sm font-normal text-white/50">
              workspace
            </span>
          </span>
        </div>
        <div className="relative max-w-lg">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[.22em] text-[#c5d99b]">
            Un espacio para avanzar
          </p>
          <h2 className="text-5xl leading-[1.12] font-semibold tracking-[-.05em]">
            El próximo capítulo
            <br />
            de tu empresa.
          </h2>
          <p className="mt-7 max-w-sm text-base leading-7 text-white/65">
            Clientes, equipo y proyectos conectados. Cada empresa con su propio
            espacio para trabajar.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <span className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-white/80">
              <Layers3 size={14} />
              Varias empresas
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-white/80">
              <ShieldCheck size={14} />
              Acceso por permisos
            </span>
          </div>
        </div>
        <p className="relative text-xs text-white/45">
          ALL DECOR TERRACE · PLATAFORMA DE GESTIÓN
        </p>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-12 block text-xl font-bold tracking-tight lg:hidden"
          >
            all decor<span className="text-primary">.</span>
          </Link>
          <p className="eyebrow">Tu espacio de trabajo</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            {registering ? "Crea tu acceso" : "Bienvenido de nuevo"}
          </h1>
          <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
            {registering
              ? "Registra tu cuenta para crear una empresa o unirte a tu equipo."
              : "Inicia sesión y continúa donde lo dejaste."}
          </p>
          <Feedback error={state.error ?? error} success={state.success} />
          <form action={action} className="grid gap-5">
            <label className="field">
              Correo electrónico
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
              />
            </label>
            <label className="field">
              Contraseña
              <Input
                name="password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={registering ? 12 : 1}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {registering && <small>Al menos 12 caracteres.</small>}
            </label>
            <div className="mt-2 [&>button]:w-full">
              <SubmitButton
                pending={registering ? "Creando acceso…" : "Ingresando…"}
              >
                {registering ? "Crear cuenta" : "Iniciar sesión"}
                <ArrowUpRight size={16} />
              </SubmitButton>
            </div>
          </form>
          <p className="mt-7 text-center text-sm text-muted-foreground">
            {registering ? "¿Ya tienes una cuenta?" : "¿Primera vez aquí?"}{" "}
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href={registering ? "/login" : "/registro"}
            >
              {registering ? "Inicia sesión" : "Crear cuenta"}
            </Link>
          </p>
          <p className="mt-12 text-center text-xs leading-5 text-muted-foreground">
            Nueva plataforma en desarrollo.
            <br />
            ADT Admin continúa disponible en su dirección habitual.
          </p>
        </div>
      </section>
    </main>
  );
}
