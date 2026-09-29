import Link from "next/link";
import {
  historyEntities,
  historyFields,
  type CustomerHistoryResult,
} from "@/lib/customer-history";
import { estimateStatuses } from "@/lib/estimates";
import { projectStatuses, usd } from "@/lib/finance";
import { expenseStatuses } from "@/lib/operations";

export function CustomerHistory({
  companyId,
  customerId,
  history,
  before,
  timezone,
}: {
  companyId: string;
  customerId: string;
  history: CustomerHistoryResult;
  before?: string | null;
  timezone: string;
}) {
  const dates = new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });
  const base = `/app/${companyId}/clientes/${customerId}?section=historial`;
  const states: Record<string, Record<string, string>> = {
    customers: { active: "Activo", archived: "Archivado" },
    estimates: estimateStatuses,
    invoices: { OPEN: "Abierta", VOID: "Anulada" },
    projects: projectStatuses,
    payments: { APPLIED: "Aplicado", VOID: "Anulado" },
    expenses: expenseStatuses,
  };
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Creaciones y cambios registrados en el SaaS para esta ficha y sus
        registros actualmente vinculados, según tus permisos. Los importes y
        estados corresponden a cada revisión. Horario: {timezone}.
      </p>
      <ol className="space-y-4" aria-label="Historial del cliente">
        {history.rows.map((e) => (
          <li className="card space-y-2" key={e.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold break-words">
                {e.operation === "INSERT" ? "Creación" : "Actualización"} ·{" "}
                {historyEntities[e.entity]} · {e.record_label}
              </p>
              <time
                className="text-sm text-muted-foreground"
                dateTime={e.created_at}
              >
                {dates.format(new Date(e.created_at))}
              </time>
            </div>
            <p className="text-sm">
              {e.revision && `Revisión ${e.revision} · `}
              {states[e.entity][e.status] ?? e.status}
              {e.amount !== null && ` · ${usd(e.amount)}`}
            </p>
            {e.document_date && (
              <p className="text-sm text-muted-foreground">
                Fecha del registro: {e.document_date}
              </p>
            )}
            <p className="text-xs break-all">
              Autor: {e.actor_id ?? "Sistema"}
            </p>
            {e.changed_fields.length > 0 && (
              <p className="text-sm">
                Campos modificados:{" "}
                {e.changed_fields.map((k) => historyFields[k] ?? k).join(", ")}
              </p>
            )}
            {e.reason && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {e.reason}
              </p>
            )}
            <Link
              className="inline-block text-sm text-primary underline"
              href={`/app/${companyId}/historial/${e.entity}/${e.record_id}`}
            >
              Ver historial del registro
            </Link>
          </li>
        ))}
      </ol>
      {!history.rows.length && (
        <p className="card">
          No hay cambios autorizados en esta parte del historial.
        </p>
      )}
      <nav
        className="flex flex-wrap gap-5 text-sm"
        aria-label="Paginación del historial"
      >
        {before && (
          <Link className="underline" href={`${base}#expediente`}>
            Más recientes
          </Link>
        )}
        {history.next_before && (
          <Link
            className="underline"
            href={`${base}&before=${history.next_before}#expediente`}
          >
            Cambios anteriores
          </Link>
        )}
      </nav>
    </>
  );
}
