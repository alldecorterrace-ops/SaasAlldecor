import Link from "next/link";
import {
  businessDate,
  usd,
  costUsd,
  quantity,
  documentSlug,
  inventoryReasons,
  movementLabels,
  type InvDoc,
  type Master,
  type StockGroup,
  type LedgerRow,
  type LotRow,
} from "@/lib/inventory";
export function MasterCard({
  row,
  path,
  slug,
}: {
  row: Master;
  path: string;
  slug: string;
}) {
  const d = row.data;
  return (
    <article className="card grid gap-2">
      <header className="flex flex-wrap justify-between gap-2">
        <Link className="font-semibold text-primary" href={path + "/" + row.id}>
          {row.name}
        </Link>
        <span className="text-xs">{d.active ? "Activo" : "Inactivo"}</span>
      </header>
      {slug === "proveedores" ? (
        <>
          <p className="text-sm">
            {[d.phone, d.email].filter(Boolean).join(" · ") ||
              "Sin datos de contacto"}
          </p>
          {d.purchases != null && <p>{d.purchases} compras</p>}
          {d.total != null && (
            <p>
              Total comprado conocido {usd(d.total)}
              {d.pending
                ? " · " + quantity(d.pending) + " unidades pendientes"
                : ""}
            </p>
          )}
        </>
      ) : slug === "ubicaciones" ? (
        <>
          <p>
            {d.kind === "ALMACEN" ? "Almacén" : "Tienda"} ·{" "}
            {d.city || "Sin ciudad"}
          </p>
          <p>{d.address}</p>
          {d.value != null && (
            <p>
              Valor conocido {usd(d.value)} · Pendiente{" "}
              {quantity(d.pending ?? 0)}
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            {d.code} · {d.category || "Sin categoría"} · {d.unit}
          </p>
          <ul className="text-sm">
            {d.variants?.map((v) => (
              <li key={v.id}>
                {v.sku} · {v.name} · {usd(v.price)}
                {!v.active ? " · Inactiva" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
export function DocCard({
  doc,
  path,
  detail = false,
  timezone = "America/New_York",
}: {
  doc: InvDoc;
  path: string;
  detail?: boolean;
  timezone?: string;
}) {
  const d = doc.data;
  return (
    <article className="card grid gap-3">
      <header className="flex flex-wrap justify-between gap-3">
        <Link href={path + "/" + doc.id} className="font-semibold text-primary">
          {d.kind === "COMPRA"
            ? "Compra"
            : d.kind === "TRASLADO"
              ? "Traslado"
              : "Ajuste"}{" "}
          · {businessDate(doc.business_date)}
        </Link>
        <span>{d.void ? "Anulado" : "Registrado"}</span>
      </header>
      <p>
        {d.location}
        {d.destination ? " → " + d.destination : ""}
        {d.supplier ? " · " + d.supplier : ""}
        {d.reference ? " · " + d.reference : ""}
      </p>
      {d.reason && <p>{inventoryReasons[d.reason]}</p>}
      {detail && d.actor && <p className="text-sm">Registrado por {d.actor}</p>}
      {d.notes && <p>{d.notes}</p>}
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Variante</th>
              <th>Cantidad</th>
              {d.value !== undefined && (
                <>
                  <th>Costo unitario</th>
                  <th>Valor</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.name}
                  <div className="text-xs">{l.sku}</div>
                </td>
                <td>
                  {quantity(l.qty)} {l.unit.toLowerCase()}
                </td>
                {d.value !== undefined && (
                  <>
                    <td>
                      {l.pending && d.kind !== "COMPRA"
                        ? "Parcial"
                        : costUsd(l.unitCost)}
                    </td>
                    <td>{usd(l.value)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.value !== undefined && (
        <p className="font-semibold">
          Valor conocido {usd(d.value)}
          {d.pending ? " · Pendiente de costear: " + quantity(d.pending) : ""}
          {d.tax != null ? " · Impuesto separado " + usd(d.tax) : ""}
        </p>
      )}
      {d.void && (
        <p className="text-sm">
          Anulación · {d.voidReason}
          {detail && d.voidAt
            ? " · " +
              new Intl.DateTimeFormat("es-US", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: timezone,
              }).format(new Date(d.voidAt)) +
              (d.voidBy ? " · " + d.voidBy : "")
            : ""}
        </p>
      )}
    </article>
  );
}
export function StockCard({ row, path }: { row: StockGroup; path: string }) {
  return (
    <article className="card grid gap-3">
      <h2 className="font-semibold">
        {row.name} · {quantity(row.data.qty)} en total
      </h2>
      {row.data.variants.map((v) => (
        <div key={v.id} className="border-t pt-3 text-sm">
          <Link className="font-semibold text-primary" href={path + "/" + v.id}>
            {v.name} · {v.sku}
          </Link>
          <p>
            {quantity(v.qty)} {v.unit.toLowerCase()} ·{" "}
            {v.locations.map((l) => l.name + " " + quantity(l.qty)).join(" · ")}
          </p>
          {v.value !== undefined && (
            <p>
              Valor conocido {usd(v.value)} · Pendiente{" "}
              {quantity(v.pending ?? 0)}
            </p>
          )}
        </div>
      ))}
    </article>
  );
}
export function LotTable({ rows, root }: { rows: LotRow[]; root: string }) {
  return rows.length ? (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Lote</th>
            <th>Variante</th>
            <th>Ubicación</th>
            <th>Queda</th>
            {rows.some((r) => r.detail.unitCost !== undefined) && (
              <>
                <th>Costo unitario</th>
                <th>Valor</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={[r.lot_id, r.variant_id, r.location_id].join("/")}>
              <td>
                {r.detail.document && documentSlug(r.detail.documentKind) ? (
                  <Link
                    className="underline"
                    href={
                      root +
                      "/" +
                      documentSlug(r.detail.documentKind) +
                      "/" +
                      r.detail.document
                    }
                  >
                    {r.label}
                  </Link>
                ) : (
                  r.label
                )}
                {r.detail.supplier && <p>{r.detail.supplier}</p>}
              </td>
              <td>{r.detail.product}</td>
              <td>{r.detail.location}</td>
              <td>{quantity(r.quantity)}</td>
              {r.detail.unitCost !== undefined && (
                <>
                  <td>{costUsd(r.detail.unitCost)}</td>
                  <td>{usd(r.detail.value)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p>No hay mercancía de estos lotes en las ubicaciones consultadas.</p>
  );
}
export function HistoryTable({
  rows,
  root,
}: {
  rows: LedgerRow[];
  root: string;
}) {
  return rows.length ? (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Fecha y documento</th>
            <th>Ubicación y lote</th>
            <th>Movimiento</th>
            <th>Saldo</th>
            {rows.some((r) => r.data.value !== undefined) && (
              <>
                <th>Valor del movimiento</th>
                <th>Saldo valorizado</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, data: d }) => (
            <tr key={id}>
              <td>
                {businessDate(d.date)}
                <p>
                  {d.document && documentSlug(d.documentKind) ? (
                    <Link
                      className="underline"
                      href={
                        root +
                        "/" +
                        documentSlug(d.documentKind) +
                        "/" +
                        d.document
                      }
                    >
                      {movementLabels[d.kind]}
                    </Link>
                  ) : (
                    movementLabels[d.kind]
                  )}
                </p>
                <p className="text-xs">{d.actor}</p>
              </td>
              <td>
                {d.location}
                {d.lots.map((l, i) => (
                  <p key={i} className="text-xs">
                    {l.label} · {quantity(l.qty)}
                    {l.cost !== undefined ? " a " + costUsd(l.cost) : ""}
                  </p>
                ))}
              </td>
              <td>{quantity(d.qty)}</td>
              <td>{quantity(d.balance)}</td>
              {d.value !== undefined && (
                <>
                  <td>
                    {usd(d.value)}
                    {d.pending ? " · Parcial" : ""}
                  </td>
                  <td>
                    {usd(d.balanceValue)}
                    {d.balancePending
                      ? " · " + quantity(d.balancePending) + " pendientes"
                      : ""}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p>Todavía no hay movimientos para esta variante.</p>
  );
}
