import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { todayInTimezone } from "@/lib/commercial";
import { paymentMethods, paymentStatuses, usd } from "@/lib/finance";
import { FinanceForm } from "@/components/finance-form";
import { DocumentLines } from "@/components/document-lines";
import { PrintButton } from "@/components/print-button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/list-pagination";
export default async function Invoice({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; invoiceId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { companyId, invoiceId } = await params;
  if (!uuid.safeParse(invoiceId).success) notFound();
  const { db, member, company } = await requireModule(
      companyId,
      "fin-invoices",
    ),
    s = await searchParams,
    page = Math.max(1, Math.min(100000, parseInt(s.page ?? "1") || 1));
  const { data: i, error } = await db
    .from("invoices")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar la factura.");
  if (!i) notFound();
  const {
    data: payments,
    count,
    error: paymentError,
  } = await db
    .from("payments")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 20, page * 20 - 1);
  if (paymentError) throw new Error("No se pudieron cargar los pagos.");
  const write = canAccess(member, "fin-invoices", "write"),
    editable = write && i.status === "OPEN",
    base = { companyId, id: invoiceId, version: i.version };
  return (
    <>
      <div className="print:hidden flex flex-wrap gap-4 mb-6">
        <PrintButton />
        <Link className="underline" href={`/app/${companyId}/facturas`}>
          Todas las facturas
        </Link>
        <Link
          className="underline print:hidden"
          href={`/app/${companyId}/historial/invoices/${invoiceId}`}
        >
          Historial de cambios
        </Link>
        {canAccess(member, "fin-estimados") && (
          <Link
            className="underline"
            href={`/app/${companyId}/estimados/${i.estimate_id}`}
          >
            Estimado de origen
          </Link>
        )}
        {canAccess(member, "fin-proyectos") && (
          <Link
            className="underline"
            href={`/app/${companyId}/proyectos/${i.project_id}`}
          >
            Ver proyecto
          </Link>
        )}
      </div>
      <article className="space-y-6">
        <header className="card">
          <p className="eyebrow">{company.name} · USD</p>
          <h1 className="page-title mt-2">Factura {i.number}</h1>
          <p className="mt-3">{i.customer_snapshot.full_name}</p>
          <p className="text-sm">
            {[
              i.customer_snapshot.address,
              i.customer_snapshot.city,
              i.customer_snapshot.postal_code,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          <p className="text-sm">
            {i.customer_snapshot.email} {i.customer_snapshot.phone}
          </p>
          <p className="mt-4">
            Fecha: {i.invoice_date} · Vence: {i.due_date ?? "Sin fecha"}
          </p>
          <p className="font-semibold mt-2">
            {paymentStatuses[i.payment_status as keyof typeof paymentStatuses]}{" "}
            · Pagado: {usd(i.paid_amount)} · Saldo: {usd(i.balance_due)}
          </p>
          {i.status === "VOID" && (
            <p className="text-red-700 mt-2">Anulación: {i.void_reason}</p>
          )}
          <p className="whitespace-pre-wrap mt-3">{i.notes}</p>
        </header>
        <DocumentLines
          items={i.items}
          subtotal={i.subtotal}
          discount={i.discount}
          taxes={i.taxes}
          total={i.total}
        />
        <section className="card print:hidden">
          <h2 className="font-semibold mb-3">
            Constancia de aprobación registrada por oficina
          </h2>
          <p className="whitespace-pre-wrap text-sm">{i.approval_note}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Origen: revisión {i.estimate_version} del estimado. No equivale a
            firma electrónica del cliente.
          </p>
        </section>
        <section className="card overflow-x-auto">
          <h2 className="font-semibold mb-4">Pagos registrados</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Registro administrativo de pagos recibidos. Esta pantalla no cobra
            tarjetas ni realiza transferencias o reembolsos.
          </p>
          {payments?.length ? (
            <table>
              <thead>
                <tr>
                  <th>Fecha / método</th>
                  <th>Importe</th>
                  <th>Referencia y notas</th>
                  <th>Estado</th>
                  {write && <th className="print:hidden">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.payment_date}
                      <p>
                        {
                          paymentMethods[
                            p.method as keyof typeof paymentMethods
                          ]
                        }
                      </p>
                    </td>
                    <td>{usd(p.amount)}</td>
                    <td>
                      {p.reference}
                      <p className="whitespace-pre-wrap">{p.notes}</p>
                    </td>
                    <td>
                      {p.status === "VOID"
                        ? `Revertido: ${p.void_reason}`
                        : "Aplicado"}
                    </td>
                    {write && (
                      <td className="print:hidden">
                        {p.status === "APPLIED" && (
                          <details>
                            <summary className="cursor-pointer underline">
                              Revertir registro
                            </summary>
                            <FinanceForm
                              key={`${p.id}:${p.version}`}
                              companyId={companyId}
                              id={p.id}
                              version={p.version}
                              operation="void-payment"
                              label="Guardar reversión"
                            >
                              <label className="field">
                                Motivo
                                <Input
                                  name="reason"
                                  required
                                  minLength={3}
                                  maxLength={2000}
                                />
                              </label>
                            </FinanceForm>
                          </details>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Aún no hay pagos registrados.</p>
          )}
          <div className="print:hidden">
            <ListPagination
              path={`/app/${companyId}/facturas/${invoiceId}`}
              page={page}
              count={count ?? 0}
              query={{}}
            />
          </div>
          {(count ?? 0) > 20 && (
            <p className="text-sm">
              Se muestran los pagos de esta página. El saldo incluye todos los
              pagos aplicados.
            </p>
          )}
        </section>
        {editable && (
          <div className="print:hidden grid gap-6 lg:grid-cols-2">
            {Number(i.balance_due) > 0 && (
              <section className="card">
                <h2 className="font-semibold mb-5">Registrar pago recibido</h2>
                <FinanceForm
                  key={`payment:${i.version}`}
                  {...base}
                  operation="payment"
                  label="Registrar pago"
                >
                  <input type="hidden" name="payment_id" value={randomUUID()} />
                  <label className="field">
                    Importe USD
                    <Input
                      name="amount"
                      inputMode="decimal"
                      pattern="[0-9]{1,12}([.][0-9]{1,2})?"
                      required
                    />
                  </label>
                  <label className="field">
                    Fecha de recepción
                    <Input
                      name="payment_date"
                      type="date"
                      defaultValue={todayInTimezone(company.timezone)}
                      required
                    />
                  </label>
                  <label className="field">
                    Método
                    <select name="method">
                      {Object.entries(paymentMethods).map(([k, v]) => (
                        <option value={k} key={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Referencia
                    <Input name="reference" maxLength={255} />
                  </label>
                  <label className="field">
                    Notas
                    <textarea name="notes" maxLength={2000} />
                  </label>
                </FinanceForm>
              </section>
            )}
            <section className="card">
              <h2 className="font-semibold mb-5">Fechas y notas</h2>
              <FinanceForm
                key={`invoice:${i.version}`}
                {...base}
                operation="invoice"
                label="Guardar cambios"
              >
                <label className="field">
                  Fecha
                  <Input
                    name="date"
                    type="date"
                    defaultValue={i.invoice_date}
                    required
                  />
                </label>
                <label className="field">
                  Vencimiento
                  <Input
                    name="due"
                    type="date"
                    defaultValue={i.due_date ?? ""}
                  />
                </label>
                <label className="field">
                  Notas
                  <textarea
                    name="notes"
                    defaultValue={i.notes}
                    maxLength={10000}
                  />
                </label>
              </FinanceForm>
            </section>
            <section className="card">
              <details>
                <summary className="font-semibold cursor-pointer">
                  Anular factura
                </summary>
                <p className="text-sm my-3">
                  Conserva el documento y sus registros. Si tiene pagos
                  aplicados, primero deben revertirse sus registros con el
                  motivo correspondiente.
                </p>
                <FinanceForm
                  key={`void:${i.version}`}
                  {...base}
                  operation="void-invoice"
                  label="Anular factura"
                >
                  <input type="hidden" name="date" value={i.invoice_date} />
                  <input type="hidden" name="due" value={i.due_date ?? ""} />
                  <input type="hidden" name="notes" value={i.notes} />
                  <label className="field">
                    Motivo
                    <Input
                      name="reason"
                      minLength={3}
                      maxLength={2000}
                      required
                    />
                  </label>
                </FinanceForm>
              </details>
            </section>
          </div>
        )}
      </article>
    </>
  );
}
