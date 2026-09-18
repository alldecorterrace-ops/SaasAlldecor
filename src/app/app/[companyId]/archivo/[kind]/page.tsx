import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import {
  archiveKindSchema,
  archiveLabels,
  fileStateLabels,
  fileStateSchema,
} from "@/lib/historical-documents";
import { HistoricalNavigation } from "@/components/historical-navigation";
import { ListPagination } from "@/components/list-pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default async function ArchiveList({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; kind: string }>;
  searchParams: Promise<{ q?: string; page?: string; review?: string }>;
}) {
  const p = await params,
    k = archiveKindSchema.safeParse(p.kind);
  if (!k.success) notFound();
  const { db, member } = await requireModule(p.companyId, "fin-estimados"),
    s = await searchParams;
  const q = (s.q ?? "").trim().slice(0, 100),
    page = Math.min(100000, Math.max(1, parseInt(s.page ?? "1") || 1)),
    review = s.review === "1",
    manager = member.role === "owner" || member.role === "admin";
  if (review && !manager) notFound();
  const base = `/app/${p.companyId}/archivo/${k.data}`;
  let query = db
    .from("historical_documents")
    .select(
      "id,title,original_date,original_status,relation_state,file_state",
      { count: "exact" },
    )
    .eq("company_id", p.companyId)
    .eq("kind", k.data)
    .order("original_date", { ascending: false })
    .order("id");
  if (q) query = query.ilike("title", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (review) query = query.eq("relation_state", "review");
  const { data, error, count } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudo cargar el archivo histórico.");
  return (
    <>
      <HistoricalNavigation companyId={p.companyId} member={member} />
      <p className="eyebrow">Archivo histórico ADT</p>
      <h1 className="page-title mt-2">{archiveLabels[k.data]} históricos</h1>
      <p className="text-sm text-muted-foreground mt-3 mb-5">
        Consulta del registro original y descarga de los PDF conservados. Los
        casos con relaciones pendientes solo son visibles para administradores.
      </p>
      {manager && (
        <p className="mb-5">
          <Link
            className="text-primary underline"
            href={review ? base : `${base}?review=1`}
          >
            {review ? "Ver todos" : "Ver pendientes de revisión"}
          </Link>
        </p>
      )}
      <form className="card mb-5 flex flex-wrap gap-3 items-end">
        <label className="field flex-1 min-w-48">
          Buscar nombre o número
          <Input name="q" defaultValue={q} />
        </label>
        {review && <input type="hidden" name="review" value="1" />}
        <Button>Buscar</Button>
      </form>
      <div className="card p-0 overflow-x-auto">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Registro</th>
                <th>Fecha (UTC)</th>
                <th>Estado original</th>
                <th>Relaciones</th>
                <th>Archivo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="text-primary underline"
                      href={`${base}/${r.id}`}
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td>{r.original_date || "No indicada"}</td>
                  <td>{r.original_status || "No indicado"}</td>
                  <td>
                    {r.relation_state === "review"
                      ? "Pendiente de revisión"
                      : "Referencias comprobadas"}
                  </td>
                  <td>
                    {fileStateLabels[fileStateSchema.parse(r.file_state)]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-8">No hay registros en esta vista.</p>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ q, review: review ? "1" : "" }}
      />
    </>
  );
}
