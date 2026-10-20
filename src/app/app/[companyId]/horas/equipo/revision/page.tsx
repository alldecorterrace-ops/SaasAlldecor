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
import { FieldTimeForm } from "@/components/field-time-form";
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
          ? " Trabajadores activos de tu empresa. Administración puede aplicar el horario solicitado o rechazarlo con motivo."
          : " Solo tu equipo directo. Revisa los minutos propuestos sin cambiar el horario registrado; la solicitud de horario sigue pendiente de Administración."}
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
                  <dt>Minutos vigentes</dt>
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
                {entry.correction_pending &&
                  !entry.field_needs_review &&
                  !entry.formal_pending && (
                    <p className="text-sm">
                      Corrección pendiente de revisión por un administrador.
                    </p>
                  )}
                {(entry.field_needs_review || entry.formal_pending) && (
                  <div className="border-t pt-4 space-y-4">
                    <p>
                      Campo · Propuestos: {entry.field_minutes ?? 0} min.
                      Vigentes: {entry.minutes ?? 0} min.
                    </p>
                    {entry.formal_pending && (
                      <p className="text-sm">
                        Horario solicitado pendiente de Administración.
                        {!entry.field_needs_review
                          ? " El Encargado ya revisó los minutos."
                          : ""}
                      </p>
                    )}
                    {manager && entry.field_in_local && (
                      <p className="text-sm">
                        Horario solicitado: {entry.field_in_local} →{" "}
                        {entry.field_out_local ?? "Sin salida solicitada"}
                      </p>
                    )}
                    {entry.can_approve_field && (
                      <FieldTimeForm
                        company={companyId}
                        review
                        label={
                          manager
                            ? "Aplicar propuesta de Campo"
                            : (entry.field_minutes ?? 0) > 0
                              ? `Aprobar ${entry.field_minutes} min propuestos`
                              : `Conservar ${entry.minutes ?? 0} min vigentes`
                        }
                      >
                        <input
                          type="hidden"
                          name="request"
                          value={randomUUID()}
                        />
                        <input type="hidden" name="entry" value={entry.id} />
                        <input
                          type="hidden"
                          name="version"
                          value={entry.version}
                        />
                        <input type="hidden" name="decision" value="approve" />
                        {manager && (
                          <label className="field md:col-span-2">
                            Nota de decisión
                            <Input name="note" maxLength={240} />
                          </label>
                        )}
                      </FieldTimeForm>
                    )}
                    {entry.can_reject_field && (
                      <FieldTimeForm
                        company={companyId}
                        review
                        label="Rechazar propuesta de Campo"
                      >
                        <input
                          type="hidden"
                          name="request"
                          value={randomUUID()}
                        />
                        <input type="hidden" name="entry" value={entry.id} />
                        <input
                          type="hidden"
                          name="version"
                          value={entry.version}
                        />
                        <input type="hidden" name="decision" value="reject" />
                        <label className="field md:col-span-2">
                          Motivo del rechazo
                          <Input name="note" maxLength={240} required />
                        </label>
                      </FieldTimeForm>
                    )}
                  </div>
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
