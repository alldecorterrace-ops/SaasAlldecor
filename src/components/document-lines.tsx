import type { EstimateItem } from "@/lib/estimates";
import { usd } from "@/lib/finance";
import { priceBases } from "@/lib/commercial";
export function DocumentLines({
  items,
  subtotal,
  discount,
  taxes,
  total,
  historical = false,
}: {
  items: (EstimateItem & { line_total: string })[];
  subtotal: string | number;
  discount: string | number;
  taxes: string | number;
  total: string | number;
  historical?: boolean;
}) {
  return (
    <section className="card overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            {!historical && <th>Cantidad / medidas</th>}
            {!historical && <th>Precio</th>}
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={n}>
              <td>
                <strong>{i.name}</strong>
                <p className="whitespace-pre-wrap text-sm">{i.description}</p>
              </td>
              {!historical && (
                <td>
                  {i.qty} · {priceBases[i.base]}
                  {["area_ft2", "linear_ft", "volume_ft3"].includes(i.base) && (
                    <p>
                      {i.length}
                      {i.base !== "linear_ft" ? ` × ${i.width}` : ""}
                      {i.base === "volume_ft3" ? ` × ${i.height}` : ""} ft
                    </p>
                  )}
                </td>
              )}
              {!historical && (
                <td>{i.base === "manual" ? "Manual" : usd(i.unit_price)}</td>
              )}
              <td>{usd(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto max-w-sm space-y-2 mt-6">
        {[
          ["Subtotal", subtotal],
          ["Descuento", discount],
          ["Impuestos", taxes],
          ["Total", total],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6">
            <dt>{k}</dt>
            <dd className="font-semibold">{usd(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
