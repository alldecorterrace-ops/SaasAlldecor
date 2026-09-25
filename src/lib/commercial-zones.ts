import { canAccess, type Membership } from "./modules";
export const commercialZonePermissions = [
  ["mapazonas", "Mapa de zonas"],
  ["clientes", "Clientes"],
  ["fin-invoices", "Facturas"],
  ["estimadosweb", "Estimados web"],
  ["crm", "Leads"],
] as const;
export function missingZonePermissions(member: Membership) {
  return commercialZonePermissions.filter(([id]) => !canAccess(member, id));
}
