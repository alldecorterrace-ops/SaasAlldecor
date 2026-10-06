import { z } from "zod";
const hour = z
  .string()
  .trim()
  .max(8)
  .regex(/^(?:|(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?(?:AM|PM))?)$/i);
export const fieldTimeFormSchema = z
  .object({
    request: z.uuid(),
    entry: z.uuid(),
    version: z.coerce.number().int().positive(),
    kind: z.enum(["REQUEST", "DECLARE"]),
    start_hour: hour.default(""),
    end_hour: hour.default(""),
    reason: z.string().trim().max(240),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "REQUEST" && (!v.reason || (!v.start_hour && !v.end_hour)))
      ctx.addIssue({ code: "custom", message: "Indica una hora y el motivo." });
    if (
      v.kind === "DECLARE" &&
      !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(v.end_hour)
    )
      ctx.addIssue({ code: "custom", message: "Indica la hora de salida." });
  });
export const fieldTimeReviewFormSchema = z
  .object({
    request: z.uuid(),
    entry: z.uuid(),
    version: z.coerce.number().int().positive(),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(240).default(""),
  })
  .refine(
    (v) => v.decision !== "reject" || Boolean(v.note),
    "El rechazo requiere un motivo.",
  );
export const fieldTimeSubmitResultSchema = z.object({
  entry: z.uuid(),
  version: z.number().int().positive(),
  record: z.uuid(),
  kind: z.enum(["REQUEST", "DECLARE"]),
  proposed_minutes: z.number().int().nonnegative(),
  minutes: z.number().int().nonnegative().nullable(),
  status: z.literal("PENDIENTE"),
});
export const fieldTimeReviewResultSchema = z.object({
  entry: z.uuid(),
  version: z.number().int().positive(),
  minutes: z.number().int().nonnegative().nullable(),
  status: z.enum(["PENDIENTE", "APROBADO"]),
  approved: z.boolean(),
  formal_pending: z.boolean(),
});
export const fieldTimeStatusSchema = z.object({
  entry: z.uuid(),
  version: z.number().int().positive(),
  minutes: z.number().int().nonnegative().nullable(),
  proposed_minutes: z.number().int().nonnegative().nullable(),
  kind: z.enum(["REQUEST", "DECLARE"]).nullable(),
  needs_review: z.boolean(),
  formal_pending: z.boolean(),
  can_submit: z.boolean(),
  locked: z.boolean(),
});
export function fieldTimeError(error: { message: string }) {
  const messages: Record<string, string> = {
    permission_denied: "Tu cuenta ya no tiene permiso para esta acción.",
    worker_login_required:
      "Necesitas un perfil activo de Campo vinculado a tu cuenta.",
    foreman_required: "La revisión requiere un Encargado o administrador.",
    manager_required: "Solo Administración puede rechazar una propuesta.",
    entry_unavailable: "Esta marcación ya no está disponible para tu cuenta.",
    record_conflict: "La marcación cambió. Recarga antes de enviar o revisar.",
    request_conflict:
      "La solicitud ya se utilizó con otros datos. Recarga y vuelve a intentarlo.",
    period_locked: "La semana está cerrada. Un administrador debe reabrirla.",
    field_reason_required:
      "Escribe el motivo de la corrección, hasta 240 caracteres.",
    field_rejection_reason_required: "Escribe el motivo del rechazo.",
    field_hour_required: "Indica una hora de entrada o salida válida.",
    invalid_field_hour:
      "Revisa la salida: la duración debe ser positiva y de hasta 18 horas.",
    field_shift_too_long: "La propuesta supera 18 horas. Revisa las horas.",
    field_positive_interval_required:
      "Administración necesita una salida posterior a la entrada para aplicar el horario.",
    field_break_conflict:
      "El horario solicitado es más corto que el descanso registrado. Revisa la propuesta.",
    field_review_unavailable:
      "Esta propuesta ya no requiere tu revisión. Recarga para consultar el estado.",
    field_review_pending:
      "Revisa la propuesta de Campo antes de aprobar el turno.",
    administrative_request_pending:
      "Hay una solicitud administrativa pendiente. Debe resolverse antes de continuar.",
    time_overlap: "El horario se solapa con otro turno. Revisa las horas.",
    shift_open: "El Encargado puede aprobar cuando el turno esté cerrado.",
    invalid_field_time: "Revisa las horas y el motivo de la propuesta.",
    invalid_field_review: "Revisa los datos de la decisión.",
  };
  return (
    Object.entries(messages).find(([key]) =>
      error.message.includes(key),
    )?.[1] ?? "No se pudo guardar la propuesta. Recarga y vuelve a intentarlo."
  );
}
