"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { SubscriptionCheckout } from "./subscription-checkout";
import { Button } from "./ui/button";
import {
  planUsersLabel,
  planCompaniesLabel,
  planInvoicesLabel,
  planServices,
  type SubscriptionPlan,
  type PlanCode,
} from "@/lib/subscription-catalog";
type Plan = SubscriptionPlan & { requestId: string };
export function SubscriptionPlanPicker({
  plans,
  enabled,
  testMode,
  initialPlan = "equipo",
}: {
  plans: Plan[];
  enabled: boolean;
  testMode: boolean;
  initialPlan?: PlanCode;
}) {
  const [selected, setSelected] = useState<PlanCode>(initialPlan);
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
            <div className="flex min-h-14 flex-col items-start gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider">
                {plan.name}
              </h2>
              {plan.code === "profesional" && (
                <span className="rounded-full bg-accent px-2 py-1 text-xs font-semibold text-primary">
                  Empresas sin límite
                </span>
              )}
            </div>
            <p className="min-h-12 text-sm text-muted-foreground">
              {plan.description}
            </p>
            <p>
              <span className="text-4xl font-bold tracking-tight">
                ${(plan.amount / 100).toFixed(2)}
              </span>
              <span className="text-muted-foreground"> USD/mes</span>
            </p>
            <p className="font-semibold">{planUsersLabel(plan.users)}</p>
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
            <ul className="grid flex-1 content-start gap-3 text-sm">
              {[
                planCompaniesLabel(plan.companies),
                planInvoicesLabel(plan.invoices),
                "Todos los módulos activos",
                ...(plan.users === 1
                  ? []
                  : ["Invitaciones y permisos por empresa"]),
                ...planServices(plan),
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
        className="card mt-8 overflow-x-auto"
        aria-label="Comparación de planes"
      >
        <h2 className="mb-5 text-xl font-semibold">
          Compara lo que incluye cada plan
        </h2>
        <table className="min-w-[650px]">
          <thead>
            <tr>
              <th scope="col">Incluye</th>
              {plans.map((p) => (
                <th scope="col" key={p.code}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Usuarios totales, incluido el dueño</th>
              {plans.map((p) => (
                <td key={p.code}>{p.users ?? "Ilimitados"}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Empresas de la suscripción</th>
              {plans.map((p) => (
                <td key={p.code}>{p.companies ?? "Ilimitadas"}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Facturas al mes, entre todas las empresas</th>
              {plans.map((p) => (
                <td key={p.code}>{p.invoices ?? "Ilimitadas"}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Atención por email</th>
              {plans.map((p) => (
                <td key={p.code}>
                  {p.support === "standard" ? "—" : "Incluida"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Atención por teléfono</th>
              {plans.map((p) => (
                <td key={p.code}>{p.support === "phone" ? "Incluida" : "—"}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Creación de sitio web personalizado</th>
              {plans.map((p) => (
                <td key={p.code}>{p.customWebsite ? "Incluida" : "—"}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Cambios personalizados en módulos</th>
              {plans.map((p) => (
                <td key={p.code}>{p.customModules ? "Incluidos" : "—"}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-sm text-muted-foreground">
          Todos incluyen los módulos activos y la protección del dueño
          principal. La web y los ajustes de módulos se coordinan con nuestro
          equipo.
        </p>
      </section>
      <section
        className="card mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-2"
        aria-label="Datos de la empresa seleccionada"
      >
        <div>
          <p className="eyebrow">Tu elección</p>
          <h2 className="mt-3 text-2xl font-semibold">Plan {current.name}</h2>
          <p className="mt-3 text-xl font-semibold">
            ${(current.amount / 100).toFixed(2)}/mes ·{" "}
            {planUsersLabel(current.users)}
          </p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {planCompaniesLabel(current.companies)} y{" "}
            {planInvoicesLabel(current.invoices).toLowerCase()}. Crea tu primera
            empresa al verificar el pago y tu correo. Después podrás añadir las
            empresas y personas que permita tu plan.
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
