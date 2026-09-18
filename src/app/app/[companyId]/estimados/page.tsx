import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { estimateStatuses } from "@/lib/estimates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/list-pagination";
import { z } from "zod";
export default async function Estimates({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "fin-estimados"),
    s = await searchParams,
    q = (s.q ?? "").trim().slice(0, 100),
    status = Object.hasOwn(estimateStatuses, s.status ?? "") ? s.status! : "",
    from = z.iso.date().safeParse(s.from).success ? s.from! : "",
    to = z.iso.date().safeParse(s.to).success ? s.to! : "",
    page = Math.min(100000, Math.max(1, Number.parseInt(s.page ?? "1") || 1));
  let query = db
    .from("estimates")
    .select("id,number,customer_snapshot,estimate_date,status,total,version", {
      count: "exact",
    })
    .eq("company_id", companyId)
    .order("estimate_date", { ascending: false })
    .order("id");
  if (q) query = query.ilike("number", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("estimate_date", from);
  if (to) query = query.lte("estimate_date", to);
  const { data, count, error } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudieron cargar los estimados.");
  const base = `/app/${companyId}/estimados`,
    money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    });
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-7">
        <div>
          <p className="eyebrow">Comercial</p>
          <h1 className="page-title mt-2">Estimados</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Propuestas con detalle, importes y revisiones conservadas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`${base}/historico`}>Histórico ADT</Link>
          </Button>
          {canAccess(member, "fin-estimados", "write") && (
            <Button asChild>
              <Link href={`${base}/nuevo`}>Nuevo estimado</Link>
            </Button>
          )}
        </div>
      </div>
      <form className="card grid gap-4 mb-5 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="field">
          Buscar número
          <Input name="q" defaultValue={q} placeholder="EST-2026-0001" />
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={status}>
            <option value="">Todos</option>
            {Object.entries(estimateStatuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Desde
          <Input name="from" type="date" defaultValue={from} />
        </label>
        <label className="field">
          Hasta
          <Input name="to" type="date" defaultValue={to} />
        </label>
        <Button className="self-end">Filtrar</Button>
      </form>
      <div className="card overflow-x-auto p-0">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Estimado</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Revisión</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="font-semibold text-primary hover:underline"
                      href={`${base}/${r.id}`}
                    >
                      {r.number}
                    </Link>
                  </td>
                  <td>{r.customer_snapshot.full_name}</td>
                  <td>{r.estimate_date}</td>
                  <td>
                    {
                      estimateStatuses[
                        r.status as keyof typeof estimateStatuses
                      ]
                    }
                  </td>
                  <td>{money.format(Number(r.total))}</td>
                  <td>{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <h2 className="font-semibold">No hay estimados en esta vista</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Crea una propuesta para un cliente o ajusta los filtros.
            </p>
          </div>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ q, status, from, to }}
      />
    </>
  );
}
