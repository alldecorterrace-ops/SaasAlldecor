import { randomUUID } from "node:crypto";
import { WorkforceReceiptReviewForm } from "./workforce-receipt-review-form";
export { receiptReviewHistorySchema } from "@/lib/receipt-review";
import type { ReceiptReviewHistory } from "@/lib/receipt-review";
const errors: Record<string, string> = {
  provider_unavailable: "El proveedor no respondió. El error quedó registrado.",
  invalid_extraction: "El proveedor no devolvió datos completos y válidos.",
  receipt_unavailable: "No se pudo comprobar el recibo privado.",
  receipt_mismatch: "El archivo no coincide con el recibo registrado.",
  heic_conversion_required:
    "La conversión HEIC/HEIF aún requiere comprobación. Conserva el original.",
  review_timeout: "El análisis excedió su tiempo de ejecución.",
  expense_changed: "El gasto cambió durante el análisis.",
  expense_or_access_changed: "Cambió el gasto, el acceso o venció el análisis.",
  workday_changed: "Las horas de la jornada cambiaron durante el análisis.",
};
export function WorkforceReceiptReview({
  company,
  id,
  version,
  expenseStatus,
  reviewed,
  attention,
  history,
  canReview,
  available,
  timezone,
  observedAt,
}: {
  company: string;
  id: string;
  version: number;
  expenseStatus: string;
  reviewed: boolean;
  attention: string | null;
  history: ReceiptReviewHistory;
  canReview: boolean;
  available: boolean;
  timezone: string;
  observedAt: string;
}) {
  const current = history.find((j) => j.current),
    running =
      current?.status === "RUNNING" &&
      new Date(current.lease_until).getTime() > new Date(observedAt).getTime();
  const eligible = [
    "SUBMITTED",
    "FOREMAN_APPROVED",
    "OFFICE_APPROVED",
  ].includes(expenseStatus);
  const date = new Intl.DateTimeFormat("es", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const money = new Intl.NumberFormat("es-US", {
    style: "currency",
    currency: "USD",
  });
  return (
    <section className="border-t mt-4 pt-4 min-w-0">
      <h3 className="font-semibold">Revisión del recibo</h3>
      <p className="text-sm mt-2">
        El análisis compara el recibo con el gasto y las obras de la jornada. La
        confirmación humana se registra por separado; no aprueba ni paga el
        gasto.
      </p>
      {attention === "ADMIN_CORRECTION" && (
        <p role="status" className="mt-2 font-medium">
          Administración debe corregir este gasto. Ya se utilizó el reenvío del
          trabajador.
        </p>
      )}
      {current?.status === "DONE" && current.result && (
        <p className="mt-2 font-medium">
          Resultado vigente: {current.result.state} · {current.result.note}
        </p>
      )}
      {running && (
        <p role="status" className="mt-2">
          Procesando el recibo. Actualiza esta página para consultar el
          resultado; volver a enviar no inicia otro análisis.
        </p>
      )}
      {current?.status === "RUNNING" && !running && (
        <p className="mt-2">
          El tiempo de análisis venció. Administración puede registrar un nuevo
          intento; el anterior se conservará.
        </p>
      )}
      {!history.length && (
        <p className="text-sm mt-2">
          Este recibo todavía no tiene un análisis registrado.
        </p>
      )}
      {canReview && eligible && current?.status !== "DONE" && !running && (
        <>
          {!available && (
            <p className="text-sm mt-2">
              No hay un proveedor de IA habilitado para esta empresa.
            </p>
          )}
          <WorkforceReceiptReviewForm
            key={`analyze:${id}:${version}`}
            company={company}
            id={id}
            version={version}
            request={randomUUID()}
            mode="analyze"
            available={available}
          />
        </>
      )}
      {canReview && eligible && !reviewed && current?.status === "DONE" && (
        <WorkforceReceiptReviewForm
          key={`confirm:${id}:${version}`}
          company={company}
          id={id}
          version={version}
          request={randomUUID()}
          mode="confirm"
          job={current.id}
        />
      )}
      {history.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-semibold">
            Historial de análisis ({history.length})
          </summary>
          <ol className="space-y-4 mt-3">
            {history.map((j) => (
              <li key={j.id} className="border rounded-md p-3 min-w-0">
                <p className="font-medium">
                  {date.format(new Date(j.created_at))} ·{" "}
                  {j.status === "RUNNING"
                    ? "Procesando"
                    : j.status === "DONE"
                      ? "Finalizado"
                      : j.status === "STALE"
                        ? "Sin vigencia"
                        : "Error"}{" "}
                  · {j.current ? "Recibo actual" : "Revisión anterior"}
                </p>
                {j.provider && (
                  <p className="text-sm">
                    {j.provider === "synthetic-reference"
                      ? "Prueba de reglas; sin proveedor de IA"
                      : `Proveedor: ${j.provider} · ${j.model}`}
                  </p>
                )}
                {j.result && (
                  <>
                    <p>
                      {j.result.state} · {j.result.note}
                    </p>
                    <p className="text-sm">
                      Comercio: {j.result.merchant || "Sin identificar"} ·
                      Fecha: {j.result.date || "Sin identificar"} · Total:{" "}
                      {j.result.total === null
                        ? "Sin identificar"
                        : money.format(j.result.total)}{" "}
                      · Moneda: {j.result.currency || "Sin identificar"}
                    </p>
                    <p className="text-sm">
                      Número: {j.result.invoice || "Sin identificar"} · Método:{" "}
                      {j.result.payment_method || "Sin identificar"}
                      {j.result.card_last4
                        ? ` · Tarjeta terminada en ${j.result.card_last4}`
                        : ""}
                    </p>
                    <p className="text-sm">
                      Obras de la jornada:{" "}
                      {j.result.expected_projects || "Sin horas conciliadas"}
                    </p>
                    {j.result.duplicate_of && (
                      <p className="text-sm">
                        Posible duplicado de otro gasto. Revisa ambos
                        comprobantes antes de continuar.
                      </p>
                    )}
                  </>
                )}
                {j.error_code && (
                  <p className="text-sm">
                    {errors[j.error_code] ??
                      "La revisión necesita una comprobación."}
                  </p>
                )}
                <a
                  className="underline text-sm"
                  href={`/api/workforce/${company}/expenses/${id}/receipt?version=${j.receipt_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir el comprobante de esta revisión
                </a>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer">
                    Datos de trazabilidad
                  </summary>
                  <p className="break-all">
                    Revisión {j.id} · Versión del gasto {j.expense_version} ·{" "}
                    {j.prompt_version}
                  </p>
                  <p className="break-all">
                    Huella del recibo: {j.receipt_sha256}
                  </p>
                  <p className="break-all">
                    Cuenta que solicitó la revisión: {j.actor_id}
                  </p>
                  {j.completed_at && (
                    <p>Finalizó: {date.format(new Date(j.completed_at))}</p>
                  )}
                </details>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
