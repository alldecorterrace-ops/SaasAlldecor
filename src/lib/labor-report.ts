import { z } from "zod";
import {
  previewLabor,
  reconcileDailyLabor,
  type LaborIssue,
} from "./labor-costs";
const id = z.uuid(),
  date = z.iso.date(),
  cents = z.number().int().safe().positive();
export const laborContextSchema = z.object({
  company: id,
  timezone: z.string(),
  splitRule: z.enum(["review", "minutes"]),
  entries: z.array(
    z.object({
      external_id: id,
      worker_id: id,
      project_external_id: z.union([id, z.literal("")]),
      clock_in: z.number().int().safe(),
      clock_out: z.number().int().safe().nullable(),
      minutes: z.number().int().nullable(),
      status: z.string(),
      review_status: z.string(),
      req_status: z.string(),
    }),
  ),
  rates: z.record(
    id,
    z.array(z.object({ from: date, to: date.nullable(), cents })),
  ),
  projects: z.record(id, z.object({ mode: z.enum(["day", "adjustment"]) })),
  adjustments: z.record(
    id,
    z.object({
      id,
      workerId: id,
      amountCents: cents,
      estimateId: id,
      revision: z.string().min(1),
    }),
  ),
  historical: z.array(
    z.object({
      id: z.string().min(1),
      workerId: id,
      projectId: id,
      date,
      amountCents: cents,
    }),
  ),
  unmapped: z.array(
    z.object({
      id,
      projectId: id.nullable(),
      date,
      amountCents: cents,
      reason: z.literal("EXISTING_LABOR_RECONCILIATION_REQUIRED"),
    }),
  ),
  names: z.object({
    workers: z.record(id, z.string()),
    projects: z.record(id, z.string()),
  }),
  adjustmentDates: z.record(id, date),
});
export type LaborContext = z.infer<typeof laborContextSchema>;
export function laborReport(context: LaborContext) {
  const calculated = previewLabor(context),
    blockedProjects = new Set(context.unmapped.map((e) => e.projectId));
  // An expense with no project cannot be guessed away. Preserve it and withhold
  // company supplements until the attribution is reviewed.
  const blockAll = blockedProjects.has(null),
    pending: LaborIssue[] = [
      ...calculated.pending,
      ...context.unmapped.map((e) => ({
        reason: e.reason,
        entryId: e.id,
        projectId: e.projectId ?? undefined,
        date: e.date,
      })),
    ];
  const costs = calculated.costs.filter(
    (c) => !blockAll && !blockedProjects.has(c.projectId),
  );
  const reconciled = reconcileDailyLabor(
    { ...calculated, costs, pending },
    context.historical,
  );
  const unmappedCostCents = context.unmapped.reduce(
    (s, e) => s + e.amountCents,
    0,
  );
  if (!Number.isSafeInteger(reconciled.knownCostCents + unmappedCostCents))
    throw new Error("Labor total exceeds exact integer range");
  return {
    ...reconciled,
    unmappedCostCents,
    knownCostCents: reconciled.knownCostCents + unmappedCostCents,
    attendance: calculated.attendance,
    company: context.company,
    timezone: context.timezone,
    names: context.names,
    supplements: reconciled.supplements.map((c) => ({
      ...c,
      date: c.date ?? context.adjustmentDates[c.projectId],
    })),
  };
}
export const laborIssueLabels: Record<string, string> = {
  INVALID_ENTRY: "Falta identificar la jornada.",
  SHIFT_REVIEW_REQUIRED:
    "Jornada, asignación o corrección pendiente de conciliación.",
  PROJECT_MODE_REQUIRED: "Falta confirmar el modo de Labor del proyecto.",
  SHARED_DAY_RULE_REQUIRED: "Jornada compartida: confirmar el reparto.",
  DATED_DAILY_RATE_REQUIRED: "Falta una tarifa diaria única y vigente.",
  ADJUSTMENT_SNAPSHOT_REQUIRED:
    "Falta el acuerdo y revisión guardados del ajuste.",
  EXISTING_LABOR_RECONCILIATION_REQUIRED:
    "Hay Labor previa pendiente de correspondencia; no se agregó otro costo.",
  HISTORICAL_COST_EXCEEDS_DAILY_RATE:
    "La nómina histórica supera la tarifa diaria; revisar la diferencia.",
  HISTORICAL_LABOR_WITHOUT_VALUED_DAY:
    "Costo histórico sin jornada valorada correspondiente.",
};
