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
    customer_name: z.string().default(""),
    project_date: z.iso.date().nullable().default(null),
    address: z.string().default(""),
  }),
);
export type PunchProject = z.infer<typeof punchProjectsSchema>[number];
export function visitLabel(reason: string | null | undefined) {
  return reason && Object.hasOwn(visitReasons, reason)
    ? visitReasons[reason as keyof typeof visitReasons]
    : null;
}

export function filterPunchProjects(
  projects: PunchProject[],
  completed: boolean,
  search: string,
) {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const query = normalize(search).trim();
  return projects.filter(
    (p) =>
      (p.state === "terminado") === completed &&
      normalize(
        [p.name, p.customer_name, p.id, p.project_date ?? "", p.address].join(
          " ",
        ),
      ).includes(query),
  );
}
