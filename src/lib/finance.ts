import { z } from "zod";
export const projectStatuses = {
  NUEVO: "Nuevo",
  PLANIFICACION: "Planificación",
  PRODUCCION: "Producción",
  INSTALACION: "Instalación",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
} as const;
export const paymentMethods = {
  EFECTIVO: "Efectivo",
  CHEQUE: "Cheque",
  TRANSFERENCIA: "Transferencia",
  TARJETA_EXTERNA: "Tarjeta (cobro externo)",
  OTRO: "Otro",
} as const;
export const paymentStatuses = {
  UNPAID: "Sin pagos",
  PARTIAL: "Pago parcial",
  PAID: "Pagada",
  VOID: "Anulada",
} as const;
export const paymentSchema = z.object({
  amount: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,2})?$/)
    .refine((x) => Number(x) > 0, "El importe debe ser positivo."),
  payment_date: z.iso.date(),
  method: z.enum(
    Object.keys(paymentMethods) as [
      keyof typeof paymentMethods,
      ...(keyof typeof paymentMethods)[],
    ],
  ),
  reference: z.string().max(255),
  notes: z.string().max(2000),
});
export const projectSchema = z
  .object({
    name: z.string().trim().min(2).max(255),
    status: z.enum(
      Object.keys(projectStatuses) as [
        keyof typeof projectStatuses,
        ...(keyof typeof projectStatuses)[],
      ],
    ),
    start_date: z.iso.date().nullable(),
    end_date: z.iso.date().nullable(),
    notes: z.string().max(10000),
  })
  .refine(
    (x) => !x.start_date || !x.end_date || x.end_date >= x.start_date,
    "La fecha final debe ser posterior o igual al inicio.",
  );
export function financeError(error: { code?: string; message: string }) {
  if (error.code === "40001")
    return "El registro cambió. Recarga la página antes de guardar de nuevo.";
  if (error.code === "23505")
    return "La referencia o solicitud ya existe. Revisa los registros antes de repetirla.";
  if (error.message.includes("overpayment"))
    return "El importe supera el saldo pendiente.";
  if (error.message.includes("deposit_required"))
    return "Registra un pago recibido antes de programar o pasar el proyecto a producción.";
  if (error.message.includes("reverse_payments_first"))
    return "Revierte primero los registros de pago antes de anular la factura.";
  if (error.message.includes("approved_estimate_locked"))
    return "El estimado aprobado está cerrado para conservar lo facturado.";
  return "No se pudo guardar. Revisa los datos, el estado del documento y tus permisos.";
}
export const usd = (value: string | number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value),
  );
