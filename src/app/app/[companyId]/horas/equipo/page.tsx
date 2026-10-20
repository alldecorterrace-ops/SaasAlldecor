import Link from "next/link";
import { randomUUID } from "node:crypto";
import { canAccess } from "@/lib/modules";
import { workforceProjectChoicesContextSchema } from "@/lib/workforce-project-choice";
import { WorkforceProjectChoiceForm } from "@/components/workforce-project-choice-form";
import { requireModule } from "@/lib/auth";
import { workforceRoles, workforceScopeSchema } from "@/lib/workforce";
export default async function Team({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{updated?:string}>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "horasfix");
  const { data, error } = await db.rpc("workforce_scope", {
    p_company: companyId,
  });
  if (error) throw new Error("No se pudo consultar el equipo y las obras.");
  const scope = workforceScopeSchema.parse(data),
    manager = ["owner", "admin"].includes(member.role);
  const search=await searchParams;
  const canChoose=canAccess(member,"horasfix","write")&&(manager||scope.role==="FOREMAN");
  const choices=canChoose?await db.rpc("workforce_project_choices_context",{p_company:companyId}):null;
  if(choices?.error) throw new Error("No se pudieron cargar las obras actuales del equipo.");
  const choiceContext=choices?workforceProjectChoicesContextSchema.parse(choices.data):null;
  return (
    <>
      <p className="eyebrow">Equipo</p>
      <h1 className="page-title mt-2">Equipo y obras</h1>
      {search.updated==="project"&&<p role="status" className="card my-4">Obra actual guardada.</p>}
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
                      {choiceContext?.workers.some(c=>c.id===w.id)&&(()=>{const choice=choiceContext.workers.find(c=>c.id===w.id)!;return <><p className="text-sm mt-2">Obra actual: {choice.project_name??"Sin obra actual"}</p><WorkforceProjectChoiceForm key={`${choice.id}:${choice.version}`} companyId={companyId} request={randomUUID()} worker={choice} projects={choiceContext.projects}/></>;})()}
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
