import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuid } from "./validation";

const idFilter = z.union([z.literal(""), uuid]).default("");
export const timeSummaryFiltersSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    project: z.string().max(255).default(""),
    worker: idFilter,
  })
  .refine((f) => f.from <= f.to, { message: "Revisa el intervalo de fechas." });
export type TimeSummaryFilters = z.infer<typeof timeSummaryFiltersSchema>;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const project = z.object({ id: uuid.nullable(), name: z.string() });
const amount = project.extend({ seconds: count });
export const timeSummarySchema = z.object({
  company: uuid,
  from: z.iso.date(),
  to: z.iso.date(),
  timezone: z.string(),
  dates: z.array(z.iso.date()).max(62),
  count,
  page: z.number().int().positive(),
  options: z.object({
    projects: z.array(project),
    workers: z.array(z.object({ id: uuid, name: z.string() })),
  }),
  totals: z.object({
    days: count,
    seconds: count,
    workers: count,
    open: count,
  }),
  rows: z
    .array(
      z.object({
        id: uuid,
        name: z.string(),
        days: count,
        seconds: count,
        projects: z.array(amount.extend({ days: count })),
        daily: z
          .array(
            z.object({
              date: z.iso.date(),
              seconds: count,
              projects: z.array(amount),
            }),
          )
          .max(62),
      }),
    )
    .max(20),
  projects: z.array(
    amount.extend({ days: count, worker_days: count, workers: count }),
  ),
});
export type TimeSummary = z.infer<typeof timeSummarySchema>;
export async function loadTimeSummary(
  db: Pick<SupabaseClient, "rpc">,
  company: string,
  filters: TimeSummaryFilters,
  page = 1,
) {
  const f = timeSummaryFiltersSchema.parse(filters);
  const { data, error } = await db.rpc("time_summary", {
    p_company: company,
    p_from: f.from,
    p_to: f.to,
    p_project: f.project || null,
    p_worker: f.worker || null,
    p_page: page,
  });
  if (error) throw error;
  const report = timeSummarySchema.parse(data);
  if (
    report.company !== company ||
    report.from !== f.from ||
    report.to !== f.to
  )
    throw new Error("Hours report scope mismatch");
  return report;
}
export function timeSummaryPeriods(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const date = new Date(today + "T00:00:00Z");
  const iso = (offset: number) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const monday = -((date.getUTCDay() + 6) % 7);
  return [
    { label: "Esta semana", from: iso(monday), to: iso(monday + 6) },
    { label: "Semana pasada", from: iso(monday - 7), to: iso(monday - 1) },
    // ADT subtracts 14 dates and includes both endpoints.
    { label: "14 días", from: iso(-14), to: today },
    { label: "Este mes", from: today.slice(0, 8) + "01", to: today },
  ];
}
export function timeSummaryCsv(data: TimeSummary) {
  const cell = (value: string) =>
    '"' +
    (/^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value).replaceAll(
      '"',
      '""',
    ) +
    '"';
  const rows = [
    [
      "Desde",
      "Hasta",
      "Zona horaria",
      "Proyecto",
      "Días",
      "Días-trabajador",
      "Trabajadores",
      "Horas",
    ],
    ...data.projects.map((p) => [
      data.from,
      data.to,
      data.timezone,
      p.name,
      String(p.days),
      String(p.worker_days),
      String(p.workers),
      (p.seconds / 3600).toFixed(2),
    ]),
  ];
  return (
    "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
