import { z } from "zod";
export const timeReviewFiltersSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  worker: z.union([z.uuid(), z.literal("")]).default(""),
});
export const timeReviewSchema = z.object({
  company: z.uuid(),
  from: z.iso.date(),
  to: z.iso.date(),
  timezone: z.string(),
  role: z.enum(["ADMIN", "FOREMAN"]),
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  rows: z.array(
    z.object({
      id: z.uuid(),
      version: z.number().int().positive(),
      worker_id: z.uuid(),
      worker_name: z.string(),
      project_name: z.string(),
      starts_local: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
      ends_local: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        .nullable(),
      minutes: z.number().int().nonnegative().nullable(),
      status: z.enum(["PENDIENTE", "APROBADO"]),
      open: z.boolean(),
      locked: z.boolean(),
      correction_pending: z.boolean(),
      can_approve: z.boolean(),
      field_minutes: z.number().int().nonnegative().nullable().default(null),
      field_kind: z.enum(["REQUEST", "DECLARE"]).nullable().default(null),
      field_needs_review: z.boolean().default(false),
      formal_pending: z.boolean().default(false),
      field_in_local: z.string().nullable().default(null),
      field_out_local: z.string().nullable().default(null),
      can_approve_field: z.boolean().default(false),
      can_reject_field: z.boolean().default(false),
    }),
  ),
});
export const timeApprovalFormSchema = z.object({
  request: z.uuid(),
  entry: z.uuid(),
  version: z.coerce.number().int().positive(),
});
export const timeApprovalResultSchema = z.object({
  entry: z.uuid(),
  version: z.number().int().positive(),
  minutes: z.number().int().nonnegative(),
  status: z.literal("APROBADO"),
});
export function timeApprovalError(error: { code?: string; message: string }) {
  const messages: Record<string, string> = {
    permission_denied: "Tu cuenta ya no tiene permiso para aprobar horas.",
    foreman_required: "Esta acción requiere un Encargado o administrador.",
    entry_unavailable: "Este turno ya no está disponible para tu equipo.",
    field_review_pending:
      "Revisa la propuesta de Campo antes de aprobar el turno.",
    shift_open: "Cierra el turno antes de aprobarlo.",
    period_locked:
      "La semana está cerrada. Un administrador debe reabrirla antes de aprobar.",
    correction_pending:
      "Hay una corrección pendiente. Un administrador debe revisarla antes de aprobar el turno.",
    shift_already_approved:
      "El turno ya está aprobado. Recarga para consultar su estado.",
    record_conflict:
      "El turno cambió. Recarga y revisa las horas antes de aprobar.",
    request_conflict:
      "La solicitud ya se utilizó para otro turno. Recarga y vuelve a intentarlo.",
    invalid_time_approval:
      "La selección no es válida. Recarga y vuelve a intentarlo.",
  };
  return (
    Object.entries(messages).find(([key]) =>
      error.message.includes(key),
    )?.[1] ?? "No se pudo aprobar el turno. Recarga y vuelve a intentarlo."
  );
}
