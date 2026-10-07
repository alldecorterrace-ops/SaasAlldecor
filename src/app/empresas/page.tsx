import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Building2, ArrowUpRight, LogOut } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { CompanyForm } from "@/components/company-form";
import { Button } from "@/components/ui/button";
import { platformContext } from "@/lib/platform";
import { IncomingManagerInvitation } from "@/components/platform-forms";
import { IncomingInvitation } from "@/components/invitation-forms";
export const dynamic = "force-dynamic";
export default async function Companies() {
  const { db, user, platform } = await platformContext();
  const { data: managerInvitations, error: managerInvitationError } =
    await db.rpc("my_manager_invitations");
  if (managerInvitationError)
    throw new Error("Invitaciones de gerente no disponibles");
  const { data, error } = await db
    .from("companies")
    .select("id,name,timezone")
    .order("name");
  if (error) throw new Error("Companies unavailable");
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
        <Link href="/empresas" className="text-2xl font-bold tracking-tight">
          all decor<span className="text-primary">.</span>
        </Link>
        <form action={signOut}>
          <Button variant="ghost" size="sm">
            <LogOut size={14} />
            Cerrar sesión
          </Button>
        </form>
      </header>
      <div className="mt-16 mb-8">
        <p className="eyebrow">Espacios de trabajo</p>
        <h1 className="page-title mt-3">Tus empresas</h1>
        <p className="mt-3 text-muted-foreground">
          Selecciona dónde quieres trabajar. Sesión de {user.email}.
        </p>
      </div>
      {platform?.role === "administrator" && platform.active && (
        <Link
          href="/administracion-saas"
          className="card mb-8 block font-semibold text-primary"
        >
          Administración del SaaS · Gerentes y empresas
        </Link>
      )}
      {platform && !platform.active && (
        <p role="status" className="card mb-8">
          Tu acceso al SaaS está suspendido. Contacta al administrador global.
        </p>
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
              <h2 className="font-semibold">Tu primera empresa empieza aquí</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Acepta una invitación de gerente para crear tus empresas, o pide
                al gerente de tu empresa que te invite al equipo.
              </p>
            </div>
          )}
        </section>
        {platform?.can_create_company && (
          <aside className="card h-fit">
            <h2 className="mb-2 text-lg font-semibold">Un nuevo espacio</h2>
            <p className="mb-6 text-sm leading-6 text-muted-foreground">
              Tendrás acceso como gerente y propietario. Los datos de cada
              empresa permanecen separados.
            </p>
            <CompanyForm requestId={randomUUID()} />
          </aside>
        )}
      </div>
    </main>
  );
}
