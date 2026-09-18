import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { historicalMoney } from "@/lib/historical-estimates";
import { ListPagination } from "@/components/list-pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HistoricalNavigation } from "@/components/historical-navigation";

export default async function HistoricalEstimates({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "fin-estimados"),
    search = await searchParams;
  const q = (search.q ?? "").trim().slice(0, 100),
    page = Math.min(
      100000,
      Math.max(1, Number.parseInt(search.page ?? "1") || 1),
    );
  const base = `/app/${companyId}/estimados/historico`;
  let query = db
    .from("historical_estimates")
    .select(
      "id,number,original_date,original_status,customer_name,total_cents",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .order("original_date", { ascending: false })
    .order("id");
  if (q) query = query.ilike("number", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error, count } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudo cargar el histórico de estimados.");
  return (
    <>
      <HistoricalNavigation companyId={companyId} member={member} />
      <div className="flex flex-wrap gap-4 justify-between items-center mb-7">
        <div>
          <p className="eyebrow">Estimados · Histórico ADT</p>
          <h1 className="page-title mt-2">Histórico de estimados</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Consulta de los datos originales conservados. Los documentos
            históricos no generan nuevas operaciones.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/${companyId}/estimados`}>Estimados actuales</Link>
        </Button>
      </div>
      <form className="card mb-5 flex flex-wrap gap-3 items-end">
        <label className="field flex-1 min-w-48">
          Buscar número
          <Input name="q" defaultValue={q} />
        </label>
        <Button>Buscar</Button>
      </form>
      <div className="card overflow-x-auto p-0">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Estimado</th>
                <th>Cliente</th>
                <th>Fecha original</th>
                <th>Estado original</th>
                <th>Total original (USD)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((record) => (
                <tr key={record.id}>
                  <td>
                    <Link
                      className="font-semibold text-primary hover:underline"
                      href={`${base}/${record.id}`}
                    >
                      {record.number}
                    </Link>
                  </td>
                  <td>{record.customer_name || "No indicado"}</td>
                  <td>{record.original_date || "No indicada"}</td>
                  <td>{record.original_status || "No indicado"}</td>
                  <td className="whitespace-nowrap">
                    {historicalMoney(record.total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <h2 className="font-semibold">
              No hay estimados históricos en esta vista
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {q
                ? "Prueba otro número de estimado."
                : "Los registros aparecerán cuando se complete su carga para esta empresa."}
            </p>
          </div>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ q }}
      />
    </>
  );
}
