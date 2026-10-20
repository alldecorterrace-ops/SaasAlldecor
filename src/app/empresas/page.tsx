import Link from "next/link";
import { Brand } from "@/components/brand";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Building2, ArrowUpRight, LogOut } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { CompanyForm } from "@/components/company-form";
import { Button } from "@/components/ui/button";
import { platformContext } from "@/lib/platform";
import { IncomingManagerInvitation } from "@/components/platform-forms";
import { IncomingInvitation } from "@/components/invitation-forms";
import { subscriptionSummarySchema } from "@/lib/subscription-summary";
export const dynamic = "force-dynamic";
export default async function Companies() {
  const initial = await platformContext();
  const { db, user } = initial;
  if (initial.platform?.role !== "administrator") {
    const { error } = await db.rpc("activate_my_paid_companies");
    if (error) throw new Error("No se pudo comprobar la activación del plan.");
  }
  const { data: updatedPlatform, error: platformError } =
    await db.rpc("platform_context");
  if (platformError) throw new Error("No se pudo comprobar tu acceso.");
  const platform = updatedPlatform?.[0] ?? null;
  if (platform?.role === "administrator" && platform.active)
    redirect("/administracion-saas");
  const { data: managerInvitations, error: managerInvitationError } =
    await db.rpc("my_manager_invitations");
  if (managerInvitationError)
    throw new Error("Invitaciones de gerente no disponibles");
  const { data, error } = await db
    .from("companies")
    .select("id,name,timezone")
    .order("name");
  if (error) throw new Error("Companies unavailable");
  const { data: portfolios, error: portfolioError } = await db.rpc(
    "my_subscription_portfolios",
  );
  if (portfolioError)
    throw new Error("No se pudieron comprobar tus suscripciones.");
  const subscriptions = subscriptionSummarySchema
    .array()
    .parse(portfolios ?? []);
  const canAdd =
    platform?.can_create_company &&
    (subscriptions.length === 0 ||
      subscriptions.some(
        (s) =>
          s.writable &&
          (s.company_limit === null || s.companies < s.company_limit),
      ));
  const { data: invitations, error: invitationError } = await db.rpc(
    "my_company_role_invitations",
  );
  if (invitationError) throw new Error("Invitaciones no disponibles");
  const dates = new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Brand href="/empresas" />
        <form action={signOut}>
          <Button variant="ghost" size="sm">
            <LogOut size={14} />
            Cerrar sesión
          </Button>
        </form>
      </header>
      <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold text-primary">
        <Link href="/planes">Comparar planes</Link>
      </div>
      <div className="workspace-hero mt-8 mb-8 p-7 sm:p-9">
        <p className="eyebrow text-indigo-200">Espacios de trabajo</p>
        <h1 className="page-title mt-3">Tus empresas</h1>
        <p className="mt-3 break-words text-sm text-indigo-100">
          Selecciona dónde quieres trabajar. Sesión de {user.email}.
        </p>
      </div>
      {platform && !platform.active && (
        <p role="status" className="card mb-8">
          Tu acceso al SaaS está suspendido. Contacta al administrador global.
        </p>
      )}
      {subscriptions.length > 0 && (
        <section className="mb-8 grid gap-4" aria-label="Tus suscripciones">
          <h2 className="text-lg font-semibold">Tus suscripciones</h2>
          {subscriptions.map((s) => (
            <div key={s.id} className="card text-sm">
              <p className="font-semibold">
                {s.plan} · ${(s.amount_cents / 100).toFixed(2)}/mes
              </p>
              <p className="mt-2">
                {s.companies} empresas
                {s.company_limit === null
                  ? " · sin límite"
                  : ` de ${s.company_limit}`}{" "}
                · {s.active_users + s.pending_invitations} plazas ocupadas o
                reservadas
                {s.user_limit === null
                  ? " · sin límite"
                  : ` de ${s.user_limit}`}
              </p>
              <p className="mt-2">
                {s.invoices_this_month} facturas este mes
                {s.invoice_limit === null
                  ? " · sin límite"
                  : ` de ${s.invoice_limit}`}{" "}
                entre todas las empresas.
              </p>
              <Link
                className="mt-3 inline-block font-semibold text-primary underline"
                href={`/app/${s.company_id}/configuracion`}
              >
                Gestionar suscripción
              </Link>
            </div>
          ))}
        </section>
      )}
      {managerInvitations?.map((i: { id: string; expires_at: string }) => (
        <IncomingManagerInvitation
          key={i.id}
          id={i.id}
          expires={`${dates.format(new Date(i.expires_at))} UTC`}
        />
      ))}
      {invitations?.length > 0 && (
        <section
          className="mb-8 grid gap-4"
          aria-label="Invitaciones pendientes"
        >
          <h2 className="text-lg font-semibold">
            Te invitaron a estas empresas
          </h2>
          {invitations.map(
            (i: {
              id: string;
              company_name: string;
              expires_at: string;
              role: string;
              permissions: Record<string, string[]>;
            }) => (
              <IncomingInvitation
                key={i.id}
                id={i.id}
                name={i.company_name}
                role={i.role}
                permissions={i.permissions}
                expires={`${dates.format(new Date(i.expires_at))} UTC`}
              />
            ),
          )}
        </section>
      )}
      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <section className="grid content-start gap-4">
          {data?.length ? (
            data.map((c) => (
              <Link
                key={c.id}
                href={`/app/${c.id}`}
                className="card group flex items-center gap-4 transition hover:border-primary"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                  <Building2 />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold break-words">{c.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Espacio independiente
                  </p>
                </div>
                <ArrowUpRight className="size-5 text-muted-foreground group-hover:text-primary" />
              </Link>
            ))
          ) : (
            <div className="card py-12 text-center">
              <Building2 className="mx-auto mb-4 text-primary" />
              <h2 className="font-semibold">
                {platform?.can_create_company
                  ? "Crea tu primera empresa"
                  : "Tu acceso a una empresa"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {platform?.can_create_company
                  ? "Crea tus empresas y añade a sus usuarios con los roles y permisos que definas."
                  : "Si compraste un plan, la empresa se activa al verificar el pago y confirmar tu correo. Si eres empleado, acepta la invitación del equipo."}
              </p>
            </div>
          )}
        </section>
        {canAdd && (
          <aside className="card h-fit">
            <h2 className="mb-2 text-lg font-semibold">Un nuevo espacio</h2>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">
              Tendrás acceso como gerente y propietario. Los datos de cada
              empresa permanecen separados.
            </p>
            <CompanyForm
              requestId={randomUUID()}
              subscriptions={subscriptions.map(
                ({ id, plan, companies, company_limit, writable }) => ({
                  id,
                  plan,
                  companies,
                  company_limit,
                  writable,
                }),
              )}
            />
          </aside>
        )}
      </div>
    </main>
  );
}
