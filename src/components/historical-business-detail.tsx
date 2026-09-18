import {
  historicalFields,
  historicalBusinessReview,
  type HistoricalBusiness,
} from "@/lib/historical-business";
import { historicalMoney } from "@/lib/historical-estimates";
export function HistoricalBusinessDetail({
  record,
}: {
  record: HistoricalBusiness;
}) {
  return (
    <>
      <section className="card mb-5">
        <p className="eyebrow">Histórico ADT · Solo consulta</p>
        <h1 className="page-title mt-2">{record.title}</h1>
        <dl className="grid gap-4 sm:grid-cols-3 mt-5">
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
        {record.amount_cents !== null && (
          <p className="text-xl font-semibold mt-5">
            Importe original: {historicalMoney(record.amount_cents)} USD
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-4">
          Datos de la copia respaldada de ADT. Esta consulta no modifica saldos
          ni registra nuevos cobros.
        </p>
      </section>
      {!!record.review_reasons.length && (
        <section className="card mb-5 border-amber-300">
          <h2 className="font-semibold">Datos por revisar</h2>
          <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
            {[
              ...new Set(record.review_reasons.map(historicalBusinessReview)),
            ].map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p className="text-sm mt-3">
            Los valores guardados se conservan sin ajustes automáticos.
          </p>
        </section>
      )}
      {!!Object.keys(record.details).length && (
        <section className="card">
          <h2 className="font-semibold mb-4">Detalle guardado</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries(record.details).map(([key, value]) => (
              <div key={key}>
                <dt className="text-sm text-muted-foreground">
                  {historicalFields[key as keyof typeof historicalFields]}
                </dt>
                <dd className="whitespace-pre-wrap break-words">
                  {key.endsWith("_cents")
                    ? historicalMoney(value ?? null)
                    : value || "No indicado"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}
