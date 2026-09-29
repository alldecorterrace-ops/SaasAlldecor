import Link from "next/link";
import type { CommercialDocumentList } from "@/lib/commercial-documents";
export function CustomerCommercialDocuments({
  companyId,
  customerId,
  documents,
  timezone,
}: {
  companyId: string;
  customerId: string;
  documents: CommercialDocumentList;
  timezone: string;
}) {
  const dates = new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });
  return (
    <>
      <p className="text-sm text-muted-foreground">
        El PDF más reciente conservado de cada estimado o factura. Los
        borradores y las facturas anuladas no se incluyen. Los originales
        históricos siguen en su archivo.
      </p>
      <ul className="space-y-4" aria-label="PDF comerciales del cliente">
        {documents.rows.map((d) => (
          <li key={d.id} className="card min-w-0 space-y-3">
            <h4 className="font-semibold break-words">
              {d.kind === "estimate" ? "Estimado" : "Factura"} {d.number}
            </h4>
            <p>Revisión conservada: {d.record_version}</p>
            <p className="text-sm">
              Conservado: {dates.format(new Date(d.ready_at))} ({timezone})
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                className="underline"
                href={`/api/commercial-documents/${companyId}/${d.id}?customer=${customerId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir PDF
              </a>
              <Link
                className="underline"
                href={`/app/${companyId}/${d.kind === "estimate" ? "estimados" : "facturas"}/${d.record_id}`}
              >
                Ver {d.kind === "estimate" ? "estimado" : "factura"}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {!documents.rows.length && (
        <p className="card">
          No hay PDF comerciales conservados para este cliente.
        </p>
      )}
    </>
  );
}
