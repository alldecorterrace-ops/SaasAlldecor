// Stored in the same membership/invitation JSON as workspace permissions.
export const inventoryPermissions = [
  {
    id: "inv-proveedores",
    label: "Proveedores de mercancía",
    read: "Ver proveedores",
    write: "Gestionar proveedores",
  },
  {
    id: "inv-costos",
    label: "Costos de inventario",
    read: "Ver costos",
    write: "Completar y corregir costos",
  },
  {
    id: "inv-catalogo",
    label: "Catálogo físico",
    read: "Consultar catálogo",
    write: "Gestionar catálogo",
  },
  {
    id: "inv-alta-productos",
    label: "Productos físicos",
    read: null,
    write: "Crear productos",
  },
  {
    id: "inv-precios",
    label: "Precios de variantes",
    read: null,
    write: "Fijar precios de venta",
  },
] as const;

export function inventoryPermissionsFromForm(
  form: FormData,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const entry of inventoryPermissions) {
    const actions = [];
    if (entry.read && form.get(`read:${entry.id}`) === "on")
      actions.push("read");
    if (form.get(`write:${entry.id}`) === "on") actions.push("write");
    if (actions.length) result[entry.id] = actions;
  }
  return result;
}
