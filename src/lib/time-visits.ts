import { z } from "zod";

export const visitReasons = {
  limpieza: "Limpieza / terminación",
  garantia: "Garantía",
  reparacion: "Reparación",
  remodelacion: "Remodelación",
} as const;

export const punchProjectsSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    state: z.enum(["activo", "asignado", "terminado"]),
  }),
);
export type PunchProject = z.infer<typeof punchProjectsSchema>[number];
export function visitLabel(reason: string | null | undefined) {
  return reason && Object.hasOwn(visitReasons, reason)
    ? visitReasons[reason as keyof typeof visitReasons]
    : null;
}
