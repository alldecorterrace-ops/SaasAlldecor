import { requireModule } from "@/lib/auth";
import { canAccess, type Membership } from "@/lib/modules";
import {
  CompanySettings,
  AddMember,
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
        {manager && <AddMember companyId={companyId} />}
      </div>
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
