"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { SubscriptionCheckout } from "./subscription-checkout";
import { Button } from "./ui/button";
type Plan = {
  code: string;
  name: string;
  amount: number;
  users: number;
  description: string;
  requestId: string;
};
export function SubscriptionPlanPicker({
  plans,
  enabled,
  testMode,
}: {
  plans: Plan[];
  enabled: boolean;
  testMode: boolean;
}) {
  const [selected, setSelected] = useState("equipo");
  const current = plans.find((p) => p.code === selected)!;
  return (
    <>
      <ol
        className="mx-auto mt-10 flex max-w-xl flex-wrap justify-center gap-x-8 gap-y-3 text-sm"
        aria-label="Pasos para contratar"
      >
        <li className="font-semibold text-primary">1. Elige tu plan</li>
        <li>2. Tu empresa</li>
        <li>3. Pago seguro</li>
      </ol>
      <section
        className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Planes mensuales"
      >
        {plans.map((plan) => (
          <article
            key={plan.code}
            className={`card flex flex-col gap-5 ${plan.code === selected ? "border-primary ring-1 ring-primary" : ""}`}
          >
            <div className="flex min-h-6 flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider">
                {plan.name}
              </h2>
              {plan.code === "profesional" && (
                <span className="rounded-full bg-accent px-2 py-1 text-xs font-semibold text-primary">
                  Equipo y campo
                </span>
              )}
            </div>
            <p className="min-h-12 text-sm text-muted-foreground">
              {plan.description}
            </p>
            <p>
              <span className="text-4xl font-bold tracking-tight">
                ${plan.amount / 100}
              </span>
              <span className="text-muted-foreground"> /mes</span>
            </p>
            <p className="font-semibold">Hasta {plan.users} usuarios</p>
            <Button
              type="button"
              aria-pressed={selected === plan.code}
              variant={selected === plan.code ? "default" : "outline"}
              onClick={() => setSelected(plan.code)}
              className="w-full"
            >
              {selected === plan.code
                ? `${plan.name} seleccionado`
                : `Elegir ${plan.name}`}
            </Button>
            <ul className="grid flex-1 gap-3 text-sm">
              {[
                "Todos los módulos activos",
                "Una empresa independiente",
                "Invitaciones por correo",
                "Roles y permisos por usuario",
                "Dueño principal protegido",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="size-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <section
        className="card mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-2"
        aria-label="Datos de la empresa seleccionada"
      >
        <div>
          <p className="eyebrow">Tu elección</p>
          <h2 className="mt-3 text-2xl font-semibold">Plan {current.name}</h2>
          <p className="mt-3 text-xl font-semibold">
            ${current.amount / 100}/mes · {current.users} usuarios
          </p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Una empresa con todos los módulos activos. Tú serás el dueño
            principal y podrás invitar a tu equipo después de verificar el pago
            y tu correo.
          </p>
        </div>
        <SubscriptionCheckout
          key={current.code}
          plan={current.code}
          requestId={current.requestId}
          enabled={enabled}
          testMode={testMode}
        />
      </section>
    </>
  );
}
