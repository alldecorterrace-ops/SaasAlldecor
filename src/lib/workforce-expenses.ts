import { z } from "zod";
export const workforceExpenseCategories = {
  FUEL: "Combustible",
  MATERIALS: "Materiales",
  TOOLS: "Herramientas",
  PARKING: "Estacionamiento",
  TOLLS: "Peajes",
  OTHER: "Otros",
} as const;
export const workforceExpenseStatuses = {
  SUBMITTED: "Pendiente del encargado",
  FOREMAN_APPROVED: "Pendiente de oficina",
  OFFICE_APPROVED: "Aprobado por oficina",
  REJECTED: "Rechazado",
} as const;
// datetime-local may omit zero seconds after the user edits the control.
// This form explicitly labels UTC; never reinterpret it in the device timezone.
export function workforceUtcDateTime(value: string): string | null {
  const seconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00`
    : value;
  const parsed = z.iso.datetime().safeParse(`${seconds}Z`);
  return parsed.success ? parsed.data : null;
}
export const workforceExpenseSchema = z.object({
  id: z.uuid(),
  request: z.uuid(),
  project_id: z.uuid("Selecciona una obra."),
  expense_at: z.iso.datetime({ offset: true, error: "Indica una fecha y hora válidas en UTC." }),
  amount: z
    .string()
    .regex(
      /^\d{1,5}(\.\d{1,2})?$/,
      "Escribe un importe con hasta dos decimales.",
    )
    .refine(
      (v) => Number(v) > 0 && Number(v) <= 10000,
      "El importe debe ser mayor que cero y no superar 10.000.",
    ),
  category: z.enum(["FUEL", "MATERIALS", "TOOLS", "PARKING", "TOLLS", "OTHER"]),
  description: z.string().trim().max(1000),
  receipt_id: z.uuid("Adjunta el recibo."),
});
export const workforceDecisionSchema = z
  .object({
    id: z.uuid(),
    request: z.uuid(),
    version: z.coerce.number().int().positive(),
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(1000),
  })
  .refine((v) => v.decision !== "REJECT" || v.reason.length >= 5, {
    path: ["reason"],
    message: "Explica el rechazo con al menos cinco caracteres.",
  });
export function workforceExpenseError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  const messages: Record<string, string> = {
    worker_login_required:
      "Necesitas una ficha activa vinculada a tu cuenta y permiso para registrar en Horas.",
    project_not_assigned:
      "La obra no está disponible para ti en la fecha del gasto. Comprueba la asignación.",
    invalid_workforce_expense:
      "Revisa importe, categoría y fecha: hasta 90 días atrás y cinco minutos hacia adelante.",
    invalid_workforce_receipt:
      "Adjunta una imagen JPG, PNG, WebP, HEIC o HEIF válida de hasta 8 MiB.",
    invalid_workforce_decision:
      "Revisa la decisión y el motivo; un rechazo necesita al menos cinco caracteres.",
    receipt_upload_limit:
      "Se alcanzó el límite de recibos preparados. Conserva el archivo y solicita revisión.",
    receipt_unavailable:
      "No se pudo verificar el recibo. Conserva el archivo y vuelve a intentarlo.",
    receipt_mismatch:
      "El recibo no coincide con el archivo preparado. Conserva el original y vuelve a intentarlo.",
    expense_forbidden:
      "Tu rol no puede decidir este gasto. El encargado no puede aprobar sus propios gastos.",
    expense_state_invalid:
      "La decisión requiere el estado anterior: encargado primero y oficina después.",
    record_conflict:
      "Este gasto cambió en otra sesión. Recarga antes de decidir.",
    request_conflict:
      "La solicitud ya se usó con otros datos. Reabre el formulario para continuar.",
  };
  return (
    Object.entries(messages).find(([key]) => message.includes(key))?.[1] ??
    "No se pudo completar. Comprueba tu sesión y vuelve a intentarlo."
  );
}
