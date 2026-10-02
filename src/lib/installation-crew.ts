import { z } from "zod";
export const installationCrewSchema = z
  .array(z.uuid().transform((v) => v.toLowerCase()))
  .max(20)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "No repitas trabajadores en la cuadrilla.",
  );
export function installationCrewIds(value: unknown): string[] {
  if (value === undefined) return [];
  const parsed = installationCrewSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("No se pudo leer la cuadrilla guardada.");
  return parsed.data.sort();
}
// Omission is reserved for old forms: the database retains their saved team.
export function parseInstallationCrew(form: FormData) {
  if (!form.has("crew_present"))
    return { success: true as const, data: undefined };
  if (form.get("crew_present") !== "1") return { success: false as const };
  return installationCrewSchema.safeParse(form.getAll("crew_worker_ids"));
}
