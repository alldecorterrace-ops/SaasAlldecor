import Link from "next/link";
import { usd } from "@/lib/finance";
import {
  expenseStatuses,
  reimbursements,
  expenseMethods,
} from "@/lib/operations";
import type { CustomerLedgerResult } from "@/lib/customer-ledger";

export function CustomerLedger({
  companyId,
  kind,
  ledger,
}: {
  companyId: string;
  kind: "pagos" | "gastos";
  ledger: CustomerLedgerResult;
}) {
  const payments = kind === "pagos";
  return (
    <>
      <div className="card space-y-2">
        <p className="font-semibold">
          {payments ? "Total pagado" : "Total registrado"}: {usd(ledger.total)}
        </p>
        <p className="text-sm text-muted-foreground">
          {payments
            ? "Todos los pagos registrados en las facturas de esta ficha. Los anulados se conservan en el listado y no suman al total."
            : "Gastos vinculados a los proyectos de esta ficha, sin anulados. El total registrado no acredita pago ni reembolso; no incluye gastos sin proyecto ni costos de horas calculados."}
        </p>
        {!payments && (
          <p className="text-sm">
            Aprobados: {usd(ledger.approved)} · Pendientes:{" "}
            {usd(ledger.pending)} · Rechazados: {usd(ledger.rejected)}
          </p>
        )}
      </div>
      {ledger.rows.length ? (
        <div className="card overflow-x-auto p-0">
          <table
            aria-label={
              payments ? "Pagos del cliente" : "Gastos de proyectos del cliente"
            }
          >
            <thead>
              <tr>
                <th>Fecha</th>
                <th>{payments ? "Factura" : "Gasto / proyecto"}</th>
                <th>Importe</th>
                <th>Estado</th>
                <th>Método</th>
                <th>
                  {payments
                    ? "Referencia / notas"
                    : "Proveedor / documento / reembolso"}
                </th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>
                    {payments ? (
                      <Link
                        className="font-semibold text-primary hover:underline"
                        href={`/app/${companyId}/facturas/${r.parent_id}`}
                      >
                        {r.parent_label}
                      </Link>
                    ) : (
                      <>
                        <Link
                          className="font-semibold text-primary hover:underline"
                          href={`/app/${companyId}/gastos/${r.id}`}
                        >
                          {r.category}
                          {r.has_receipt ? " · Ver comprobante" : ""}
                        </Link>
                        <Link
                          className="mt-1 block text-sm text-primary hover:underline"
                          href={`/app/${companyId}/proyectos/${r.parent_id}`}
                        >
                          {r.parent_label}
                        </Link>
                        {r.description && (
                          <p className="mt-1 max-w-sm whitespace-pre-wrap break-words text-sm">
                            {r.description}
                          </p>
                        )}
                      </>
                    )}
                  </td>
                  <td>{usd(r.amount)}</td>
                  <td>
                    {r.status === "REGISTRADO"
                      ? "Registrado"
                      : expenseStatuses[r.status]}
                  </td>
                  <td>{expenseMethods[r.method]}</td>
                  <td className="max-w-sm whitespace-pre-wrap break-words">
                    {payments ? (
                      <>
                        {r.reference || "Sin referencia"}
                        {r.description && (
                          <p className="mt-1 text-sm">{r.description}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p>{r.vendor || "Sin proveedor"}</p>
                        <p>{r.document_number || "Sin número de documento"}</p>
                        <p>{reimbursements[r.reimbursement_status]}</p>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="card">
          {payments
            ? "No hay pagos vinculados a las facturas de este cliente."
            : "No hay gastos vinculados a los proyectos de este cliente."}
        </p>
      )}
    </>
  );
}
