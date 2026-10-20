import { z } from "zod";
export const workforceProjectChoiceSchema = z.object({
  request: z.uuid(), worker_id: z.uuid(), version: z.coerce.number().int().nonnegative(),
  project_id: z.union([z.uuid(), z.literal("")]).transform(v => v || null),
});
export const workforceProjectChoicesContextSchema = z.object({
  workers: z.array(z.object({id: z.uuid(), name: z.string(), project_id: z.uuid().nullable(), project_name: z.string().nullable(), version: z.number().int().nonnegative()})),
  projects: z.array(z.object({id: z.uuid(), name: z.string()})),
});
export function projectChoiceError(error: {message: string}) {
  const errors: Record<string,string> = {
    foreman_required: "Solo Administración o un Encargado puede asignar la obra actual.",
    worker_outside_team: "El trabajador ya no pertenece a tu equipo directo. Recarga el equipo.",
    project_unavailable: "La obra ya no está disponible en esta empresa.",
    record_conflict: "La obra cambió en otra sesión. Recarga el equipo antes de continuar.",
    request_conflict: "Esta solicitud ya se utilizó con otros datos. Recarga el equipo.",
    invalid_project_choice: "Comprueba el trabajador y la obra seleccionados.",
    permission_denied: "Tu cuenta no tiene permiso para cambiar la obra actual.",
  };
  return Object.entries(errors).find(([key])=>error.message.includes(key))?.[1] ?? "No se pudo guardar la obra actual. Comprueba tu sesión.";
}
