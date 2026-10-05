import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { workforceScopeSchema } from "@/lib/workforce";
import { timeSummaryPeriods } from "@/lib/time-summary";
import {
  timeReviewFiltersSchema,
  timeReviewSchema,
} from "@/lib/workforce-time-approval";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { ListPagination } from "@/components/list-pagination";
import { WorkforceTimeApprovalForm } from "@/components/workforce-time-approval-form";
export default async function TimeReview({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companyId } = await params;
  const { db, company, member } = await requireModule(companyId, "horasfix");
  const { data: teamData, error: teamError } = await db.rpc("workforce_scope", {
    p_company: companyId,
  });
  if (teamError) throw new Error("No se pudo comprobar el alcance del equipo.");
  const team = workforceScopeSchema.parse(teamData);
  const manager = ["owner", "admin"].includes(member.role);
  if (!manager && team.role !== "FOREMAN") notFound();
  const search = await searchParams;
  const period = timeSummaryPeriods(company.timezone)[0];
  const parsed = timeReviewFiltersSchema.safeParse({
    from: search.from ?? period.from,
    to: search.to ?? period.to,
    worker: search.worker,
  });
  const page = Math.max(
    1,
    Math.min(100000, parseInt(String(search.page ?? "1")) || 1),
  );
  let report = null,
    error = "";
  if (!parsed.success) error = "Revisa las fechas y el trabajador.";
  else {
    const { data, error: failure } = await db.rpc("workforce_time_review", {
      p_company: companyId,
      p_from: parsed.data.from,
      p_to: parsed.data.to,
      p_worker: parsed.data.worker || null,
      p_page: page,
    });
    if (failure?.code === "42501") notFound();
    if (failure?.code === "22023")
      error = "Revisa el intervalo: el máximo es de 62 días transcurridos.";
    else if (failure)
      throw new Error("No se pudo cargar la revisión de turnos.");
    else {
      report = timeReviewSchema.parse(data);
      if (
        report.company !== companyId ||
        report.from !== parsed.data.from ||
        report.to !== parsed.data.to
      )
        throw new Error("Time review scope mismatch");
    }
  }
  const filters = parsed.success ? parsed.data : { ...period, worker: "" };
  const path = `/app/${companyId}/horas/equipo/revision`;
  return (
    <>
      <p className="eyebrow">Equipo · Horas</p>
      <h1 className="page-title mt-2">Revisión de turnos</h1>
      <p className="text-sm mt-2 text-muted-foreground">
        Consulta por fecha de entrada en {company.timezone}.
        {manager
          ? " Trabajadores activos de tu empresa."
          : " Solo tu equipo directo."}{" "}
        Al aprobar se conservan las horas registradas.
      </p>
      <nav className="flex flex-wrap gap-4 my-5">
        <Link className="underline" href={`/app/${companyId}/horas/equipo`}>
          Equipo y obras
        </Link>
        <Link
          className="underline"
          href={`/app/${companyId}/horas/equipo/resumen`}
        >
          Horas del equipo
        </Link>
        <Link className="underline" href={`/app/${companyId}/horas`}>
          Volver a Horas
        </Link>
      </nav>
      <form method="get" className="card flex flex-wrap gap-4 items-end mb-5">
        <label className="field">
          Desde
          <Input type="date" name="from" defaultValue={filters.from} required />
        </label>
        <label className="field">
          Hasta
          <Input type="date" name="to" defaultValue={filters.to} required />
        </label>
        <label className="field">
          Trabajador
          <select className="input" name="worker" defaultValue={filters.worker}>
            <option value="">Todos</option>
            {team.team
              .filter((w) => manager || w.id !== team.actor_id)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </label>
        <Button type="submit">Filtrar turnos</Button>
      </form>
      <Feedback error={error} />
      {report && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {report.rows.map((entry) => (
              <article className="card" key={entry.id}>
                <h2 className="font-semibold text-lg">{entry.worker_name}</h2>
                <p className="text-sm mt-1">{entry.project_name}</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 my-4 text-sm">
                  <dt>Entrada</dt>
                  <dd>{entry.starts_local}</dd>
                  <dt>Salida</dt>
                  <dd>{entry.ends_local ?? "Turno abierto"}</dd>
                  <dt>Tiempo neto</dt>
                  <dd>
                    {entry.minutes === null
                      ? "En curso"
                      : `${entry.minutes} min`}
                  </dd>
                  <dt>Estado</dt>
                  <dd>
                    {entry.status === "APROBADO" ? "Aprobado" : "Pendiente"}
                  </dd>
                </dl>
                {entry.open && (
                  <p className="text-sm">Cierra el turno antes de aprobarlo.</p>
                )}
                {entry.locked && <p className="text-sm">Semana cerrada.</p>}
                {entry.correction_pending && (
                  <p className="text-sm">
                    Corrección pendiente de revisión por un administrador.
                  </p>
                )}
                {entry.can_approve && entry.minutes !== null && (
                  <WorkforceTimeApprovalForm
                    company={companyId}
                    entry={entry.id}
                    version={entry.version}
                    minutes={entry.minutes}
                    request={randomUUID()}
                  />
                )}
              </article>
            ))}
          </div>
          {!report.rows.length && (
            <p className="card">No hay turnos disponibles en este intervalo.</p>
          )}
          <ListPagination
            path={path}
            page={report.page}
            count={report.count}
            query={{
              from: filters.from,
              to: filters.to,
              worker: filters.worker,
            }}
          />
        </>
      )}
    </>
  );
}
