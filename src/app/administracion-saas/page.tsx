import Link from "next/link";
import { randomUUID } from "node:crypto";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { requirePlatformAdministrator } from "@/lib/platform";
import { invitationMailConfig } from "@/lib/manager-mail";
import {
  InviteManager,
  ManagerInvitationControls,
  ManagerAccess,
} from "@/components/platform-forms";
export const dynamic = "force-dynamic";
export default async function PlatformAdministration() {
  const { db, user } = await requirePlatformAdministrator();
  const results = await Promise.all([
    db.rpc("platform_manager_overview"),
    db
      .from("manager_invitations")
      .select(
        "id,email,status,expires_at,manager_email_attempts(status,created_at)",
      )
      .order("created_at", { ascending: false })
      .order("created_at", {
        referencedTable: "manager_email_attempts",
        ascending: false,
      })
      .limit(1, { referencedTable: "manager_email_attempts" })
      .limit(100),
  ]);
  if (results.some((r) => r.error))
    throw new Error("No se pudo cargar la administración del SaaS.");
  const managers = (results[0].data ?? []) as {
    user_id: string;
    email: string;
    active: boolean;
    version: number;
    company_count: number;
  }[];
  const invitations = (results[1].data ?? []) as {
    id: string;
    email: string;
    status: string;
    expires_at: string;
    manager_email_attempts?: { status: string; created_at: string }[];
  }[];
  const mail = Boolean(invitationMailConfig(process.env));
  const dates = new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const now = new Date().getTime();
  const states: Record<string, string> = {
    pending: "Pendiente",
    accepted: "Aceptada",
    revoked: "Revocada",
    declined: "Rechazada",
    expired: "Vencida",
  };
  const delivery: Record<string, string> = {
    processing: "Envío iniciado",
    queued: "Aceptado por el servidor de correo",
    failed: "Correo no aceptado",
    unknown: "Resultado sin confirmar; comprueba la recepción",
  };
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/administracion-saas"
          className="text-2xl font-bold tracking-tight"
        >
          all decor<span className="text-primary">.</span>
        </Link>
        <form action={signOut}>
          <Button variant="ghost" size="sm">
            <LogOut size={14} />
            Cerrar sesión
          </Button>
        </form>
      </header>
      <p className="eyebrow mt-8">Administrador global</p>
      <h1 className="page-title mt-3">Administración del SaaS</h1>
      <p className="mt-3 mb-8 text-muted-foreground">
        Sesión de {user.email}. Invita y administra el acceso de los gerentes.
        Cada gerente crea sus empresas y gestiona sus usuarios, roles y
        permisos.
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <InviteManager requestId={randomUUID()} mailEnabled={mail} />
        <section
          className="grid content-start gap-3"
          aria-label="Invitaciones de gerentes"
        >
          <h2 className="text-lg font-semibold">Invitaciones recientes</h2>
          {invitations.length ? (
            invitations.map((i) => (
              <article
                className="card flex flex-wrap justify-between gap-4"
                key={i.id}
              >
                <div>
                  <p className="font-semibold break-all">{i.email}</p>
                  <p className="mt-2 text-sm">
                    {i.status === "pending" &&
                    new Date(i.expires_at).getTime() <= now
                      ? "Vencida"
                      : states[i.status]}{" "}
                    · Vence {dates.format(new Date(i.expires_at))} UTC
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {i.manager_email_attempts?.[0]
                      ? delivery[i.manager_email_attempts[0].status]
                      : "Sin intento de correo"}
                  </p>
                </div>
                {i.status === "pending" &&
                  new Date(i.expires_at).getTime() > now && (
                    <ManagerInvitationControls id={i.id} mailEnabled={mail} />
                  )}
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay invitaciones.
            </p>
          )}
        </section>
      </div>
      <section className="mt-10 grid gap-4">
        <h2 className="text-lg font-semibold">Gerentes</h2>
        {managers.length ? (
          managers.map((m) => (
            <article
              key={m.user_id}
              className="card flex flex-wrap justify-between gap-6"
            >
              <div>
                <h3 className="font-semibold break-all">{m.email}</h3>
                <p className="mt-2 text-sm">
                  {m.active ? "Activo" : "Suspendido"} · {m.company_count}{" "}
                  empresas
                </p>
              </div>
              <ManagerAccess
                id={m.user_id}
                version={m.version}
                active={m.active}
              />
            </article>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Los gerentes aparecerán cuando acepten la invitación.
          </p>
        )}
      </section>
    </main>
  );
}
