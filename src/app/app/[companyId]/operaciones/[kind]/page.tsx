import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { workspaceKind, workspaces } from "@/lib/workspaces";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/list-pagination";
import { ZonesMap } from "@/components/zones-map";
import { permitDateError } from "@/lib/permit-filters";
type WorkListRow = {
  id: string;
  name: string;
  status: string;
  version: number;
  stock: string | number;
  data: Record<string, string>;
  updated_at: string;
};
export default async function WorkspaceList({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; kind: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { companyId, kind } = await params,
    k = workspaceKind(kind);
  if (!k) notFound();
  const cfg = workspaces[k],
    { db, member, company } = await requireModule(companyId, cfg.module),
    search = await searchParams;
  const q = (search.q ?? "").trim().slice(0, 100),
    status = Object.hasOwn(cfg.statuses, search.status ?? "")
      ? search.status!
      : "",
    page = Math.max(1, Math.min(100000, parseInt(search.page ?? "1") || 1)),
    base = `/app/${companyId}/operaciones/${k}`,
    from = k === "permits" ? (search.from ?? "") : "",
    to = k === "permits" ? (search.to ?? "") : "",
    filterError = k === "permits" ? permitDateError(from, to) : null;
  let query = (
    k === "permits"
      ? db.rpc(
          "search_permits",
          {
            p_company: companyId,
            p_query: q,
            p_status: status,
            p_from: filterError ? null : from || null,
            p_to: filterError ? null : to || null,
          },
          { count: "exact" },
        )
      : db
          .from("work_records")
          .select("*", { count: "exact" })
          .eq("company_id", companyId)
          .eq("kind", k)
  )
    .order("updated_at", { ascending: false })
    .order("id");
  if (k !== "permits" && q)
    query = query.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (k !== "permits" && status) query = query.eq("status", status);
  const { data, count, error } = filterError
    ? { data: [], count: 0, error: null }
    : await query.range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("No se pudo cargar el módulo.");
  const format = new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: company.timezone,
  });
  return (
    <>
      <div className="flex flex-wrap gap-4 justify-between mb-7">
        <div>
          <p className="eyebrow">Operaciones</p>
          <h1 className="page-title mt-2">{cfg.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {cfg.description}
          </p>
        </div>
        {canAccess(member, cfg.module, "write") && (
          <Button asChild>
            <Link href={`${base}/nuevo`}>Crear {cfg.singular}</Link>
          </Button>
        )}
      </div>
      <form className="card flex flex-wrap items-end gap-4 mb-5">
        <label className="field grow">
          {k === "permits" ? "Buscar permiso" : "Nombre"}
          <Input name="q" defaultValue={q} />
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={status}>
            <option value="">Todos</option>
            {Object.entries(cfg.statuses).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {k === "permits" && (
          <>
            <label className="field">
              Desde
              <Input name="from" type="date" defaultValue={from} />
            </label>
            <label className="field">
              Hasta
              <Input name="to" type="date" defaultValue={to} />
            </label>
          </>
        )}
        <Button>Filtrar</Button>
        {(q || status || from || to) && (
          <Link className="text-sm underline" href={base}>
            Limpiar filtros
          </Link>
        )}
        {k === "permits" && (
          <p className="w-full text-xs text-muted-foreground">
            Busca por tipo, autoridad, número, notas o nombre de un proyecto al
            que tengas acceso. Las fechas incluyen ambos días y usan la
            presentación; sin ella, la creación en {company.timezone}.
          </p>
        )}
      </form>
      {k === "installations" && (
        <p className="mb-3 text-sm text-muted-foreground">
          Horario de la agenda: {company.timezone}.
        </p>
      )}
      {filterError && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {filterError}
        </p>
      )}
      {k === "zones" && <ZonesMap zones={data ?? []} />}
      <div className="card overflow-x-auto">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Registro</th>
                <th>Estado</th>
                <th>
                  {k === "inventory"
                    ? "Existencia"
                    : k === "installations"
                      ? "Horario"
                      : k === "permits"
                        ? "Autoridad / vencimiento"
                        : "Actualización"}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((r: WorkListRow) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="font-semibold text-primary"
                      href={`${base}/${r.id}`}
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Revisión {r.version}
                    </p>
                  </td>
                  <td>{cfg.statuses[r.status]}</td>
                  <td>
                    {k === "inventory" ? (
                      <>
                        {r.stock} {r.data.unit}
                        {Number(r.stock) <= Number(r.data.minimum) && (
                          <p className="text-amber-700">
                            En mínimo o por debajo
                          </p>
                        )}
                      </>
                    ) : k === "installations" ? (
                      <>
                        {format.format(new Date(r.data.starts_at))}
                        <p>hasta {format.format(new Date(r.data.ends_at))}</p>
                      </>
                    ) : k === "permits" ? (
                      <>
                        {r.data.authority}
                        <p>
                          {r.data.expiration_date ||
                            "Sin vencimiento registrado"}
                        </p>
                      </>
                    ) : (
                      format.format(new Date(r.updated_at))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-10 text-center text-muted-foreground">
            {filterError
              ? "Corrige las fechas para consultar los permisos."
              : "No hay registros con estos filtros."}
          </p>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={k === "permits" ? { q, status, from, to } : { q, status }}
      />
    </>
  );
}
