import Link from "next/link";
import type { CustomerPermitsResult } from "@/lib/customer-permits";
import { workspaces } from "@/lib/workspaces";
export function CustomerPermits({
  companyId,
  customerId,
  records,
  documents,
  timezone,
}: {
  companyId: string;
  customerId: string;
  records: CustomerPermitsResult;
  documents: boolean;
  timezone: string;
}) {
  const base = `/app/${companyId}`;
  const dates = new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {documents
          ? "Archivos activos de los permisos de obra vinculados a los proyectos de este cliente. Los originales archivados se conservan en la ficha del permiso."
          : "Permisos de obra vinculados a los proyectos de este cliente. Los anulados se conservan en su módulo y no se incluyen en este listado."}
      </p>
      <ul
        className="space-y-4"
        aria-label={
          documents
            ? "Documentos de permisos del cliente"
            : "Permisos del cliente"
        }
      >
        {records.rows.map((r) => (
          <li key={r.id} className="card min-w-0 space-y-3">
            <h4 className="font-semibold break-words">
              {r.kind === "permit" ? (
                <Link
                  className="text-primary underline"
                  href={`${base}/operaciones/permits/${r.id}`}
                >
                  {r.name}
                </Link>
              ) : (
                r.name
              )}
            </h4>
            <p className="text-sm break-words">
              Proyecto:{" "}
              <Link
                className="underline"
                href={`${base}/proyectos/${r.project_id}`}
              >
                {r.project_name}
              </Link>
            </p>
            {r.kind === "permit" ? (
              <>
                <p className="text-sm">
                  {workspaces.permits.statuses[r.status]} · Número:{" "}
                  {r.number || "Sin asignar"}
                </p>
                <p className="text-sm break-words">
                  Autoridad: {r.authority || "Sin asignar"}
                </p>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  {[
                    ["Presentado", r.submitted_date],
                    ["Aprobado", r.approved_date],
                    ["Vencimiento", r.expiration_date],
                  ].map(([label, date]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>{date || "Por definir"}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm">Documentos activos: {r.documents}</p>
              </>
            ) : (
              <>
                <p className="text-sm break-words">
                  Permiso:{" "}
                  <Link
                    className="underline"
                    href={`${base}/operaciones/permits/${r.permit_id}`}
                  >
                    {r.permit_name}
                  </Link>
                </p>
                <p className="text-sm text-muted-foreground">
                  Incorporado:{" "}
                  <time dateTime={r.created_at}>
                    {dates.format(new Date(r.created_at))}
                  </time>{" "}
                  ({timezone})
                </p>
                <a
                  className="inline-block text-primary underline"
                  href={`/api/customers/${companyId}/${customerId}/documents/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir documento
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      {!records.rows.length && (
        <p className="card">
          {documents
            ? "No hay documentos activos de permisos para este cliente."
            : "No hay permisos de obra sin anular en este expediente."}
        </p>
      )}
    </>
  );
}
