import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { projectStatuses } from "@/lib/finance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/list-pagination";
export default async function Projects({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { companyId } = await params,
    { db } = await requireModule(companyId, "fin-proyectos"),
    s = await searchParams,
    q = (s.q ?? "").trim().slice(0, 100),
    status = Object.hasOwn(projectStatuses, s.status ?? "") ? s.status! : "",
    page = Math.max(1, Math.min(100000, parseInt(s.page ?? "1") || 1));
  let query = db
    .from("projects")
    .select("id,name,status,project_date,start_date,end_date", {
      count: "exact",
    })
    .eq("company_id", companyId)
    .order("project_date", { ascending: false })
    .order("id");
  if (q) query = query.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudieron cargar los proyectos.");
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Operaciones</p>
        <h1 className="page-title mt-2">Proyectos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Expedientes creados desde estimados aprobados, con fechas y
          seguimiento de ejecución.
        </p>
      </div>
      <form className="card mb-5 flex gap-4 flex-wrap items-end">
        <label className="field grow">
          Nombre
          <Input name="q" defaultValue={q} />
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={status}>
            <option value="">Todos</option>
            {Object.entries(projectStatuses).map(([k, v]) => (
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
                <th>Proyecto</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Inicio</th>
                <th>Fin</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      className="font-semibold text-primary"
                      href={`/app/${companyId}/proyectos/${p.id}`}
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td>
                    {projectStatuses[p.status as keyof typeof projectStatuses]}
                  </td>
                  <td>{p.project_date}</td>
                  <td>{p.start_date ?? "Por definir"}</td>
                  <td>{p.end_date ?? "Por definir"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No hay proyectos en esta vista.</p>
        )}
      </div>
      <ListPagination
        path={`/app/${companyId}/proyectos`}
        page={page}
        count={count ?? 0}
        query={{ q, status }}
      />
    </>
  );
}
