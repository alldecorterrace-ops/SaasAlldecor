import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { TimeForm } from "@/components/time-form";
import { EntitySelect } from "@/components/entity-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/list-pagination";
export default async function Hours({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ page?: string; view?: string; status?: string }>;
}) {
  const { companyId } = await params,
    { db, member, company } = await requireModule(companyId, "horasfix"),
    search = await searchParams,
    manager = ["owner", "admin"].includes(member.role),
    view = (manager ? ["requests", "periods"] : ["requests"]).includes(
      search.view ?? "",
    )
      ? search.view!
      : "entries",
    write = canAccess(member, "horasfix", "write"),
    base = `/app/${companyId}/horas`,
    page = Math.max(1, Math.min(100000, parseInt(search.page ?? "1") || 1));
  const { data: own, error: ownError } = await db.rpc("my_time_worker", {
    p_company: companyId,
  });
  if (ownError) throw new Error("No se pudo comprobar tu ficha.");
  const mine = own?.[0];
  const current = mine
    ? await db
        .from("time_entries")
        .select("id,starts_at,version")
        .eq("company_id", companyId)
        .eq("worker_id", mine.id)
        .neq("status", "ANULADO")
        .is("ends_at", null)
        .maybeSingle()
    : { data: null, error: null };
  if (current.error) throw new Error("No se pudo consultar tu marcación.");
  const statuses =
      view === "requests"
        ? {
            PENDIENTE: "Pendiente",
            APROBADA: "Aprobada",
            RECHAZADA: "Rechazada",
          }
        : view === "entries"
          ? { PENDIENTE: "Pendiente", APROBADO: "Aprobado", ANULADO: "Anulado" }
          : {},
    status = Object.hasOwn(statuses, search.status ?? "") ? search.status! : "";
  let query = db
    .from(
      view === "entries"
        ? "time_entries"
        : view === "requests"
          ? "time_requests"
          : "time_periods",
    )
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .order(
      view === "entries"
        ? "starts_at"
        : view === "periods"
          ? "week_start"
          : "created_at",
      { ascending: false },
    )
    .order("id");
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudieron cargar las horas.");
  const workerNames = new Map<string, string>();
  if (view === "entries" && data?.length && canAccess(member, "trabajadores")) {
    const ids = [...new Set(data.map((r) => r.worker_id))];
    const workers = await db
      .from("workers")
      .select("id,name")
      .eq("company_id", companyId)
      .in("id", ids);
    if (workers.error)
      throw new Error("No se pudieron cargar los trabajadores.");
    workers.data?.forEach((w) => workerNames.set(w.id, w.name));
  }
  if (mine) workerNames.set(mine.id, mine.name);
  const format = new Intl.DateTimeFormat("es", {
    timeZone: company.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <>
      <div className="flex flex-wrap justify-between gap-4 mb-7">
        <div>
          <p className="eyebrow">Equipo</p>
          <h1 className="page-title mt-2">Horas y solicitudes</h1>
          <p className="text-sm mt-2 text-muted-foreground">
            Marcaciones, descansos y correcciones con historial. Horario de
            consulta: {company.timezone}.
            {!manager && " Solo se muestran tus marcaciones y solicitudes."}
          </p>
        </div>
        {manager && (
          <Button asChild>
            <Link href={`${base}/nuevo`}>Registrar horas</Link>
          </Button>
        )}
      </div>
      {write && (
        <section className="card mb-6">
          <h2 className="font-semibold text-xl mb-3">Mi jornada</h2>
          {mine ? (
            <>
              <p className="mb-4">
                {mine.name}
                {current.data
                  ? ` · Entrada: ${format.format(new Date(current.data.starts_at))}`
                  : " · Sin jornada abierta"}
              </p>
              <TimeForm
                key={`${current.data?.id ?? "new"}:${current.data?.version ?? 0}`}
                companyId={companyId}
                operation="punch"
                label={current.data ? "Marcar salida" : "Marcar entrada"}
              >
                <input
                  type="hidden"
                  name="id"
                  value={current.data?.id ?? randomUUID()}
                />
                <input
                  type="hidden"
                  name="action"
                  value={current.data ? "OUT" : "IN"}
                />
                {!current.data && (
                  <EntitySelect
                    companyId={companyId}
                    kind="projects"
                    name="project_id"
                    label="Proyecto"
                    initial={null}
                    canSearch={canAccess(member, "fin-proyectos")}
                  />
                )}
              </TimeForm>
            </>
          ) : (
            <p>
              Tu cuenta todavía no está vinculada a un trabajador activo. Un
              administrador puede vincularla desde la ficha de Trabajadores.
            </p>
          )}
        </section>
      )}
      <nav className="flex flex-wrap gap-5 mb-5">
        <Link className="underline" href={base}>
          Marcaciones
        </Link>
        <Link className="underline" href={`${base}?view=requests`}>
          Solicitudes
        </Link>
        {manager && (
          <Link className="underline" href={`${base}?view=periods`}>
            Cierre de semanas
          </Link>
        )}
      </nav>
      {view !== "periods" && (
        <form className="card flex gap-4 items-end mb-5">
          <input type="hidden" name="view" value={view} />
          <label className="field">
            Estado
            <select name="status" defaultValue={status}>
              <option value="">Todos</option>
              {Object.entries(statuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <Button>Filtrar</Button>
        </form>
      )}
      {view === "periods" && manager && (
        <section className="card mb-5">
          <h2 className="font-semibold mb-3">Cerrar o reabrir una semana</h2>
          <p className="text-sm mb-4">
            Cerrar requiere todas las marcaciones aprobadas, sin jornadas
            abiertas ni solicitudes pendientes. Un cierre bloquea correcciones
            en esa semana.
          </p>
          <TimeForm
            companyId={companyId}
            operation="period"
            label="Registrar cierre / reapertura"
          >
            <label className="field">
              Lunes de la semana
              <Input name="week_start" type="date" required />
            </label>
            <label className="field">
              Acción
              <select name="locked">
                <option value="true">Cerrar</option>
                <option value="false">Reabrir</option>
              </select>
            </label>
            <label className="field md:col-span-2">
              Motivo
              <Input name="reason" required minLength={3} maxLength={2000} />
            </label>
          </TimeForm>
        </section>
      )}
      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              {(view === "entries"
                ? ["Trabajador", "Entrada / salida", "Tiempo neto", "Estado"]
                : view === "requests"
                  ? ["Solicitud", "Horario propuesto", "Estado", "Motivo"]
                  : ["Semana", "Estado", "Motivo", "Historial"]
              ).map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id}>
                {view === "entries" ? (
                  <>
                    <td>
                      <Link
                        className="text-primary font-semibold"
                        href={`${base}/${r.id}`}
                      >
                        {workerNames.get(r.worker_id) ?? "Trabajador vinculado"}
                      </Link>
                    </td>
                    <td>
                      {format.format(new Date(r.starts_at))}
                      <p>
                        {r.ends_at
                          ? format.format(new Date(r.ends_at))
                          : "Jornada abierta"}
                      </p>
                    </td>
                    <td>
                      {r.minutes === null
                        ? "—"
                        : `${Math.floor(r.minutes / 60)} h ${r.minutes % 60} min`}
                      <p className="text-xs">Descanso: {r.break_minutes} min</p>
                    </td>
                    <td>{r.status}</td>
                  </>
                ) : view === "requests" ? (
                  <>
                    <td>
                      <Link
                        className="underline"
                        href={`${base}/${r.entry_id}`}
                      >
                        Abrir marcación
                      </Link>
                    </td>
                    <td>
                      {format.format(new Date(r.starts_at))}
                      <p>{format.format(new Date(r.ends_at))}</p>
                    </td>
                    <td>{r.status}</td>
                    <td>
                      {r.reason}
                      <p>{r.decision_note}</p>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{r.week_start}</td>
                    <td>{r.locked ? "Cerrada" : "Abierta"}</td>
                    <td>{r.reason}</td>
                    <td>
                      <Link
                        className="underline"
                        href={`/app/${companyId}/historial/time_periods/${r.id}`}
                      >
                        Ver cambios
                      </Link>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && (
          <p className="p-6 text-center">No hay registros en esta vista.</p>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ view, status }}
      />
    </>
  );
}
