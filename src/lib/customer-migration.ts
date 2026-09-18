export function customerMigrationReason(reason: string) {
  const field = reason.split(":")[1],
    label: Record<string, string> = {
      full_name: "nombre",
      email: "correo",
      phone: "teléfono",
      address: "dirección",
      city: "ciudad",
      postal_code: "código postal",
      service: "servicio",
      client_date: "fecha",
      notes: "notas",
    };
  if (reason.startsWith("source_duplicate:"))
    return `Coincidencia de ${label[field] ?? "datos"} con otro cliente del histórico.`;
  if (reason.startsWith("current_duplicate:"))
    return `Coincidencia de ${label[field] ?? "datos"} con un cliente que ya existe en el SaaS.`;
  if (reason.startsWith("invalid:"))
    return `El campo ${label[field] ?? "indicado"} necesita revisión antes de copiarse.`;
  if (reason === "source_status")
    return "El estado original del cliente necesita revisión.";
  return "Registro pendiente de revisión.";
}
