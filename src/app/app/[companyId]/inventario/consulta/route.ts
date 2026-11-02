import { NextResponse } from "next/server";
import { inventoryAccess } from "@/lib/inventory-server";
import { uuid } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    { db, inventory } = await inventoryAccess(companyId);
  const p = new URL(request.url).searchParams,
    mode = p.get("tipo"),
    q = (p.get("q") ?? "").slice(0, 150);
  const loc = p.get("sede"),
    supplier = p.get("proveedor"),
    variant = p.get("variante");
  const send = (value: unknown, status = 200) =>
    NextResponse.json(value, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if ([loc, supplier, variant].some((v) => v && !uuid.safeParse(v).success))
    return send([], 400);
  if (mode === "proveedores" || mode === "proveedoresFiltro") {
    if (!inventory.supplierView) return send([], 403);
    const { data, error } = await db
      .rpc("inventory_master_rows", {
        p_company: companyId,
        p_kind: "SUPPLIER",
        p_query: q,
        p_only_active: mode === "proveedores",
      })
      .select("id,name")
      .limit(20);
    return error ? send([], 403) : send(data);
  }
  if (mode === "lotes" && variant && loc) {
    const page = Math.max(1, Math.min(10000, Number(p.get("pagina")) || 1));
    const { data, error } = await db
      .rpc("inventory_remaining_lots", {
        p_company: companyId,
        p_variant: variant,
        p_location: loc,
      })
      .select("lot_id,label,quantity")
      .range((page - 1) * 40, page * 40 - 1);
    return error ? send([], 403) : send(data);
  }
  if (mode === "variantes") {
    const { data, error } = await db.rpc("inventory_search_variants", {
      p_company: companyId,
      p_query: q,
      p_location: loc,
      p_supplier: supplier,
    });
    return error ? send([], 403) : send(data);
  }
  return send([], 400);
}
