import { z } from "zod";
const cents = z.number().int().safe().positive();
export const laborHistorySchema = z.object({
  company: z.uuid(),
  sources: z
    .array(
      z.object({
        id: z.uuid(),
        version: z.number().int().positive(),
        project: z.uuid().nullable(),
        worker: z.uuid().nullable(),
        date: z.iso.date(),
        amountCents: cents,
        category: z.string(),
        description: z.string(),
        status: z.string(),
        link: z
          .object({
            version: z.number().int().positive(),
            active: z.boolean(),
            matches: z.boolean(),
            reason: z.string(),
            updatedAt: z.string(),
            updatedBy: z.uuid(),
            allocations: z
              .array(z.object({ worker: z.uuid(), date: z.iso.date(), cents }))
              .min(1)
              .max(100),
          })
          .nullable(),
      }),
    )
    .max(20000),
});
export type LaborHistorySource = z.infer<
  typeof laborHistorySchema
>["sources"][number];
// Parse decimal text directly to cents; floating point never decides attribution.
export function laborAmountCents(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(raw))
    return null;
  const [whole, decimal = ""] = raw.split(".");
  const result = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
  if (result <= 0n || result > 999999999999n) return null;
  return Number(result);
}
export function parseLaborAllocations(form: FormData) {
  const workers = form.getAll("allocation_worker"),
    dates = form.getAll("allocation_date"),
    amounts = form.getAll("allocation_amount");
  if (
    !workers.length ||
    workers.length > 100 ||
    dates.length !== workers.length ||
    amounts.length !== workers.length
  )
    return {
      error:
        "Añade entre una y cien jornadas completas para la correspondencia.",
    } as const;
  const allocations = [];
  const keys = new Set<string>();
  for (let n = 0; n < workers.length; n++) {
    const worker = z.uuid().safeParse(workers[n]),
      date = z.iso.date().safeParse(dates[n]),
      cents = laborAmountCents(amounts[n]);
    if (!worker.success || !date.success || cents === null)
      return {
        error:
          "Cada jornada requiere trabajador, fecha e importe positivo con hasta dos decimales.",
      } as const;
    const key = worker.data + ":" + date.data;
    if (keys.has(key))
      return {
        error: "El mismo trabajador y fecha deben aparecer una sola vez.",
      } as const;
    keys.add(key);
    allocations.push({ worker: worker.data, date: date.data, cents });
  }
  return { allocations } as const;
}
