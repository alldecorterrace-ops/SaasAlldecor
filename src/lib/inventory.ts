export type InvLocation = {
  id: string;
  name: string;
  kind: "ALMACEN" | "TIENDA";
  active: boolean;
  actions: string[];
};
export type InventoryContext = {
  active: boolean;
  manager: boolean;
  writable: boolean;
  supplierView: boolean;
  supplierManage: boolean;
  catalogView: boolean;
  catalogManage: boolean;
  productCreate: boolean;
  priceManage: boolean;
  costView: boolean;
  costManage: boolean;
  locations: InvLocation[];
};
export const inventorySections = [
  {
    slug: "compras",
    label: "Compras",
    group: "Compras y productos",
    kind: "COMPRA",
  },
  {
    slug: "proveedores",
    label: "Proveedores",
    group: "Compras y productos",
    kind: "SUPPLIER",
  },
  {
    slug: "productos",
    label: "Productos",
    group: "Compras y productos",
    kind: "FAMILY",
  },
  {
    slug: "existencias",
    label: "Existencias",
    group: "Inventario",
    kind: "STOCK",
  },
  {
    slug: "movimientos",
    label: "Movimientos",
    group: "Inventario",
    kind: "TRASLADO",
  },
  {
    slug: "ubicaciones",
    label: "Almacenes y tiendas",
    group: "Inventario",
    kind: "LOCATION",
  },
  { slug: "ajustes", label: "Ajustes", group: "Inventario", kind: "AJUSTE" },
] as const;
export type InvSection = (typeof inventorySections)[number];
export function inventorySectionsFor(ctx: InventoryContext) {
  const has = (action: string) =>
    ctx.locations.some((l) => l.actions.includes(action));
  return inventorySections.filter((s) => {
    switch (s.slug) {
      case "compras":
        return ctx.manager || has("purchases.create") || has("purchases.void");
      case "proveedores":
        return ctx.supplierView;
      case "productos":
        return ctx.catalogView || ctx.productCreate || ctx.priceManage;
      case "existencias":
        return ctx.manager || ctx.locations.length > 0;
      case "movimientos":
        return ctx.manager || has("transfers.create") || has("transfers.void");
      case "ubicaciones":
        return ctx.manager;
      case "ajustes":
        return ctx.manager || has("adjustments.create");
    }
  });
}
export type Variant = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number | null;
  active: boolean;
  options: Record<string, string>;
  lastCost?: number | null;
  average?: number | null;
  pending?: number;
};
export type Master = {
  id: string;
  name: string;
  data: {
    kind?: string;
    city?: string;
    address?: string;
    tax_identifier?: string;
    phone?: string;
    email?: string;
    notes?: string;
    active: boolean;
    version: number;
    category?: string | null;
    unit?: string;
    code?: string;
    description?: string;
    variants?: Variant[];
    purchases?: number;
    total?: number;
    value?: number;
    pending?: number;
  };
};
export type DocLine = {
  variant: string;
  name: string;
  sku: string;
  unit: string;
  qty: number;
  unitCost?: number | null;
  value?: number | null;
  pending?: number;
};
export type InvDoc = {
  id: string;
  business_date: string;
  data: {
    kind: string;
    location: string;
    locationId: string;
    destination?: string;
    destinationId?: string;
    supplier?: string;
    reference?: string;
    notes?: string;
    reason?: string;
    void: boolean;
    voidReason?: string;
    voidAt?: string;
    voidBy?: string;
    actor?: string;
    lotId?: string;
    lines: DocLine[];
    value?: number | null;
    pending?: number;
    tax?: number | null;
  };
};
export type StockVariant = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  qty: number;
  locations: { location: string; name: string; qty: number }[];
  value?: number;
  pending?: number;
  average?: number | null;
};
export type StockGroup = {
  id: string;
  name: string;
  data: { qty: number; variants: StockVariant[] };
};
export type LotRow = {
  lot_id: string;
  variant_id: string;
  location_id: string;
  quantity: number;
  label: string;
  detail: {
    location: string;
    product: string;
    sku: string;
    date: string;
    document?: string;
    documentKind?: string;
    supplier?: string;
    unitCost?: number | null;
    value?: number | null;
  };
};
export type LedgerRow = {
  id: number;
  data: {
    date: string;
    kind: string;
    location: string;
    qty: number;
    balance: number;
    actor: string;
    document?: string;
    documentKind?: string;
    value?: number;
    pending?: number;
    balancePending?: number;
    balanceValue?: number;
    lots: { label: string; qty: number; cost?: number | null }[];
  };
};
export type Choices = {
  categories: { id: string; name: string }[];
  attributes: {
    name: string;
    options: { id: string; name: string; active: boolean }[];
  }[];
};
export type SearchVariant = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  available: number | null;
  extra: { suggested?: number | null };
};
export type TeamRow = {
  user_id: string;
  email: string;
  assigned: boolean;
  actions: string[];
};
export const inventoryActions: Record<string, string> = {
  "purchases.create": "Registrar compras",
  "purchases.void": "Anular compras",
  "transfers.create": "Registrar traslados",
  "transfers.void": "Anular traslados",
  "adjustments.create": "Registrar ajustes",
};
export const inventoryReasons: Record<string, string> = {
  MERMA: "Merma",
  ROTURA: "Rotura",
  CONTEO_FISICO: "Conteo físico",
  OTRO: "Otro",
  INVENTARIO_INICIAL: "Inventario inicial",
};
export const movementLabels: Record<string, string> = {
  COMPRA: "Compra",
  ANTERIOR: "Existencias anteriores",
  AJUSTE_ENTRADA: "Entrada por ajuste",
  AJUSTE_SALIDA: "Salida por ajuste",
  TRASLADO_SALIDA: "Salida por traslado",
  TRASLADO_ENTRADA: "Entrada por traslado",
  ANULACION_COMPRA: "Anulación de compra",
  ANULACION_TRASLADO_SALIDA: "Salida por anulación de traslado",
  ANULACION_TRASLADO_ENTRADA: "Entrada por anulación de traslado",
};
export const documentSlug = (kind?: string) =>
  ({ COMPRA: "compras", TRASLADO: "movimientos", AJUSTE: "ajustes" })[
    kind ?? ""
  ];
