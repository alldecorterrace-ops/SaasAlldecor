import Link from "next/link";
import { loadCostRegister } from "@/lib/cost-register";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { expensePayers } from "@/lib/operations";
import { usd } from "@/lib/finance";
import {
  expenseSources,
  expenseFiltersSchema,
  registerStates,
} from "@/lib/expense-register";
import { EntitySelect } from "./entity-select";
import { ListPagination } from "./list-pagination";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export async function ExpenseRegister({
  companyId,
  search,
}: {
  companyId: string;
  search: Record<string, string | string[] | undefined>;
}) {
  const { db, member } = await requireModule(companyId, "gastos"),
    base = `/app/${companyId}/gastos`;
  const parsed = expenseFiltersSchema.safeParse(search);
  if (!parsed.success)
    return (
      <div className="space-y-4">
        <h1 className="page-title">Gastos</h1>
        <p role="alert">Revisa los filtros y el intervalo de fechas.</p>
        <Link href={base} className="underline">
          Limpiar filtros
        </Link>
      </div>
    );
  const filters = parsed.data,
    page = /^\d+$/.test(String(search.page ?? "1"))
      ? Math.max(1, Math.min(100000, Number(search.page ?? 1)))
      : 1;
  let result;
  try {
    result = await loadCostRegister(db, companyId, filters, page);
  } catch {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Gastos</h1>
        <p role="alert">
          No se pudo cargar el registro completo. Revisa tu acceso o reduce el
          intervalo de fechas; no se muestran totales parciales.
        </p>
        <Link href={base} className="underline">
          Limpiar filtros
        </Link>
      </div>
    );
  }
  const workers = canAccess(member, "trabajadores"),
    projects = canAccess(member, "fin-proyectos"),
    customers = projects && canAccess(member, "clientes");
  const selected = async (
    kind: "projects" | "customers" | "workers",
    id: string,
  ) => {
    if (!id) return null;
    const response = await db
      .from(kind)
      .select(kind === "customers" ? "id,name:full_name" : "id,name")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (response.error || !response.data)
      throw new Error("No se pudo cargar el filtro seleccionado.");
    return response.data as unknown as { id: string; name: string };
  };
  const [project, customer, worker] = await Promise.all([
    projects ? selected("projects", filters.project) : null,
    customers ? selected("customers", filters.customer) : null,
    workers ? selected("workers", filters.worker) : null,
  ]);
  const query = new URLSearchParams(filters).toString();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1 className="page-title mt-2">Gastos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gastos de administración, costos aprobados de Workforce y Labor
            calculada, según tus permisos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {result.count <= 5000 && (
            <Button asChild variant="outline">
              <a href={`/api/expenses/${companyId}/export?${query}`}>
                Exportar CSV
              </a>
            </Button>
          )}
          {["owner", "admin"].includes(member.role) && (
            <Button asChild variant="outline">
              <Link href={`${base}/lote`}>Registrar varios gastos</Link>
            </Button>
          )}
          {canAccess(member, "gastos", "write") && (
            <Button asChild>
              <Link href={`${base}/nuevo`}>Nuevo gasto</Link>
            </Button>
          )}
        </div>
      </div>
      {worker && (
        <p className="text-sm">
          Gastos asociados a {worker.name}.{" "}
          <Link
            className="underline"
            href={`/app/${companyId}/trabajadores/${worker.id}`}
          >
            Ver ficha del trabajador
          </Link>
        </p>
      )}
      {result.overview && (
        <section
          aria-label="Resumen de gastos de la empresa"
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Este mes", result.overview.monthly],
              ["Total activo", result.overview.active],
              ["Reembolsos pendientes", result.overview.reimbursements],
            ].map(([label, value]) => (
              <div className="panel p-4" key={label}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {usd(value)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Resumen de la empresa · Mes {result.overview.month}. Excluye
            anulados y no cambia con los filtros de la lista.
          </p>
        </section>
      )}
      <form
        action={base}
        className="panel grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label className="field">
          Buscar
          <Input
            name="q"
            defaultValue={filters.q}
            maxLength={100}
            placeholder="Fecha, categoría, documento o relación"
            aria-describedby="expense-search-help"
          />
          <span
            id="expense-search-help"
            className="text-xs text-muted-foreground"
          >
            Busca también por proveedor, descripción, cliente, proyecto y
            trabajador según tus permisos.
          </span>
        </label>
        <label className="field">
          Origen
          <select name="source" defaultValue={filters.source}>
            <option value="">Todos los orígenes disponibles</option>
            {Object.entries(expenseSources).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={filters.status}>
            {Object.entries(registerStates).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Categoría exacta
          <Input
            name="category"
            defaultValue={filters.category}
            maxLength={64}
            placeholder="Todas las categorías"
          />
        </label>
        <label className="field">
          Pagado por
          <select name="payer" defaultValue={filters.payer}>
            <option value="">Todos los pagadores</option>
            {Object.entries(expensePayers).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="SIN_REGISTRAR">Sin registrar</option>
          </select>
        </label>
        <label className="field">
          Desde
          <Input name="from" type="date" defaultValue={filters.from} />
        </label>
        <label className="field">
          Hasta
          <Input name="to" type="date" defaultValue={filters.to} />
        </label>
        {workers && (
          <EntitySelect
            key={`worker-${filters.worker}`}
            companyId={companyId}
            kind="workers"
            name="worker"
            label="Trabajador asociado"
            initial={worker}
            canSearch
            includeInactive
            emptyLabel="Todos los trabajadores"
          />
        )}
        {projects && (
          <EntitySelect
            key={`project-${filters.project}`}
            companyId={companyId}
            kind="projects"
            name="project"
            label="Proyecto"
            initial={project}
            canSearch
            emptyLabel="Todos los proyectos"
          />
        )}
        {customers && (
          <EntitySelect
            key={`customer-${filters.customer}`}
            companyId={companyId}
            kind="customers"
            name="customer"
            label="Cliente"
            initial={customer}
            canSearch
            emptyLabel="Todos los clientes"
          />
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Button type="submit">Aplicar filtros</Button>
          <Button asChild variant="outline">
            <Link href={base}>Limpiar filtros</Link>
          </Button>
        </div>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Total filtrado", result.total],
          ["Activos filtrados", result.active],
          ["Reembolsos pendientes filtrados", result.reimbursements],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {usd(value)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Los totales incluyen todos los resultados del filtro. Activos excluye
        anulados; no equivale a gastos aprobados ni pagados. El CSV conserva los
        centavos.
        {result.count > 5000 &&
          " Hay más de 5.000 resultados: reduce el intervalo o añade filtros para exportar."}
      </p>
      {!!result.workforce_unconfirmed &&
        Number(result.workforce_unconfirmed) > 0 && (
          <p className="panel p-4 text-sm">
            Costos filtrados de Workforce declarados de bolsillo propio:{" "}
            {usd(result.workforce_unconfirmed)}. El reembolso no tiene
            constancia registrada. Consulta los recibos y la revisión vigente en
            Reembolsos de trabajadores antes de registrar un pago ya realizado.
          </p>
        )}
      <p className="text-sm text-muted-foreground">
        Los costos de Workforce requieren ambas aprobaciones y se gestionan en
        su origen. No se crea una segunda ficha. Las constancias de reembolso se
        gestionan en Horas. Labor calculada no acredita pago y descuenta los
        costos anteriores conciliados.
      </p>
      {result.labor_complete === false && (
        <aside className="panel p-4 space-y-2" role="status">
          <strong>Labor pendiente de conciliación</strong>
          <p>
            Los importes conocidos no constituyen el costo completo de Labor.
            Revisa las incidencias y las correspondencias antes de cerrar los
            costos.
          </p>
          <ul className="list-disc pl-5">
            {result.labor_pending?.map((i, n) => (
              <li key={n}>
                {i.date} · {i.worker_name} · {i.project_name} · {i.reason}
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="space-y-3">
        {result.rows.length === 0 ? (
          <div className="panel p-6">No hay gastos con estos filtros.</div>
        ) : (
          result.rows.map((row) => (
            <article
              className="panel min-w-0 p-4"
              key={`${row.source}:${row.id}`}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={
                      row.source === "LABOR"
                        ? `/app/${companyId}/horas/labor`
                        : row.source === "WORKFORCE"
                          ? `/app/${companyId}/horas/gastos?expense=${row.id}#expense-${row.id}`
                          : `${base}/${row.id}`
                    }
                    className="font-semibold underline break-words"
                  >
                    {row.vendor ||
                      (row.source === "LABOR"
                        ? "Labor calculada"
                        : row.source === "WORKFORCE"
                          ? "Costo de Workforce"
                          : "Gasto sin proveedor")}
                  </Link>
                  <p className="text-sm">
                    {row.date} · {row.category} · {registerStates[row.status]}
                  </p>
                </div>
                <strong className="tabular-nums">{usd(row.amount)}</strong>
              </div>
              <p className="text-sm font-medium mt-2">
                Origen: {expenseSources[row.source]}
                {row.source === "WORKFORCE" && " · Gestionar en Workforce"}
              </p>
              <p className="mt-2 break-words text-sm">
                {row.description || "Sin descripción"}
                {row.document_number && ` · Documento: ${row.document_number}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {row.customer_id && (
                  <Link
                    className="underline break-words"
                    href={`/app/${companyId}/clientes/${row.customer_id}?section=gastos#expediente`}
                  >
                    {row.customer_name}
                  </Link>
                )}
                {row.project_id && (
                  <Link
                    className="underline break-words"
                    href={`/app/${companyId}/proyectos/${row.project_id}`}
                  >
                    {row.project_name}
                  </Link>
                )}
                <span>
                  {row.payer
                    ? expensePayers[row.payer]
                    : "Pagador sin registrar"}
                  {row.worker_id && row.worker_name && (
                    <>
                      {" "}
                      ·{" "}
                      <Link
                        className="underline break-words"
                        href={`/app/${companyId}/trabajadores/${row.worker_id}`}
                      >
                        {row.worker_name}
                      </Link>
                    </>
                  )}
                </span>
                <span>
                  {row.method === "COSTO_CALCULADO"
                    ? "Costo calculado · No acredita pago"
                    : row.method === "SIN_CONFIRMAR"
                      ? "Método sin confirmar"
                      : row.method}{" "}
                  · {row.has_receipt ? "Con comprobante" : "Sin comprobante"}
                </span>
              </div>
            </article>
          ))
        )}
      </div>
      <ListPagination
        path={base}
        page={result.page}
        count={result.count}
        query={filters}
      />
    </div>
  );
}
