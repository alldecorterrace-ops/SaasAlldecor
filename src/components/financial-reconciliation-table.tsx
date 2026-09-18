import Link from "next/link";
import { historicalMoney } from "@/lib/historical-estimates";
import {
  financialReconciliationLabels,
  type reconcileHistoricalFinance,
} from "@/lib/financial-reconciliation";
type Row = ReturnType<typeof reconcileHistoricalFinance>["rows"][number];
export function FinancialReconciliationTable({
  rows,
  companyId,
}: {
  rows: Row[];
  companyId: string;
}) {
  return (
    <div className="card overflow-x-auto">
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th>Factura histórica</th>
              <th>Total</th>
              <th>Pagado guardado / aplicado</th>
              <th>Saldo guardado / esperado</th>
              <th>Pagos</th>
              <th>Revisión</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link
                    className="font-semibold text-primary underline"
                    href={`/app/${companyId}/historico/invoices/${r.id}`}
                  >
                    {r.title}
                  </Link>
                  <p>{r.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.date} · {r.status}
                  </p>
                </td>
                <td className="whitespace-nowrap">
                  {historicalMoney(r.total)}
                </td>
                <td className="whitespace-nowrap">
                  <p>Guardado: {historicalMoney(r.storedPaid)}</p>
                  <p>Aplicado: {historicalMoney(r.applied)}</p>
                  <p className="text-xs">
                    Diferencia: {historicalMoney(r.paidDifference)}
                  </p>
                </td>
                <td className="whitespace-nowrap">
                  <p>Guardado: {historicalMoney(r.storedBalance)}</p>
                  <p>Esperado: {historicalMoney(r.expectedBalance)}</p>
                  <p className="text-xs">
                    Diferencia: {historicalMoney(r.balanceDifference)}
                  </p>
                </td>
                <td>
                  <p>{r.appliedCount} aplicados</p>
                  <p>{r.excludedCount} excluidos por estado</p>
                  {!!r.associatedCount && (
                    <p className="text-xs mt-1">
                      {r.associatedCount} asociados a anulación:{" "}
                      {historicalMoney(r.associated)}
                    </p>
                  )}
                  {!!r.voidCount && (
                    <p className="text-xs">{r.voidCount} anulados</p>
                  )}
                  <Link
                    className="text-primary underline"
                    href={`/app/${companyId}/historico/payments?invoice=${r.id}`}
                  >
                    Ver {r.paymentCount} pagos
                  </Link>
                </td>
                <td className="min-w-72">
                  {r.retainedVoidAmounts && (
                    <div className="mb-3 rounded-md bg-muted p-3 text-xs">
                      <p className="font-semibold">
                        Importes conservados al anular
                      </p>
                      <p className="mt-1">
                        El pagado guardado coincide con los pagos asociados a la
                        anulación; el saldo guardado coincide con total menos
                        ese pagado. ADT conserva estos importes al anular la
                        factura. Las diferencias siguen pendientes de revisión;
                        estos pagos no son cobros actuales ni acreditan una
                        devolución.
                      </p>
                    </div>
                  )}
                  <p
                    className={
                      r.arithmeticIssues.length
                        ? "font-semibold text-amber-800"
                        : "font-semibold"
                    }
                  >
                    {r.arithmeticIssues.length
                      ? "Revisar importes"
                      : "Sin diferencias numéricas"}
                  </p>
                  {[
                    ["Importes", r.arithmeticIssues],
                    ["Datos", r.dataIssues],
                    ["Dependencias", r.dependencyIssues],
                  ].map(([label, issues]) =>
                    (issues as string[]).length ? (
                      <div className="mt-2" key={label as string}>
                        <p className="text-xs font-semibold">
                          {label as string}
                        </p>
                        <ul className="list-disc pl-4 text-xs space-y-1">
                          {(issues as string[]).map((issue) => (
                            <li key={issue}>
                              {financialReconciliationLabels[issue] ??
                                "Revisión pendiente."}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No hay facturas en esta vista.</p>
      )}
    </div>
  );
}
