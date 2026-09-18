import { requireModule } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { InviteMember, RevokeInvitation } from "@/components/invitation-forms";
import { canAccess, type Membership } from "@/lib/modules";
import {
  CompanySettings,
  MemberPermissions,
} from "@/components/settings-forms";
export default async function Settings({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { db, company, member } = await requireModule(companyId, "config");
  const manager = ["owner", "admin"].includes(member.role);
  const { data, error } = manager
    ? await db
        .from("memberships")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at")
    : { data: [], error: null };
  if (error) throw new Error("Members unavailable");
  const { data: invitations, error: inviteError } = manager
    ? await db
        .from("company_invitations")
        .select("id,email,status,created_at,expires_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (inviteError) throw new Error("Invitaciones no disponibles");
  const renderedAt = new Date().getTime();
  const dates = new Intl.DateTimeFormat("es", {
    timeZone: company.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const states: Record<string, string> = {
    pending: "Pendiente",
    accepted: "Aceptada",
    declined: "Rechazada",
    revoked: "Revocada",
    expired: "Vencida",
  };
  return (
    <>
      <p className="eyebrow">Administración</p>
      <h1 className="page-title mt-3">Configuración</h1>
      <p className="mt-3 mb-7 text-sm text-muted-foreground">
        Ajusta tu espacio y define cómo participa cada persona.
      </p>
      <div className="mb-8 grid items-start gap-5 xl:grid-cols-2">
        <CompanySettings
          company={company}
          writable={canAccess(member, "config", "write")}
        />
        {manager && (
          <InviteMember companyId={companyId} requestId={randomUUID()} />
        )}
      </div>
      {manager && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Invitaciones recientes</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Últimas 100 invitaciones. Horario de {company.timezone}.
          </p>
          {invitations?.length ? (
            <div className="grid gap-3">
              {invitations.map((i) => {
                const expired = new Date(i.expires_at).getTime() <= renderedAt;
                return (
                  <div
                    key={i.id}
                    className="card flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold break-all">{i.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {i.status === "pending" && expired
                          ? "Vencida"
                          : states[i.status]}{" "}
                        · Vence {dates.format(new Date(i.expires_at))}
                      </p>
                    </div>
                    {i.status === "pending" && !expired && (
                      <RevokeInvitation companyId={companyId} id={i.id} />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay invitaciones.
            </p>
          )}
        </section>
      )}
      {manager && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Miembros y permisos</h2>
          <div className="grid gap-4">
            {(data as Membership[]).map((target) => (
              <MemberPermissions
                key={`${target.user_id}-${target.role}-${target.active}-${JSON.stringify(target.permissions)}`}
                companyId={companyId}
                target={target}
                actor={member}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
