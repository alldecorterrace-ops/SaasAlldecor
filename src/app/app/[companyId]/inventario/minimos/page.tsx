import Link from "next/link";
import { inventorySection } from "@/lib/inventory-server";
import { quantity } from "@/lib/inventory";
import { uuid } from "@/lib/validation";
import { ListPagination } from "@/components/list-pagination";
export default async function LowStock({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ sede?: string; todas?: string; page?: string }>;
}) {
  const { companyId } = await params,
    { db, inventory: ctx } = await inventorySection(companyId, "existencias"),
    s = await searchParams;
  const root = `/app/${companyId}/inventario`,
    page = Math.max(1, Math.min(100000, parseInt(s.page ?? "1") || 1));
  const loc = uuid.safeParse(s.sede).success ? s.sede : null;
  const { data, count, error } = await db
    .rpc(
      "inventory_minimum_rows",
      { p_company: companyId, p_location: loc, p_low: s.todas !== "1" },
      { count: "exact" },
    )
    .order("location_name")
    .order("name")
    .order("target_id")
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("No se pudieron consultar los mínimos.");
  return (
    <div className="grid gap-5">
      <Link className="underline" href={root + "/existencias"}>
        Volver a existencias
      </Link>
      <h1 className="page-title">Existencias bajas</h1>
      <form className="card flex flex-wrap gap-4 items-end">
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
        <label>
          <input
            type="checkbox"
            name="todas"
            value="1"
            defaultChecked={s.todas === "1"}
          />{" "}
          Incluir mínimos ya cubiertos
        </label>
        <button className="underline">Filtrar</button>
      </form>
      <section className="card overflow-x-auto">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Producto o variante</th>
                <th>Ubicación</th>
                <th>Existencia</th>
                <th>Mínimo</th>
                <th>Faltan</th>
              </tr>
            </thead>
            <tbody>
              {data.map(
                (r: {
                  location_id: string;
                  target_id: string;
                  target_kind: string;
                  name: string;
                  location_name: string;
                  unit: string;
                  quantity: number;
                  minimum: number;
                }) => (
                  <tr
                    key={[r.location_id, r.target_kind, r.target_id].join("/")}
                  >
                    <td>
                      {r.name} ·{" "}
                      {r.target_kind === "FAMILY" ? "Producto" : "Variante"}
                    </td>
                    <td>{r.location_name}</td>
                    <td>
                      {quantity(r.quantity)} {r.unit.toLowerCase()}
                    </td>
                    <td>{quantity(r.minimum)}</td>
                    <td>
                      {quantity(
                        Math.max(0, Number(r.minimum) - Number(r.quantity)),
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <p>No hay mínimos para este filtro.</p>
        )}
      </section>
      <ListPagination
        path={root + "/minimos"}
        page={page}
        count={count ?? 0}
        query={{
          ...(loc ? { sede: loc } : {}),
          ...(s.todas === "1" ? { todas: "1" } : {}),
        }}
      />
    </div>
  );
}
