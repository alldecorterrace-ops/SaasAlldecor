import { z } from "zod";

const cents = z
  .string()
  .regex(/^-?\d{1,16}$/)
  .nullable();
export const historicalEstimateSchema = z
  .object({
    number: z.string().max(200),
    original_date: z.string().max(100),
    original_status: z.string().max(100),
    customer_name: z.string().max(500),
    total_cents: cents,
    discount_cents: cents,
    taxes_cents: cents,
    difference_cents: cents,
    detail_state: z.enum(["saved_lines", "unavailable_in_reviewed_sources"]),
    review_reasons: z.array(z.string().max(100)).max(100),
    lines: z
      .array(
        z
          .object({
            description: z.string().max(2000),
            specification: z.string().max(4000),
            amount_cents: cents,
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type HistoricalEstimate = z.infer<typeof historicalEstimateSchema>;

// Preserve exact cents above Number.MAX_SAFE_INTEGER; never reprice a document.
export function historicalMoney(value: string | null) {
  if (value === null || !/^-?\d{1,16}$/.test(value)) return "No disponible";
  const n = BigInt(value),
    absolute = n < 0n ? -n : n;
  const whole = (absolute / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0n ? "−" : ""}$${whole}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
export function historicalReviewLabel(code: string) {
  if (code === "missing_effective_items")
    return "No hay desglose en las fuentes revisadas.";
  if (code === "historical_total_mismatch")
    return "La suma de las partidas difiere del total original; ambos se conservan.";
  if (code === "invalid_item_amount" || code === "invalid_document_amount")
    return "Hay un importe de origen que necesita revisión.";
  if (code === "invalid_or_missing_source_json")
    return "El detalle de origen necesita revisión.";
  if (code.startsWith("out_of_scope:"))
    return "Hay una referencia histórica pendiente de comprobar.";
  return "Hay datos de origen pendientes de revisión.";
}
