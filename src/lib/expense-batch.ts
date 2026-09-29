import { z } from "zod";
import { expenseMethods } from "./operations";
export const expenseBatchRowSchema = z
  .object({
    id: z.uuid(),
    receipt_id: z.uuid().optional(),
    project_id: z.uuid().nullable(),
    worker_id: z.uuid().nullable(),
    expense_date: z.iso.date(),
    category: z.string().trim().min(1).max(64),
    description: z.string().trim().max(500),
    vendor: z.string().trim().max(190),
    document_number: z.string().trim().max(100),
    amount: z
      .string()
      .regex(/^\d{1,8}(\.\d{1,2})?$/)
      .refine((v) => Number(v) > 0 && Number(v) <= 10000000),
    method: z.enum(
      Object.keys(expenseMethods) as [
        keyof typeof expenseMethods,
        ...Array<keyof typeof expenseMethods>,
      ],
    ),
    payer: z.enum(["EMPRESA", "EFECTIVO_EMPRESA", "TRABAJADOR"]),
  })
  .refine((r) => r.payer !== "TRABAJADOR" || !!r.worker_id, {
    message: "Selecciona el trabajador que pagó.",
    path: ["worker_id"],
  });
export const expenseBatchSchema = z
  .array(expenseBatchRowSchema)
  .min(1)
  .max(100)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length);
export type ExpenseBatchRow = z.infer<typeof expenseBatchRowSchema>;
export const expenseCategories = [
  "Materiales",
  "Mano de obra",
  "Subcontratista",
  "Combustible",
  "Equipos/Herramientas",
  "Permisos",
  "Marketing",
  "Oficina",
  "Otros",
];
export function expenseBatchError(message: string) {
  if (message.includes("expense_batch_conflict"))
    return "Este lote ya se registró con otros datos. Abre su resultado antes de crear otro.";
  const row = /expense_batch_row_(\d+):([a-z_]+)/.exec(message);
  const reasons: Record<string, string> = {
    duplicate_expense_document:
      "El documento ya existe para ese proveedor o se repite dentro del lote.",
    duplicate_expense_receipt:
      "La imagen del comprobante ya existe en otro gasto activo o se repite dentro del lote.",
    receipt_unavailable:
      "El comprobante no está disponible para esta fila. Vuelve a prepararlo.",
    worker_required: "Selecciona el trabajador que pagó.",
    worker_unavailable: "El trabajador no está disponible en esta empresa.",
    project_unavailable: "El proyecto no está disponible en esta empresa.",
    invalid_amount_or_description: "Revisa el importe y la descripción.",
    permission_denied: "No tienes acceso a una relación seleccionada.",
  };
  return row
    ? `Fila ${row[1]}: ${reasons[row[2]] ?? "Revisa los campos de esta fila."} No se guardó ninguna fila.`
    : "No se pudo confirmar el lote. Conserva esta página y vuelve a intentarlo con los mismos datos; el reintento no duplica gastos.";
}
