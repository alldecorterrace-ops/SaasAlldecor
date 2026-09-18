import {
  historicalMoney,
  historicalReviewLabel,
  type HistoricalEstimate,
} from "@/lib/historical-estimates";

export function HistoricalEstimateDetail({
  record,
}: {
  record: HistoricalEstimate;
}) {
  return (
    <>
      <div className="card mb-5">
        <p className="eyebrow">Histórico ADT · Solo consulta</p>
        <h1 className="page-title mt-2">{record.number}</h1>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Cliente</dt>
            <dd>{record.customer_name || "No indicado"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Fecha original</dt>
            <dd>{record.original_date || "No indicada"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Estado original</dt>
            <dd>{record.original_status || "No indicado"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          Los datos se conservan como estaban en ADT. Esta consulta no modifica
          el estimado ni genera facturas o cobros.
        </p>
      </div>
      {record.review_reasons.length > 0 && (
        <section
          className="card mb-5 border-amber-300"
          aria-label="Datos por revisar"
        >
          <h2 className="font-semibold">Datos por revisar</h2>
          <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
            {[...new Set(record.review_reasons.map(historicalReviewLabel))].map(
              (reason) => (
                <li key={reason}>{reason}</li>
              ),
            )}
          </ul>
        </section>
      )}
      <section
        className="card mb-5 overflow-x-auto"
        aria-label="Partidas originales"
      >
        <h2 className="font-semibold mb-4">Partidas originales</h2>
        {record.detail_state === "unavailable_in_reviewed_sources" ? (
          <p className="text-sm text-muted-foreground">
            El desglose no está disponible en las fuentes revisadas. Se conserva
            el total original sin crear partidas de ajuste.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Detalle</th>
                <th>Importe guardado</th>
              </tr>
            </thead>
            <tbody>
              {record.lines.map((line, index) => (
                <tr key={index}>
                  <td className="whitespace-pre-wrap break-words">
                    {line.description}
                  </td>
                  <td className="whitespace-pre-wrap break-words">
                    {line.specification || "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    {historicalMoney(line.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card" aria-label="Importes originales">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">
              Descuento original
            </dt>
            <dd>{historicalMoney(record.discount_cents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              Impuestos originales
            </dt>
            <dd>{historicalMoney(record.taxes_cents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              Total original (USD)
            </dt>
            <dd className="text-xl font-semibold">
              {historicalMoney(record.total_cents)}
            </dd>
          </div>
        </dl>
        {record.difference_cents !== null &&
          BigInt(record.difference_cents) !== 0n && (
            <p className="text-sm mt-4">
              Diferencia respecto al total original al sumar las partidas,
              restar el descuento y añadir impuestos:{" "}
              <strong>{historicalMoney(record.difference_cents)}</strong>. Los
              importes permanecen sin cambios.
            </p>
          )}
      </section>
    </>
  );
}