const money = new Intl.NumberFormat("es-US", {
    style: "currency",
    currency: "USD",
  }),
  units = new Intl.NumberFormat("es-US", { maximumFractionDigits: 3 });
export const usd = (n: number | string | null | undefined) =>
  n == null ? "Pendiente" : money.format(Number(n));
const unitPrice = new Intl.NumberFormat("es-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
export const costUsd = (n: number | string | null | undefined) =>
  n == null ? "Pendiente" : unitPrice.format(Number(n));
export const quantity = (n: number | string) => units.format(Number(n));
export const businessDate = (s: string) => s.split("-").reverse().join("/");
export function todayAt(tz: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function invError(error: {
  message: string;
  details?: string | null;
  code?: string;
}) {
  const m = error.message;
  const errors: Record<string, string> = {
    inventory_opening_required:
      "Primero debe confirmarse la apertura del inventario.",
    inventory_opening_changed:
      "Los saldos cambiaron. Vuelve a revisar las existencias antes de confirmar.",
    inventory_opening_needs_review: "Hay artículos pendientes de revisión.",
    inventory_already_active: "La empresa ya abrió su inventario por lotes.",
    inventory_request_conflict:
      "Esta solicitud ya se utilizó con otros datos. Abre un formulario nuevo.",
    inventory_choose_lot:
      "Hay varios lotes disponibles. Elige de cuál sale la mercancía.",
    inventory_invalid_allocations:
      "Las cantidades de los lotes deben sumar la cantidad de la línea.",
    inventory_active_warehouse_required:
      "La compra necesita un almacén activo.",
    inventory_active_supplier_required: "Selecciona un proveedor activo.",
    inventory_initial_period_closed:
      "Esta ubicación ya tiene movimientos. Usa un ajuste de conteo físico.",
    inventory_purchase_cost_conflict:
      "La misma variante tiene costos distintos. Aclara el costo antes de registrar.",
    inventory_already_void: "El documento ya está anulado.",
    inventory_void_and_replace_purchase:
      "Esta compra aún puede anularse. Anúlala y registra el costo correcto.",
    inventory_revision_conflict:
      "El registro cambió. Vuelve a abrirlo antes de guardar.",
    inventory_charge_needs_base_costs:
      "Completa los costos de mercancía. La compra debe tener un valor mayor que cero para repartir el gasto.",
    inventory_charge_precision:
      "Este importe no se puede distribuir al centavo con costos unitarios de cuatro decimales.",
    inventory_charge_preview_changed:
      "Los costos cambiaron. Vuelve a calcular la distribución antes de confirmarla.",
    inventory_invalid_charge:
      "El gasto debe ser un importe positivo en dólares con hasta dos decimales.",
    inventory_location_has_stock:
      "Traslada las existencias antes de retirar esta ubicación.",
    inventory_variant_identity_locked:
      "Una variante existente conserva sus características. Crea otra combinación.",
    inventory_keep_existing_variants:
      "Conserva las variantes existentes. Puedes desactivarlas.",
    inventory_option_unavailable: "Una opción está desactivada o se repite.",
    inventory_inconsistent_attributes:
      "Todas las variantes deben usar las mismas características.",
    inventory_variant_unavailable: "La variante no está disponible.",
    inventory_reason_required: "Escribe un motivo para esta operación.",
    inventory_invalid_cost: "Revisa el costo unitario y sus cuatro decimales.",
    inventory_invalid_number: "Revisa el número y su precisión.",
    inventory_invalid_quantity:
      "Revisa las cantidades y el signo de cada línea.",
    permission_denied:
      "Tu cuenta no tiene permiso en esta empresa o ubicación.",
  };
  if (m.includes("inventory_insufficient"))
    return (
      "Existencia insuficiente" +
      (error.details && /^\d+(\.\d+)?$/.test(error.details)
        ? " · Disponible: " + error.details
        : "") +
      "."
    );
  for (const [key, label] of Object.entries(errors))
    if (m.includes(key)) return label;
  if (error.code === "23505")
    return "El nombre, código de barras o combinación ya existe en esta empresa.";
  if (error.code === "23514")
    return "Revisa la unidad, las cantidades y los datos obligatorios.";
  return "No se pudo guardar la operación. Revisa los datos del formulario.";
}
