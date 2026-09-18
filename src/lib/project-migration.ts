const reasons: Record<string, string> = {
  customer_pending:
    "El cliente necesita revisión antes de incorporar el proyecto.",
  estimate_reference: "Debe verificarse el vínculo con el estimado original.",
  source_status: "El estado original requiere una equivalencia revisada.",
  invalid_project_fields: "Los datos del proyecto requieren revisión.",
  invalid_project_date: "La fecha original requiere revisión.",
  source_relationship:
    "Hay una referencia de origen pendiente o contradictoria.",
  source_duplicate: "Coincide con otro proyecto del histórico.",
  current_duplicate: "Coincide con un proyecto que ya existe en el SaaS.",
};
export const projectMigrationReason = (reason: string) =>
  reasons[reason] ?? "Revisión pendiente.";
