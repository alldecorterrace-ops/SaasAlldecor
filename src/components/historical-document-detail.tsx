import {
  archiveReview,
  fileStateLabels,
  type HistoricalDocument,
} from "@/lib/historical-documents";
import { historicalMoney } from "@/lib/historical-estimates";
export function HistoricalDocumentDetail({
  record,
  fileState,
}: {
  record: HistoricalDocument;
  fileState: keyof typeof fileStateLabels;
}) {
  return (
    <article className="card">
      <p className="eyebrow">Archivo histórico ADT · Solo consulta</p>
      <h1 className="page-title mt-2">{record.title}</h1>
      <p className="text-sm text-muted-foreground mt-3">
        Se conservan el registro y los archivos disponibles del origen. Esta
        consulta no emite documentos ni solicita firmas.
      </p>
      {record.relation_state === "review" && (
        <p className="mt-4 border border-amber-300 rounded-lg p-3">
          Pendiente de revisión por un administrador. No está adjuntado a ningún
          cliente, proyecto ni estimado.
        </p>
      )}
      <dl className="grid sm:grid-cols-2 gap-5 mt-6">
        {Object.entries({
          "Tipo original": record.original_type,
          "Estado original": record.original_status,
          "Cliente indicado": record.customer_name,
          "Fecha original (UTC)": record.original_date,
          "Fecha de firma registrada (UTC)": record.signed_date,
          "Importe original":
            record.amount_cents === null
              ? "No indicado"
              : historicalMoney(record.amount_cents),
          Archivo: fileStateLabels[fileState],
          "Contenido firmado en el respaldo": record.has_signed_content
            ? "Conservado de forma privada"
            : "No consta",
          "Imagen de firma en el respaldo": record.has_signature
            ? "Conservada de forma privada"
            : "No consta",
        }).map(([key, value]) => (
          <div key={key}>
            <dt className="text-sm text-muted-foreground">{key}</dt>
            <dd className="mt-1 break-words">{value || "No indicado"}</dd>
          </div>
        ))}
      </dl>
      {!!record.review_reasons.length && (
        <ul className="mt-5 list-disc pl-5 text-sm">
          {[...new Set(record.review_reasons.map(archiveReview))].map(
            (reason) => (
              <li key={reason}>{reason}</li>
            ),
          )}
        </ul>
      )}
    </article>
  );
}
