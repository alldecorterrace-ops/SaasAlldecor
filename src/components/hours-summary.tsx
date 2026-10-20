import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workforceRoles, workforceScopeSchema } from "@/lib/workforce";
import { ListPagination } from "@/components/list-pagination";
import {
  loadTimeSummary,
  timeSummaryFiltersSchema,
  timeSummaryPeriods,
  type TimeSummary,
  type TimeSummaryScope,
} from "@/lib/time-summary";

export async function HoursSummary({
  params,
  searchParams,
  scope = "personal",
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  scope?: TimeSummaryScope;
}) {
  const { companyId } = await params;
  const { db, company, member } = await requireModule(companyId, "horasfix");
  const { data: teamData, error: teamError } = await db.rpc("workforce_scope", {
    p_company: companyId,
  });
  if (teamError) throw new Error("No se pudo comprobar el alcance del equipo.");
  const workforce = workforceScopeSchema.parse(teamData);
  const hasTeamReport = ["ADMIN", "FOREMAN", "OFFICE"].includes(
    workforce.role ?? "",
  );
  const visibility =
    scope === "team"
      ? workforce.role === "FOREMAN"
        ? " Tu perfil y tu equipo directo."
        : workforce.role === "WORKER"
          ? " Solo se muestran tus horas."
          : workforce.role === "OFFICE"
            ? " Perfiles activos de tu empresa."
            : workforce.role === "ADMIN"
              ? " Trabajadores activos de tu empresa."
              : " Sin perfil de equipo activo."
      : !["owner", "admin"].includes(member.role)
        ? " Solo se muestran tus horas."
        : "";
  const search = await searchParams;
  const periods = timeSummaryPeriods(company.timezone);
  const parsed = timeSummaryFiltersSchema.safeParse({
    from: search.from ?? periods[0].from,
    to: search.to ?? periods[0].to,
    project: search.project,
    worker: search.worker,
  });
  const page = Math.max(
    1,
    Math.min(100000, parseInt(String(search.page ?? "1")) || 1),
  );
  let report: TimeSummary | null = null,
    error = "";
  if (!parsed.success) error = "Revisa las fechas y los filtros.";
  else {
    try {
      report = await loadTimeSummary(db, companyId, parsed.data, page, scope);
    } catch (failure) {
      if ((failure as { code?: string }).code === "22023")
        error = "Revisa el intervalo: el máximo es de 62 días transcurridos.";
      else throw new Error("No se pudo cargar el resumen de horas.");
    }
  }
  const base = `/app/${companyId}/horas/${scope === "team" ? "equipo/resumen" : "resumen"}`;
  const filters = parsed.success
    ? parsed.data
    : { ...periods[0], project: "", worker: "" };
  const query = {
    from: filters.from,
    to: filters.to,
    project: filters.project,
    worker: filters.worker,
  };
  const hours = (seconds: number) =>
    (seconds / 3600).toLocaleString("es", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Equipo · Horas</p>
        <h1 className="page-title mt-2">
          {scope === "team"
            ? "Horas del equipo"
            : "Días trabajados por proyecto"}
        </h1>
        <p className="text-sm mt-2 text-muted-foreground">
          Consulta por fecha de entrada en {company.timezone}.{visibility}
          {scope === "team" &&
            workforce.role &&
            ` Perfil: ${workforceRoles[workforce.role]}.`}
        </p>
      </div>
      <nav className="flex flex-wrap gap-4 mb-5">
        <Link className="underline" href={`/app/${companyId}/horas`}>
          Volver a marcaciones
        </Link>
        {scope === "team" ? (
          <>
            <Link className="underline" href={`/app/${companyId}/horas/equipo`}>
              Equipo y obras
            </Link>
            <Link
              className="underline"
              href={`/app/${companyId}/horas/resumen?${new URLSearchParams(query)}`}
            >
              Resumen propio
            </Link>
          </>
        ) : (
          hasTeamReport && (
            <Link
              className="underline"
              href={`/app/${companyId}/horas/equipo/resumen?${new URLSearchParams(query)}`}
            >
              Horas del equipo
            </Link>
          )
        )}
        {periods.map((p) => (
          <Link
            key={p.label}
            className="underline"
            href={`${base}?${new URLSearchParams({ ...query, from: p.from, to: p.to })}`}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <form
        key={new URLSearchParams(query).toString()}
        className="card mb-6 flex flex-wrap items-end gap-4"
        action={base}
      >
        <label className="grid gap-2 text-sm">
          Desde
          <Input name="from" type="date" required defaultValue={filters.from} />
        </label>
        <label className="grid gap-2 text-sm">
          Hasta
          <Input name="to" type="date" required defaultValue={filters.to} />
        </label>
        <label className="grid gap-2 text-sm">
          Proyecto
          <select
            name="project"
            defaultValue={filters.project}
            className="rounded-md border bg-background px-3 py-2"
          >
            <option value="">Todos los proyectos</option>
            {filters.project &&
              !report?.options.projects.some(
                (p) => p.name === filters.project,
              ) && (
                <option value={filters.project}>
                  Proyecto seleccionado sin horas visibles
                </option>
              )}
            {report?.options.projects.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          Trabajador
          <select
            name="worker"
            defaultValue={filters.worker}
            className="rounded-md border bg-background px-3 py-2"
          >
            <option value="">Todos los visibles</option>
            {filters.worker &&
              !report?.options.workers.some((w) => w.id === filters.worker) && (
                <option value={filters.worker}>
                  Trabajador seleccionado sin horas visibles
                </option>
              )}
            {report?.options.workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Consultar</Button>
        <Link className="underline text-sm" href={base}>
          Restablecer
        </Link>
      </form>
      {error && (
        <p role="alert" className="card mb-6">
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-5">
            <div className="card">
              <p className="text-sm text-muted-foreground">Días trabajados</p>
              <p className="text-2xl font-semibold">{report.totals.days}</p>
            </div>
            <div className="card">
              <p className="text-sm text-muted-foreground">
                Horas del intervalo
              </p>
              <p className="text-2xl font-semibold">
                {hours(report.totals.seconds)} h
              </p>
            </div>
            <div className="card">
              <p className="text-sm text-muted-foreground">Trabajadores</p>
              <p className="text-2xl font-semibold">{report.totals.workers}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Cada fecha con tiempo positivo cuenta una vez por trabajador. Si se
            trabajó en dos proyectos el mismo día, ese día aparece en ambos
            proyectos.
            {report.totals.open > 0 &&
              ` Hay ${report.totals.open} marcaciones abiertas; sus horas son provisionales al consultar.`}
          </p>
          <section className="card mb-6 min-w-0">
            <h2 className="font-semibold text-xl mb-4">Horas por trabajador</h2>
            {!report.rows.length ? (
              <p>Sin horas en el intervalo y los filtros seleccionados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left p-3">Trabajador</th>
                      <th className="text-left p-3 whitespace-nowrap">
                        Días trabajados
                      </th>
                      <th className="text-left p-3 min-w-48">
                        Días por proyecto
                      </th>
                      {report.dates.map((d) => (
                        <th key={d} className="p-3 whitespace-nowrap" title={d}>
                          {shortDate(d)}
                        </th>
                      ))}
                      <th className="p-3 whitespace-nowrap">Total horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((w) => (
                      <tr key={w.id} className="border-t align-top">
                        <td className="p-3 whitespace-nowrap font-medium">
                          {w.name}
                        </td>
                        <td className="p-3 text-center">{w.days}</td>
                        <td className="p-3">
                          {w.projects.map((p) => (
                            <div key={p.name}>
                              {p.name}: {p.days} · {hours(p.seconds)} h
                            </div>
                          ))}
                        </td>
                        {report.dates.map((d) => {
                          const entry = w.daily.find((a) => a.date === d);
                          return (
                            <td key={d} className="p-3 text-center min-w-28">
                              {entry ? (
                                <>
                                  <span className="whitespace-nowrap">
                                    {hours(entry.seconds)} h
                                  </span>
                                  <div className="text-xs text-muted-foreground">
                                    {entry.projects
                                      .map((p) => p.name)
                                      .join(" · ")}
                                  </div>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 text-center font-semibold whitespace-nowrap">
                          {hours(w.seconds)} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ListPagination
              path={base}
              page={report.page}
              count={report.count}
              query={query}
            />
          </section>
          <section className="card min-w-0">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
              <h2 className="font-semibold text-xl">
                Resumen de días por proyecto
              </h2>
              <Button asChild variant="outline">
                <a
                  href={`/api/hours/${companyId}/${scope === "team" ? "team-summary" : "summary"}?${new URLSearchParams(query)}`}
                >
                  Exportar resumen de días
                </a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Días son fechas distintas del proyecto. Días-trabajador suman un
              día por cada trabajador y fecha. El resumen incluye todo el
              intervalo, aunque la tabla tenga varias páginas.
            </p>
            {!report.projects.length ? (
              <p>Sin días trabajados para resumir.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {[
                        "Proyecto",
                        "Días",
                        "Días-trabajador",
                        "Trabajadores",
                        "Horas",
                      ].map((label) => (
                        <th
                          key={label}
                          className="text-left p-3 whitespace-nowrap"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.projects.map((p) => (
                      <tr key={p.name} className="border-t">
                        <td className="p-3">{p.name}</td>
                        <td className="p-3">{p.days}</td>
                        <td className="p-3">{p.worker_days}</td>
                        <td className="p-3">{p.workers}</td>
                        <td className="p-3 whitespace-nowrap">
                          {hours(p.seconds)} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
