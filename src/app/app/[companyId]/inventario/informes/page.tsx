import Link from "next/link";
import { notFound } from "next/navigation";
import { inventoryAccess } from "@/lib/inventory-server";
import { quantity, usd } from "@/lib/inventory";
import { uuid } from "@/lib/validation";
import { ListPagination } from "@/components/list-pagination";
export default async function Reports({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await params,
    { db, inventory: ctx } = await inventoryAccess(companyId);
  if (!ctx.costView) notFound();
  const s = await searchParams,
    root = `/app/${companyId}/inventario`,
    page = Math.max(1, Math.min(100000, parseInt(s.page ?? "1") || 1));
  const report = ["VALOR", "PERDIDAS", "COMPRAS"].includes(s.informe ?? "")
      ? s.informe!
      : "VALOR",
    group = ["LOCATION", "CATEGORY", "FAMILY"].includes(s.grupo ?? "")
      ? s.grupo!
      : "LOCATION";
  if (report === "COMPRAS" && !ctx.supplierView) notFound();
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null),
    from = date(s.desde),
    to = date(s.hasta),
    loc = uuid.safeParse(s.sede).success ? s.sede : null;
  const invalid =
    report !== "VALOR" &&
    ((s.desde && !from) || (s.hasta && !to) || (from && to && from > to));
  const { data, error, count } = invalid
    ? { data: [], count: 0, error: null }
    : await db
        .rpc(
          "inventory_cost_report",
          {
            p_company: companyId,
            p_report: report,
            p_group: group,
            p_location: loc,
            p_from: from,
            p_to: to,
          },
          { count: "exact" },
        )
        .order("label")
        .order("unit")
        .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("No se pudo cargar el informe.");
  return (
    <div className="grid gap-5">
      <Link className="underline" href={root + "/existencias"}>
        Volver a existencias
      </Link>
      <h1 className="page-title">Informes de costos</h1>
      <form className="card flex flex-wrap items-end gap-4">
        <label className="field">
          Informe
          <select name="informe" defaultValue={report}>
            <option value="VALOR">Valor actual del inventario</option>
            <option value="PERDIDAS">Pérdidas por ajuste</option>
            {ctx.supplierView && (
              <option value="COMPRAS">Compras por proveedor</option>
            )}
          </select>
        </label>
        <label className="field">
          Agrupar el valor por
          <select name="grupo" defaultValue={group}>
            <option value="LOCATION">Ubicación</option>
            <option value="CATEGORY">Categoría</option>
            <option value="FAMILY">Producto</option>
          </select>
        </label>
        <label className="field">
          Ubicación
          <select name="sede" defaultValue={loc ?? ""}>
            <option value="">Todas mis ubicaciones</option>
            {ctx.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Desde (compras y pérdidas)
          <input type="date" name="desde" defaultValue={from ?? ""} />
        </label>
        <label className="field">
          Hasta
          <input type="date" name="hasta" defaultValue={to ?? ""} />
        </label>
        <button className="underline">Ver informe</button>
      </form>
      {invalid && <p role="alert">Revisa el intervalo de fechas.</p>}
      <section className="card overflow-x-auto">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Cantidad</th>
                <th>Valor conocido</th>
                <th>Pendiente de costear</th>
              </tr>
            </thead>
            <tbody>
              {data.map(
                (r: {
                  label: string;
                  unit: string;
                  quantity: number;
                  known_value: number;
                  pending: number;
                }) => (
                  <tr key={r.label + "/" + r.unit}>
                    <td>{r.label}</td>
                    <td>
                      {quantity(r.quantity)} {r.unit.toLowerCase()}
                    </td>
                    <td>{usd(r.known_value)}</td>
                    <td>
                      {quantity(r.pending)} {r.unit.toLowerCase()}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <p>Sin movimientos para este filtro.</p>
        )}
      </section>
      <ListPagination
        path={root + "/informes"}
        page={page}
        count={count ?? 0}
        query={
          Object.fromEntries(
            Object.entries(s).filter(([k, v]) => k !== "page" && !!v),
          ) as Record<string, string>
        }
      />
    </div>
  );
}
