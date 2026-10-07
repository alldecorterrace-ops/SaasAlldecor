import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { subscriptionPlans, billingConfig } from "@/lib/subscriptions";
import { SubscriptionPlanPicker } from "@/components/subscription-plan-picker";
export const dynamic = "force-dynamic";
const roleRows = [
  [
    "Dueño principal / gerente",
    "Todos los módulos de su empresa, equipo e invitaciones. Gestiona el plan. Su cuenta está protegida.",
  ],
  [
    "Administrador · acceso total",
    "Todos los módulos de esa empresa. Invita y gestiona empleados y administradores; no puede quitar, suspender ni degradar al dueño.",
  ],
  [
    "Empleado con permisos",
    "Solo los módulos y acciones asignados: consultar o editar. Puede trabajar en campo según su perfil. No invita ni crea empresas.",
  ],
  [
    "Solo consulta",
    "Empleado con permisos de consulta, sin modificaciones. También ocupa una plaza del plan.",
  ],
];
export default function Plans() {
  const config = billingConfig(process.env);
  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <Link href="/planes" className="text-2xl font-bold tracking-tight">
          all decor<span className="text-primary">.</span>
        </Link>
        <Link href="/login" className="text-sm font-semibold text-primary">
          Iniciar sesión <ArrowUpRight className="inline size-4" />
        </Link>
      </header>
      <section className="mx-auto mt-16 max-w-3xl text-center">
        <p className="eyebrow">Una empresa. Un equipo. Accesos claros.</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          El plan para la próxima etapa de tu empresa.
        </h1>
        <p className="mt-6 text-base leading-7 text-muted-foreground">
          Clientes, estimados, facturas, proyectos y equipo en un espacio
          independiente. Elige según cuántas personas necesitan trabajar
          contigo.
        </p>
        <p className="mt-5 text-sm font-semibold">
          USD · mensual · una empresa por suscripción
        </p>
        {config?.mode === "test" && (
          <p role="status" className="mt-4 rounded-xl bg-accent p-3">
            Pruebas con pagos ficticios. No se realizan cobros reales.
          </p>
        )}
      </section>
      <SubscriptionPlanPicker
        plans={subscriptionPlans.map((plan) => ({
          ...plan,
          requestId: randomUUID(),
        }))}
        enabled={!!config}
        testMode={config?.mode === "test"}
      />
      <p className="mt-5 text-sm text-muted-foreground">
        Los límites incluyen al dueño, administradores y empleados. Una
        invitación vigente reserva una plaza hasta que se acepta, vence o se
        revoca. Cada empresa adicional requiere su propio plan. Precios base en
        USD, antes de impuestos aplicables.
      </p>
      <section className="mt-16 grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <ShieldCheck className="size-8 text-primary" />
          <h2 className="mt-4 text-2xl font-semibold">
            Cada persona sabe qué puede hacer.
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Quien compra el plan queda como dueño y gerente cuando se verifica
            el pago y confirma su correo. Cada empleado recibe una invitación y
            define su propia contraseña. Los accesos se aplican al aceptar.
          </p>
        </div>
        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Rol</th>
                <th>Acceso</th>
              </tr>
            </thead>
            <tbody>
              {roleRows.map(([role, access]) => (
                <tr key={role}>
                  <td className="font-semibold">{role}</td>
                  <td>{access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        ¿Recibiste una invitación?{" "}
        <Link className="font-semibold text-primary underline" href="/registro">
          Crea tu contraseña y confirma tu correo
        </Link>
        , o inicia sesión si ya tienes cuenta.
      </footer>
    </main>
  );
}
