import { storedPaymentTerms, paymentStageLabels } from "@/lib/payment-terms";
import { usd } from "@/lib/finance";
export function PaymentTermsSummary({ terms }: { terms: unknown }) {
  if (terms == null) return null;
  const value = storedPaymentTerms.parse(terms);
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Calendario de pagos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {paymentStageLabels.map((label, i) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <p className="font-semibold">{value.percentages[i]}%</p>
            <p className="text-sm">{label}</p>
            <p className="mt-2 font-semibold">{usd(value.amounts[i])}</p>
          </div>
        ))}
      </div>
      {value.delivery_date && <p>Entrega prevista: {value.delivery_date}</p>}
      {value.conditions && (
        <div>
          <h3 className="font-semibold">Condiciones particulares</h3>
          <p className="mt-2 whitespace-pre-wrap">{value.conditions}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        El calendario corresponde a esta revisión guardada. No acredita pagos
        recibidos.
      </p>
    </section>
  );
}
