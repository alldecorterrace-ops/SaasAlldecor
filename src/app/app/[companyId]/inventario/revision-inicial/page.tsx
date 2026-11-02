import Link from "next/link";
import { notFound } from "next/navigation";
import { inventoryAccess } from "@/lib/inventory-server";
import { todayAt } from "@/lib/inventory";
import { InventoryForm } from "@/components/inventory/form";
import { OpeningMap } from "@/components/inventory/opening-map";
import { randomUUID } from "node:crypto";
import { ListPagination } from "@/components/list-pagination";

const statusLabels: Record<string, string> = {
  LISTO: "Listo para el lote inicial",
  SIN_SALDO: "Sin unidades que trasladar",
  HISTORIAL_NO_CUADRA: "El saldo difiere de la suma de movimientos",
  MAPEO_DESACTUALIZADO: "Cambió el artículo desde la última asignación",
  REVISAR_VARIANTE: "Identificar la variante física",
  REVISAR_UNIDAD: "Comprobar la unidad de medida",
  CANTIDAD_FRACCIONARIA: "Este producto requiere unidades enteras",
  UBICACION_AMBIGUA: "Hay varias ubicaciones con ese nombre",
  REVISAR_UBICACION: "Identificar una ubicación activa",
  CANTIDAD_INVALIDA: "Revisar la cantidad del artículo",
  SALDO_EXCEDE_LIMITE: "El saldo agrupado supera el máximo por ubicación",
};
type OpeningRow = {
  item_id: string;
  item_name: string;
  source_sku: string;
  source_location: string;
  source_unit: string;
  source_quantity: number | string;
  history_quantity: number | string;
  variant_name: string | null;
  location_name: string | null;
  review_status: string;
};
const formatQuantity = new Intl.NumberFormat("es-US", {
  maximumFractionDigits: 3,
});

export default async function InventoryOpening({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ page?: string; estado?: string }>;
}) {
  const { companyId } = await params;
  const {
    db,
    member,
    inventory: ctx,
    company,
  } = await inventoryAccess(companyId);
  if (member.role !== "owner" && member.role !== "admin") notFound();
  const search = await searchParams;
  const pending = search.estado === "pendiente";
  const page = Math.max(1, Math.min(100000, parseInt(search.page ?? "1") || 1));
  const path = `/app/${companyId}/inventario/revision-inicial`;
  const inventory = `/app/${companyId}/operaciones/inventory`;
  const { data: review, error } = await db.rpc("inventory_opening_page", {
    p_company: companyId,
    p_pending: pending,
    p_page: page,
  });
  if (error || !review || !Array.isArray(review.rows))
    throw new Error("No se pudo consultar la revisión de existencias.");
  const {
    rows: data,
    count,
    stamp,
    pending: remaining,
  } = review as {
    rows: OpeningRow[];
    count: number;
    stamp: string;
    pending: number;
  };
  return (
    <>
      <Link className="text-sm underline" href={inventory}>
        Volver al inventario
      </Link>
      <header className="my-6">
        <p className="eyebrow">Inventario</p>
        <h1 className="page-title mt-2">Revisión de existencias iniciales</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Compara el saldo de cada artículo con sus movimientos. Los artículos
          que cuadren se agruparán por variante y ubicación en el lote
          «Existencias anteriores», con costo pendiente.
        </p>
      </header>
      {ctx.active ? (
        <p className="card mb-5">
          La apertura ya está registrada.{" "}
          <Link
            className="underline"
            href={`/app/${companyId}/inventario/existencias`}
          >
            Ver existencias por lote
          </Link>
        </p>
      ) : (
        <section className="card mb-5 grid gap-3">
          <h2 className="font-semibold">Abrir inventario por lotes</h2>
          {remaining > 0 ? (
            <p>Quedan {remaining} artículos por revisar.</p>
          ) : (
            ctx.writable && (
              <InventoryForm
                company={companyId}
                slug="existencias"
                operation="opening"
                request={randomUUID()}
                submit="Confirmar apertura por lotes"
              >
                <input type="hidden" name="stamp" value={stamp} />
                <label className="field">
                  Fecha de apertura
                  <input
                    type="date"
                    name="date"
                    defaultValue={todayAt(company.timezone)}
                    required
                  />
                </label>
                <label>
                  <input type="checkbox" required /> Confirmo estos saldos. Las
                  nuevas operaciones de esta empresa se registrarán por lote y
                  el inventario anterior quedará de consulta.
                </label>
              </InventoryForm>
            )
          )}
          <p className="text-sm">
            <Link
              className="underline"
              href={`/app/${companyId}/inventario/ubicaciones`}
            >
              Preparar ubicaciones
            </Link>{" "}
            ·{" "}
            <Link
              className="underline"
              href={`/app/${companyId}/inventario/productos`}
            >
              Preparar catálogo físico
            </Link>
          </p>
        </section>
      )}
      <nav
        aria-label="Filtrar revisión de existencias"
        className="mb-5 flex gap-4 text-sm"
      >
        <Link
          href={path}
          aria-current={!pending ? "page" : undefined}
          className="underline"
        >
          Todos los artículos
        </Link>
        <Link
          href={path + "?estado=pendiente"}
          aria-current={pending ? "page" : undefined}
          className="underline"
        >
          Pendientes de revisión
        </Link>
      </nav>
      <div className="card overflow-x-auto">
        {data.length ? (
          <table>
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Ubicación registrada</th>
                <th>Saldo actual</th>
                <th>Suma de movimientos</th>
                <th>Variante y destino propuestos</th>
                <th>Revisión</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r: OpeningRow) => (
                <tr key={r.item_id}>
                  <td>
                    <Link
                      className="font-semibold text-primary"
                      href={`${inventory}/${r.item_id}`}
                    >
                      {r.item_name}
                    </Link>
                    {r.source_sku && <p className="text-xs">{r.source_sku}</p>}
                  </td>
                  <td>{r.source_location || "Sin ubicación"}</td>
                  <td>
                    {formatQuantity.format(Number(r.source_quantity))}{" "}
                    {r.source_unit}
                  </td>
                  <td>
                    {formatQuantity.format(Number(r.history_quantity))}{" "}
                    {r.source_unit}
                  </td>
                  <td>
                    {r.variant_name ?? "Sin variante"}
                    <p className="text-xs">
                      {r.location_name ?? "Sin ubicación asignada"}
                    </p>
                  </td>
                  <td>
                    {statusLabels[r.review_status] ?? "Revisar artículo"}
                    {!ctx.active &&
                      ctx.writable &&
                      [
                        "UBICACION_AMBIGUA",
                        "REVISAR_UBICACION",
                        "REVISAR_VARIANTE",
                        "MAPEO_DESACTUALIZADO",
                      ].includes(r.review_status) && (
                        <OpeningMap
                          company={companyId}
                          item={r.item_id}
                          request={randomUUID()}
                          locations={ctx.locations}
                        />
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm">
            {pending
              ? "No hay artículos pendientes en esta página."
              : "No hay artículos en esta página."}
          </p>
        )}
      </div>
      <ListPagination
        path={path}
        page={page}
        count={count ?? 0}
        query={pending ? { estado: "pendiente" } : {}}
      />
    </>
  );
}
