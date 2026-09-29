import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { expensePayers } from "@/lib/operations";
import { usd } from "@/lib/finance";
import {
  expenseFiltersSchema,
  expenseRegisterSchema,
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
  const { data, error } = await db.rpc("expense_register", {
    p_company: companyId,
    p_filters: filters,
    p_page: page,
    p_export: false,
  });
  if (error)
    return (
      <div className="space-y-4">
        <h1 className="page-title">Gastos</h1>
        <p role="alert">
          No se pudo cargar el registro. Revisa tu acceso y vuelve a intentarlo.
        </p>
        <Link href={base} className="underline">
          Limpiar filtros
        </Link>
      </div>
    );
  const result = expenseRegisterSchema.parse(data);
  const projects = canAccess(member, "fin-proyectos"),
    customers = projects && canAccess(member, "clientes");
  const selected = async (kind: "projects" | "customers", id: string) => {
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
  const [project, customer] = await Promise.all([
    projects ? selected("projects", filters.project) : null,
    customers ? selected("customers", filters.customer) : null,
  ]);
  const query = new URLSearchParams(filters).toString();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1 className="page-title mt-2">Gastos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Registro de gastos de la empresa y sus proyectos.
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
            placeholder="Proveedor, descripciÃ³n o documento"
          />
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
          CategorÃ­a exacta
          <Input
            name="category"
            defaultValue={filters.category}
            maxLength={64}
            placeholder="Todas las categorÃ­as"
          />
        </label>
        <label className="field">
          Desde
          <Input name="from" type="date" defaultValue={filters.from} />
        </label>
        <label className="field">
          Hasta
          <Input name="to" type="date" defaultValue={filters.to} />
        </label>
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
          " Hay mÃ¡s de 5.000 resultados: reduce el intervalo o aÃ±ade filtros para exportar."}
      </p>
      <div className="space-y-3">
        {result.rows.length === 0 ? (
          <div className="panel p-6">No hay gastos con estos filtros.</div>
        ) : (
          result.rows.map((row) => (
            <article className="panel min-w-0 p-4" key={row.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`${base}/${row.id}`}
                    className="font-semibold underline break-words"
                  >
                    {row.vendor || "Gasto sin proveedor"}
                  </Link>
                  <p className="text-sm">
                    {row.date} Â· {row.category} Â· {registerStates[row.status]}
                  </p>
                </div>
                <strong className="tabular-nums">{usd(row.amount)}</strong>
              </div>
              <p className="mt-2 break-words text-sm">
                {row.description || "Sin descripciÃ³n"}
                {row.document_number && ` Â· Documento: ${row.document_number}`}
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
                  {row.worker_name && ` Â· ${row.worker_name}`}
                </span>
                <span>
                  {row.method} Â·{" "}
                  {row.has_receipt ? "Con comprobante" : "Sin comprobante"}
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
