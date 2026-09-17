import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { expenseStatuses } from "@/lib/operations";
import { usd } from "@/lib/finance";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ListPagination } from "./list-pagination";
export async function OperationList({
  companyId,
  kind,
  search,
}: {
  companyId: string;
  kind: "workers" | "expenses";
  search: { q?: string; status?: string; page?: string };
}) {
  const workers = kind === "workers",
    moduleId = workers ? "trabajadores" : "gastos",
    { db, member } = await requireModule(companyId, moduleId),
    q = (search.q ?? "").trim().slice(0, 100),
    options = workers
      ? { active: "Activos", inactive: "Inactivos" }
      : expenseStatuses,
    status = Object.hasOwn(options, search.status ?? "") ? search.status! : "",
    page = Math.max(1, Math.min(100000, parseInt(search.page ?? "1") || 1)),
    base = `/app/${companyId}/${moduleId}`;
  let query = db
    .from(kind)
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .order(workers ? "name" : "expense_date", { ascending: workers })
    .order("id");
  if (q)
    query = query.ilike(
      workers ? "name" : "vendor",
      `%${q.replace(/[\\%_]/g, "\\$&")}%`,
    );
  if (status)
    query = workers
      ? query.eq("active", status === "active")
      : query.eq("status", status);
  const { data, count, error } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudieron cargar los registros.");
  return (
    <>
      <div className="flex flex-wrap justify-between gap-4 mb-7">
        <div>
          <p className="eyebrow">{workers ? "Equipo" : "Finanzas"}</p>
          <h1 className="page-title mt-2">
            {workers ? "Trabajadores" : "Gastos"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {workers
              ? "Fichas operativas del equipo. Crear un trabajador no concede acceso a la aplicación."
              : "Fechas, importes, recibos y revisión de gastos con historial conservado."}
          </p>
        </div>
        {canAccess(member, moduleId, "write") && (
          <Button asChild>
            <Link href={`${base}/nuevo`}>
              {workers ? "Nuevo trabajador" : "Nuevo gasto"}
            </Link>
          </Button>
        )}
      </div>
      <form className="card mb-5 flex flex-wrap gap-4 items-end">
        <label className="field grow">
          {workers ? "Nombre" : "Comercio o proveedor"}
          <Input name="q" defaultValue={q} />
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={status}>
            <option value="">Todos</option>
            {Object.entries(options).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Button>Filtrar</Button>
      </form>
      <div className="card overflow-x-auto">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                {(workers
                  ? ["Nombre", "Equipo / puesto", "Contacto", "Estado"]
                  : ["Fecha / proveedor", "Categoría", "Importe", "Revisión"]
                ).map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  {workers ? (
                    <>
                      <td>
                        <Link
                          className="text-primary font-semibold"
                          href={`${base}/${r.id}`}
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td>
                        {r.team}
                        <p>{r.job_title}</p>
                      </td>
                      <td>
                        {r.email}
                        <p>{r.phone}</p>
                      </td>
                      <td>{r.active ? "Activo" : "Inactivo"}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        <Link
                          className="text-primary font-semibold"
                          href={`${base}/${r.id}`}
                        >
                          {r.expense_date} · {r.vendor || "Sin proveedor"}
                        </Link>
                        <p className="text-sm">{r.document_number}</p>
                      </td>
                      <td>{r.category}</td>
                      <td>{usd(r.amount)}</td>
                      <td>
                        {
                          expenseStatuses[
                            r.status as keyof typeof expenseStatuses
                          ]
                        }
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No hay registros en esta vista.</p>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ q, status }}
      />
    </>
  );
}
