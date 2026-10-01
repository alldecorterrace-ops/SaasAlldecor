"use client";
import {
  defaultPaymentTerms,
  paymentSchedule,
  paymentStageLabels,
  type PaymentTermsInput,
} from "@/lib/payment-terms";
import { Input } from "./ui/input";
export function PaymentTermsEditor({
  value,
  total,
  readOnly,
  onChange,
}: {
  value: PaymentTermsInput | null | undefined;
  total: string | null;
  readOnly: boolean;
  onChange: (value: PaymentTermsInput | null) => void;
}) {
  let amounts: string[] = [];
  let error = "";
  if (value && total) {
    try {
      amounts = paymentSchedule(total, value.percentages);
    } catch (e) {
      error = e instanceof Error ? e.message : "Revisa el calendario de pagos.";
    }
  }
  return (
    <fieldset disabled={readOnly} className="card space-y-5 min-w-0">
      <legend className="font-semibold">Condiciones comerciales</legend>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) =>
            onChange(e.target.checked ? defaultPaymentTerms() : null)
          }
        />
        Incluir calendario y condiciones en esta revisión
      </label>
      {!value && (
        <p className="text-sm text-muted-foreground">
          Esta revisión no tiene calendario guardado.
        </p>
      )}
      {value && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {paymentStageLabels.map((label, i) => (
              <label className="field" key={label}>
                {label} (%)
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  required
                  value={value.percentages[i]}
                  onChange={(e) => {
                    const percentages = [
                      ...value.percentages,
                    ] as PaymentTermsInput["percentages"];
                    percentages[i] = e.target.value;
                    onChange({ ...value, percentages });
                  }}
                />
                {amounts[i] && <span className="text-sm">${amounts[i]}</span>}
              </label>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <label className="field">
            Entrega prevista
            <Input
              type="date"
              value={value.delivery_date ?? ""}
              onChange={(e) =>
                onChange({ ...value, delivery_date: e.target.value || null })
              }
            />
          </label>
          <label className="field">
            Condiciones particulares
            <textarea
              rows={4}
              maxLength={10000}
              value={value.conditions}
              onChange={(e) =>
                onChange({ ...value, conditions: e.target.value })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Los cuatro porcentajes deben sumar 100%. La última etapa absorbe el
            redondeo. El calendario y las condiciones se conservan con la
            revisión; los abonos se registran en la factura.
          </p>
        </>
      )}
    </fieldset>
  );
}
