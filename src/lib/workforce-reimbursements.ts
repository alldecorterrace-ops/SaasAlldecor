import { z } from "zod";
const amount = z.string().regex(/^\d+\.\d{2}$/);
const item = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  amount,
  date: z.iso.date(),
  description: z.string(),
  project: z.uuid(),
  reviewed: z.boolean(),
});
export const reimbursementBalancesSchema = z.object({
  debt: amount,
  company_paid: amount,
  unknown_payer: amount,
  groups: z.array(
    z.object({
      worker_id: z.uuid(),
      worker_name: z.string(),
      total: amount,
      count: z.number().int().positive(),
      unreviewed: z.number().int().nonnegative(),
      first_date: z.iso.date(),
      last_date: z.iso.date(),
      items: z.array(item),
    }),
  ),
  recorded_count: z.number().int().nonnegative(),
  recorded: z.array(
    z.object({
      id: z.uuid(),
      worker_id: z.uuid(),
      worker_name: z.string(),
      amount,
      recorded_at: z.iso.datetime({ offset: true }),
      actor: z.uuid(),
      note: z.string(),
      archived: z.boolean(),
    }),
  ),
});
export const reimbursementFormSchema = z.object({
  request: z.uuid(),
  worker: z.uuid(),
  items: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s);
      } catch {
        ctx.addIssue({ code: "custom", message: "La selección no es válida." });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(
          z
            .object({ id: z.uuid(), version: z.number().int().positive() })
            .strict(),
        )
        .min(1)
        .max(100),
    ),
  total: amount,
  all: z.enum(["true", "false"]).transform((v) => v === "true"),
  note: z
    .string()
    .trim()
    .min(5, "Escribe la referencia o nota de la constancia.")
    .max(500),
  confirmed: z.literal("on", {
    error: "Confirma que el reembolso ya se realizó antes de registrarlo.",
  }),
});
export type ReimbursementBalances = z.infer<typeof reimbursementBalancesSchema>;
export function reimbursementError(error: unknown) {
  const s =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (s.includes("reimbursement_forbidden") || s.includes("permission_denied"))
    return "Solo el propietario o un administrador con permiso puede registrar esta constancia.";
  if (s.includes("reimbursement_review_required"))
    return "Revisa y confirma primero cada comprobante vigente. No se registró ninguna constancia.";
  if (s.includes("reimbursement_changed"))
    return "Los gastos, importes o versiones cambiaron. Recarga y comprueba la selección antes de continuar.";
  if (s.includes("request_conflict"))
    return "Este identificador ya se utilizó con otros datos. Reabre la selección.";
  if (s.includes("invalid_reimbursement"))
    return "Revisa la selección, el total y la nota. Se admiten hasta 100 gastos por constancia.";
  return "No se pudo confirmar el resultado. Consulta las constancias antes de volver a enviar.";
}
