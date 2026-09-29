import { z } from "zod";

const money = z.string().regex(/^\d+\.\d{2}$/);
export const customerLedgerSchema = z.object({
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  total: money,
  approved: money,
  pending: money,
  rejected: money,
  rows: z
    .array(
      z.object({
        id: z.uuid(),
        date: z.iso.date(),
        amount: money,
        status: z.enum([
          "REGISTRADO",
          "ANULADO",
          "PENDIENTE",
          "APROBADO",
          "RECHAZADO",
        ]),
        method: z.enum([
          "EFECTIVO",
          "CHEQUE",
          "TRANSFERENCIA",
          "TARJETA_EXTERNA",
          "OTRO",
        ]),
        reference: z.string(),
        description: z.string(),
        vendor: z.string(),
        document_number: z.string(),
        reimbursement_status: z.enum(["NO_APLICA", "PENDIENTE", "REEMBOLSADO"]),
        category: z.string(),
        parent_id: z.uuid(),
        parent_label: z.string(),
        has_receipt: z.boolean(),
      }),
    )
    .max(20),
});
export type CustomerLedgerResult = z.infer<typeof customerLedgerSchema>;
