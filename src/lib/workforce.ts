import { z } from "zod";
export const workforceRoles = {
  WORKER: "Trabajador",
  FOREMAN: "Encargado",
  OFFICE: "Oficina",
  ADMIN: "Administración",
} as const;
export const workforceProfileSchema = z.object({
  id: z.uuid(),
  request: z.uuid(),
  version: z.coerce.number().int().nonnegative(),
  role: z.enum(["WORKER", "FOREMAN", "OFFICE"]),
  supervisor_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  enabled: z.boolean(),
  reason: z
    .string()
    .trim()
    .min(5, "Explica el motivo con al menos cinco caracteres.")
    .max(1000),
});
export const workforceAssignmentSchema = z
  .object({
    id: z.uuid(),
    request: z.uuid(),
    version: z.coerce.number().int().nonnegative(),
    worker_id: z.uuid(),
    project_id: z.uuid("Selecciona una obra."),
    starts_at: z.iso.date("Selecciona la fecha de inicio."),
    ends_at: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
    active: z.boolean(),
    reason: z
      .string()
      .trim()
      .min(5, "Explica el motivo con al menos cinco caracteres.")
      .max(1000),
  })
  .refine((v) => !v.ends_at || v.ends_at > v.starts_at, {
    message: "La fecha final debe ser posterior al inicio.",
    path: ["ends_at"],
  });
export const workforceScopeSchema = z.object({
  actor_id: z.uuid().nullable(),
  role: z.enum(["WORKER", "FOREMAN", "OFFICE", "ADMIN"]).nullable(),
  team: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      role: z.enum(["WORKER", "FOREMAN", "OFFICE"]),
      supervisor_id: z.uuid().nullable(),
    }),
  ),
  projects: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export function workforceError(error: { message: string }) {
  const messages: Record<string, string> = {
    manager_required:
      "Solo un administrador puede cambiar el equipo y las asignaciones.",
    supervisor_unavailable:
      "Elige un encargado activo de esta empresa. Nadie puede ser su propio encargado.",
    supervisor_cycle:
      "La relación de encargados forma un ciclo. Revisa el equipo.",
    supervisor_has_team:
      "Reasigna primero el equipo de este encargado antes de retirarlo o cambiar su rol.",
    worker_unavailable: "El trabajador ya no está disponible. Reabre la ficha.",
    assignment_unavailable:
      "Comprueba que trabajador, perfil de equipo y obra estén activos y pertenezcan a esta empresa.",
    assignment_identity_locked:
      "Conserva el trabajador y la obra. Para cambiarlos, retira esta asignación y crea otra.",
    assignment_overlap:
      "Ya existe una asignación activa de este trabajador a esta obra durante esas fechas.",
    record_conflict:
      "La ficha cambió en otra sesión. Recarga para consultar la versión actual.",
    request_conflict:
      "Esta solicitud ya se usó con otros datos. Reabre la ficha para continuar.",
    invalid_assignment: "Revisa las fechas y el motivo de la asignación.",
    invalid_workforce_profile: "Revisa el rol, encargado y motivo.",
  };
  return (
    Object.entries(messages).find(([key]) =>
      error.message.includes(key),
    )?.[1] ?? "No se pudo guardar. Comprueba tu sesión y vuelve a intentarlo."
  );
}
