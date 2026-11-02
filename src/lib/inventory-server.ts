import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { companyContext } from "./auth";
import { inventorySectionsFor, type InventoryContext } from "./inventory";
import { workspaceModules, canAccess, moduleHref } from "./modules";

export const inventoryAccess = cache(async (companyId: string) => {
  const context = await companyContext(companyId);
  const { data, error } = await context.db.rpc("inventory_context", {
    p_company: companyId,
  });
  if (error || !data)
    throw new Error("No se pudieron consultar los permisos de inventario.");
  const inventory = data as InventoryContext;
  return { ...context, inventory, sections: inventorySectionsFor(inventory) };
});
export async function inventorySection(companyId: string, slug: string) {
  const context = await inventoryAccess(companyId);
  const section = context.sections.find((entry) => entry.slug === slug);
  if (!section) notFound();
  return { ...context, section };
}
export async function inventoryHome(companyId: string) {
  const { member, inventory, sections } = await inventoryAccess(companyId);
  const first = workspaceModules.find(
    (m) =>
      canAccess(member, m.id) &&
      !(m.id === "inventario" && inventory.active && member.role === "member"),
  );
  if (first) return moduleHref(companyId, first.id);
  return sections[0]
    ? `/app/${companyId}/inventario/${sections[0].slug}`
    : `/app/${companyId}/sin-acceso`;
}
