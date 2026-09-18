import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import {
  historicalKindSchema,
  historicalSections,
} from "@/lib/historical-business";
import { historicalMoney } from "@/lib/historical-estimates";
import { HistoricalNavigation } from "@/components/historical-navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/list-pagination";
export default async function BusinessHistory({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; kind: string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    client?: string;
    project?: string;
    invoice?: string;
  }>;
}) {
  const p = await params,
    k = historicalKindSchema.safeParse(p.kind);
  if (!k.success) notFound();
  const kind = k.data,
    section = historicalSections[kind],
    { db, member } = await requireModule(p.companyId, section.module),
    s = await searchParams;
  const q = (s.q ?? "").trim().slice(0, 100),
    page = Math.min(100000, Math.max(1, parseInt(s.page ?? "1") || 1));
  const filters = Object.fromEntries(
    ["client", "project", "invoice"].map((key) => [
      key,
      uuid.safeParse(s[key as keyof typeof s]).success
        ? s[key as keyof typeof s]!
        : "",
    ]),
  );
  const base = `/app/${p.companyId}/historico/${kind}`;
  let query = db
    .from("historical_business")
    .select(
      "id,title,original_date,original_status,customer_name,amount_cents",
      { count: "exact" },
    )
    .eq("company_id", p.companyId)
    .eq("kind", kind)
    .order(kind === "clients" ? "title" : "original_date", {
      ascending: kind === "clients",
    })
    .order("id");
  if (q) query = query.ilike("title", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  for (const [field, value] of Object.entries(filters))
    if (value) query = query.eq(`${field}_id`, value);
  const { data, error, count } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudo cargar el histórico.");
  return (
    <>
      <HistoricalNavigation companyId={p.companyId} member={member} />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow">Histórico ADT</p>
          <h1 className="page-title mt-2">{section.label} históricos</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Registros conservados del respaldo, en modo de consulta.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/${p.companyId}/${section.current}`}>
            Volver al módulo
          </Link>
        </Button>
      </div>
      {Object.values(filters).some(Boolean) && (
        <p className="text-sm mb-4">
          Mostrando registros relacionados.{" "}
          <Link className="underline" href={base}>
            Ver todos
          </Link>
        </p>
      )}
      <form className="card mb-5 flex flex-wrap gap-3 items-end">
        <label className="field flex-1 min-w-48">
          Buscar nombre, número o referencia
          <Input name="q" defaultValue={q} />
        </label>
        {Object.entries(filters)
          .filter(([, value]) => value)
          .map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <Button>Buscar</Button>
      </form>
      <div className="card p-0 overflow-x-auto">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Registro</th>
                <th>Cliente</th>
                <th>Fecha original</th>
                <th>Estado original</th>
                {kind !== "clients" && <th>Importe original</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="text-primary font-semibold underline"
                      href={`${base}/${r.id}`}
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td>{r.customer_name || "No indicado"}</td>
                  <td>{r.original_date || "No indicada"}</td>
                  <td>{r.original_status || "No indicado"}</td>
                  {kind !== "clients" && (
                    <td className="whitespace-nowrap">
                      {historicalMoney(r.amount_cents)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            No hay registros históricos en esta vista.
          </div>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ q, ...filters }}
      />
    </>
  );
}
