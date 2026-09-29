import { z } from "zod";

export function historyCursor(value?: string) {
  return value &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
    ? value
    : null;
}
export const customerHistorySchema = z.object({
  next_before: z
    .string()
    .refine((v) => historyCursor(v) === v)
    .nullable(),
  rows: z
    .array(
      z.object({
        id: z.string().refine((v) => historyCursor(v) === v),
        entity: z.enum([
          "customers",
          "estimates",
          "invoices",
          "projects",
          "payments",
          "expenses",
        ]),
        record_id: z.uuid(),
        record_label: z.string(),
        operation: z.enum(["INSERT", "UPDATE"]),
        created_at: z.iso.datetime({ offset: true }),
        actor_id: z.uuid().nullable(),
        revision: z.string().regex(/^\d+$/).nullable(),
        status: z.string(),
        document_date: z.iso.date().nullable(),
        amount: z
          .string()
          .regex(/^\d+\.\d{2}$/)
          .nullable(),
        reason: z.string(),
        changed_fields: z.array(z.string()),
      }),
    )
    .max(30),
});
export type CustomerHistoryResult = z.infer<typeof customerHistorySchema>;
export const historyEntities = {
  customers: "Cliente",
  estimates: "Estimado",
  invoices: "Factura",
  projects: "Proyecto",
  payments: "Pago",
  expenses: "Gasto",
} as const;
export const historyFields: Record<string, string> = {
  full_name: "Nombre",
  email: "Correo",
  phone: "Teléfono",
  address: "Dirección",
  city: "Ciudad",
  postal_code: "Código postal",
  service: "Servicio",
  client_date: "Fecha del cliente",
  notes: "Notas",
  status: "Estado",
  estimate_date: "Fecha del estimado",
  valid_until: "Validez",
  items: "Partidas",
  subtotal: "Subtotal",
  discount: "Descuento",
  taxes: "Impuestos",
  total: "Total",
  invoice_date: "Fecha de factura",
  due_date: "Vencimiento",
  paid_amount: "Pagado",
  balance_due: "Saldo",
  payment_status: "Estado de pago",
  void_reason: "Motivo de anulación",
  name: "Nombre",
  project_date: "Fecha del proyecto",
  start_date: "Inicio",
  end_date: "Finalización",
  payment_date: "Fecha del pago",
  amount: "Importe",
  method: "Método",
  reference: "Referencia",
  expense_date: "Fecha del gasto",
  category: "Categoría",
  description: "Descripción",
  vendor: "Proveedor",
  document_number: "Número de documento",
  reimbursement_status: "Reembolso",
  decision_note: "Nota de revisión",
  receipt_path: "Comprobante",
};
