import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { workforceRoles, workforceScopeSchema } from "@/lib/workforce";
export default async function Team({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "horasfix");
  const { data, error } = await db.rpc("workforce_scope", {
    p_company: companyId,
  });
  if (error) throw new Error("No se pudo consultar el equipo y las obras.");
  const scope = workforceScopeSchema.parse(data),
    manager = ["owner", "admin"].includes(member.role);
  return (
    <>
      <p className="eyebrow">Equipo</p>
      <h1 className="page-title mt-2">Equipo y obras</h1>
      <nav className="flex flex-wrap gap-5 my-5">
        {(manager || scope.role === "FOREMAN") && (
          <Link
            className="underline"
            href={`/app/${companyId}/horas/equipo/revision`}
          >
            Revisar turnos
          </Link>
        )}
        {scope.role && (
          <Link
            className="underline"
            href={`/app/${companyId}/horas/equipo/resumen`}
          >
            {scope.role === "WORKER"
              ? "Mis días trabajados"
              : "Horas del equipo"}
          </Link>
        )}
        <Link className="underline" href={`/app/${companyId}/horas/gastos`}>
          Gastos de Workforce
        </Link>
        <Link href={`/app/${companyId}/horas`} className="underline">
          Volver a Horas
        </Link>
        {manager && (
          <Link href={`/app/${companyId}/trabajadores`} className="underline">
            Gestionar trabajadores
          </Link>
        )}
      </nav>
      {!scope.role ? (
        <p className="card">
          Tu cuenta necesita estar vinculada a un trabajador activo con perfil
          de equipo. Solicita la vinculación a un administrador.
        </p>
      ) : (
        <>
          <p className="mb-5">
            Rol: {workforceRoles[scope.role]}.{" "}
            {scope.role === "FOREMAN"
              ? "Puedes consultar tu equipo directo y tus propias obras vigentes."
              : scope.role === "WORKER"
                ? "Puedes consultar tu perfil y tus obras vigentes."
                : "Puedes consultar los perfiles de equipo y las obras activas."}
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card">
              <h2 className="text-xl font-semibold mb-4">Equipo disponible</h2>
              {scope.team.length ? (
                <ul className="divide-y">
                  {scope.team.map((w) => (
                    <li className="py-3" key={w.id}>
                      <strong>{w.name}</strong>
                      <p className="text-sm text-muted-foreground">
                        {workforceRoles[w.role]}
                        {w.id === scope.actor_id ? " · Tu perfil" : ""}
                      </p>
                      {manager && (
                        <Link
                          className="underline text-sm"
                          href={`/app/${companyId}/trabajadores/${w.id}/equipo`}
                        >
                          Gestionar equipo y asignaciones
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Sin perfiles de equipo disponibles.</p>
              )}
            </section>
            <section className="card">
              <h2 className="text-xl font-semibold mb-4">
                Obras disponibles ahora
              </h2>
              {scope.projects.length ? (
                <ul className="divide-y">
                  {scope.projects.map((p) => (
                    <li key={p.id} className="py-3">
                      {p.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Sin obras vigentes asignadas.</p>
              )}
              <p className="text-sm text-muted-foreground mt-5">
                Las obras finalizadas o canceladas no están disponibles para
                nuevas operaciones.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
