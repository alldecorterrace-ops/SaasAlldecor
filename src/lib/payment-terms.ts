import { z } from "zod";
const percent = z
  .string()
  .regex(
    /^\d{1,3}(\.\d{1,2})?$/,
    "Usa un porcentaje entre 0 y 100 con hasta dos decimales.",
  );
function basisPoints(value: string) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value))
    throw new Error("invalid_payment_percentages");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(2, "0"));
}
export const paymentPercentages = z
  .tuple([percent, percent, percent, percent])
  .refine(
    (values) =>
      values.every(
        (v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && basisPoints(v) <= 10000n,
      ) && values.reduce((s, v) => s + basisPoints(v), 0n) === 10000n,
    "Los cuatro porcentajes deben sumar 100%.",
  );
export const paymentTermsInput = z.object({
  percentages: paymentPercentages,
  delivery_date: z.iso.date().nullable(),
  conditions: z.string().max(10000),
});
const amount = z.string().regex(/^\d{1,12}\.\d{2}$/);
export const storedPaymentTerms = paymentTermsInput.extend({
  amounts: z.tuple([amount, amount, amount, amount]),
});
export type PaymentTermsInput = z.infer<typeof paymentTermsInput>;
export const paymentStageLabels = [
  "Depósito al aceptar",
  "Al agendar inicio",
  "Al 80% de avance",
  "Al finalizar",
] as const;
export function defaultPaymentTerms(): PaymentTermsInput {
  return {
    percentages: ["10", "50", "30", "10"],
    delivery_date: null,
    conditions: "",
  };
}
export function paymentSchedule(
  total: string,
  percentages: PaymentTermsInput["percentages"],
) {
  paymentPercentages.parse(percentages);
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(total))
    throw new Error("invalid_schedule_total");
  const [whole, fraction = ""] = total.split(".");
  const cents = BigInt(whole + fraction.padEnd(2, "0"));
  const amounts = percentages.map(
    (p) => (cents * basisPoints(p) + 5000n) / 10000n,
  );
  amounts[3] = cents - amounts[0] - amounts[1] - amounts[2];
  if (amounts[3] < 0n)
    throw new Error(
      "El redondeo del calendario supera el total. Revisa los porcentajes.",
    );
  return amounts.map(
    (n) => `${n / 100n}.${String(n % 100n).padStart(2, "0")}`,
  ) as [string, string, string, string];
}
