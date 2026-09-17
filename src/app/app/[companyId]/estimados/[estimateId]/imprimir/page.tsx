import Link from "next/link";
import { estimateRecord } from "@/lib/estimate-record";
import { estimateStatuses } from "@/lib/estimates";
import { priceBases } from "@/lib/commercial";
import { PrintButton } from "@/components/print-button";
export default async function PrintEstimate({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; estimateId: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  const { companyId, estimateId } = await params,
    { revision } = await searchParams,
    { record: r, company } = await estimateRecord(
      companyId,
      estimateId,
      revision,
    );
  const money = (v: string | number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(v));
  return (
    <>
      <div className="print:hidden mb-6 flex items-center gap-5">
        <PrintButton />
        <Link
          className="text-sm underline"
          href={`/app/${companyId}/estimados/${estimateId}${revision ? `?revision=${revision}` : ""}`}
        >
          Volver al estimado
        </Link>
      </div>
      <article className="card estimate-print bg-white">
        <header className="flex flex-wrap justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className="eyebrow">{company.name}</p>
            <h1 className="text-3xl font-semibold mt-3">Estimado {r.number}</h1>
            <p className="mt-2 text-sm">
              {estimateStatuses[r.status]} · Revisión {r.version}
            </p>
          </div>
          <div className="text-sm space-y-2">
            <p>Fecha: {r.estimate_date}</p>
            {r.valid_until && <p>Válido hasta: {r.valid_until}</p>}
            <p>Moneda: USD</p>
          </div>
        </header>
        <section className="my-6 text-sm space-y-1">
          <h2 className="font-semibold text-lg">
            {r.customer_snapshot.full_name}
          </h2>
          <p>
            {r.customer_snapshot.email} {r.customer_snapshot.phone}
          </p>
          <p>
            {[
              r.customer_snapshot.address,
              r.customer_snapshot.city,
              r.customer_snapshot.postal_code,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        </section>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Detalle</th>
                <th>Cantidad / medidas</th>
                <th>Precio base</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i, n) => (
                <tr key={n}>
                  <td>
                    <strong>{i.name}</strong>
                    <p className="whitespace-pre-wrap text-xs mt-1">
                      {i.description}
                    </p>
                    <p className="text-xs mt-1">{priceBases[i.base]}</p>
                  </td>
                  <td>
                    {i.qty}
                    {["linear_ft", "area_ft2", "volume_ft3"].includes(
                      i.base,
                    ) && (
                      <p className="text-xs">
                        {i.length}
                        {i.base !== "linear_ft" && ` × ${i.width}`}
                        {i.base === "volume_ft3" && ` × ${i.height}`} ft
                      </p>
                    )}
                  </td>
                  <td>
                    {i.base === "manual" ? "Manual" : money(i.unit_price)}
                  </td>
                  <td>{money(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-sm space-y-2 my-6 text-sm">
          <p className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(r.subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span>Descuento</span>
            <span>{money(r.discount)}</span>
          </p>
          <p className="flex justify-between">
            <span>Impuestos</span>
            <span>{money(r.taxes)}</span>
          </p>
          <p className="flex justify-between border-t border-border pt-3 text-xl font-semibold">
            <span>Total</span>
            <span>{money(r.total)}</span>
          </p>
        </div>
        {r.notes && (
          <section className="border-t border-border pt-5">
            <h2 className="font-semibold text-sm">Notas</h2>
            <p className="whitespace-pre-wrap text-sm mt-2">{r.notes}</p>
          </section>
        )}
        <footer className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          Este documento es un estimado. No constituye una factura ni acredita
          un pago.
        </footer>
      </article>
    </>
  );
}
