import { z } from "zod";
export const historicalKinds = [
  "clients",
  "projects",
  "invoices",
  "payments",
] as const;
export type HistoricalKind = (typeof historicalKinds)[number];
export const historicalKindSchema = z.enum(historicalKinds);
export const historicalSections = {
  clients: { label: "Clientes", module: "clientes", current: "clientes" },
  projects: {
    label: "Proyectos",
    module: "fin-proyectos",
    current: "proyectos",
  },
  invoices: { label: "Facturas", module: "fin-invoices", current: "facturas" },
  payments: { label: "Pagos", module: "fin-invoices", current: "facturas" },
} as const;
export const historicalFields = {
  email: "Correo",
  phone: "Teléfono",
  address: "Dirección",
  city: "Ciudad",
  postal_code: "Código postal",
  service: "Servicio",
  paid_cents: "Pagado guardado",
  balance_cents: "Saldo guardado",
  payment_status: "Estado de pago original",
  method: "Método",
  reference: "Referencia",
  void_reason: "Motivo de anulación",
  applied_cents: "Suma de pagos aplicados",
  paid_difference_cents: "Diferencia con pagado guardado",
  balance_difference_cents: "Diferencia con saldo guardado",
} as const;
const cents = z
  .string()
  .regex(/^-?\d{1,16}$/)
  .nullable();
export const historicalBusinessSchema = z
  .object({
    title: z.string().max(500),
    original_date: z.string().max(100),
    original_status: z.string().max(100),
    customer_name: z.string().max(500),
    amount_cents: cents,
    details: z
      .object({
        email: z.string().max(2000).optional(),
        phone: z.string().max(2000).optional(),
        address: z.string().max(2000).optional(),
        city: z.string().max(2000).optional(),
        postal_code: z.string().max(2000).optional(),
        service: z.string().max(2000).optional(),
        paid_cents: cents.optional(),
        balance_cents: cents.optional(),
        payment_status: z.string().max(2000).optional(),
        method: z.string().max(2000).optional(),
        reference: z.string().max(2000).optional(),
        void_reason: z.string().max(2000).optional(),
        applied_cents: cents.optional(),
        paid_difference_cents: cents.optional(),
        balance_difference_cents: cents.optional(),
      })
      .strict(),
    review_reasons: z.array(z.string().max(100)).max(100),
  })
  .strict();
export type HistoricalBusiness = z.infer<typeof historicalBusinessSchema>;
// Derive a display-only comparison. The stored projection and original remain
// immutable; a void invoice's expected balance is zero, not total minus paid.
export function historicalBusinessForDisplay(
  record: HistoricalBusiness,
): HistoricalBusiness {
  if (record.original_status !== "VOID" || record.details.balance_cents == null)
    return record;
  const balance = BigInt(record.details.balance_cents),
    reasons = record.review_reasons.filter((r) => r !== "balance_mismatch");
  if (balance !== 0n) reasons.push("balance_mismatch");
  if (
    record.details.applied_cents != null &&
    BigInt(record.details.applied_cents) > 0n
  )
    reasons.push("void_applied_payments");
  return {
    ...record,
    details: {
      ...record.details,
      balance_difference_cents: (-balance).toString(),
    },
    review_reasons: [...new Set(reasons)],
  };
}
export function historicalBusinessReview(reason: string) {
  if (reason === "paid_mismatch")
    return "El pagado guardado difiere de la suma de pagos aplicados del respaldo.";
  if (reason === "balance_mismatch")
    return "El saldo guardado difiere del saldo esperado para el estado original de la factura.";
  if (reason === "void_applied_payments")
    return "La factura está anulada pero conserva pagos aplicados que requieren revisión.";
  if (reason === "unknown_payment_status")
    return "Hay pagos con un estado que necesita revisión antes de conciliar.";
  if (reason === "invalid_money")
    return "Hay un importe que no puede interpretarse como centavos exactos.";
  if (reason === "source_client_warning")
    return "El cliente tenía una advertencia en el sistema de origen.";
  return "Hay una referencia de origen pendiente de comprobar.";
}
