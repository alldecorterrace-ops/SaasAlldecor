import { inventorySection } from "@/lib/inventory-server";
import { inventoryCountPdf, type CountSheet } from "@/lib/inventory-count-pdf";
import { uuid } from "@/lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    { db, company } = await inventorySection(companyId, "existencias");
  const p = new URL(request.url).searchParams,
    loc = p.get("sede");
  if (loc && !uuid.safeParse(loc).success)
    return new Response("Ubicación inválida", { status: 400 });
  const { data, error } = await db.rpc("inventory_count_sheet", {
    p_company: companyId,
    p_query: (p.get("q") ?? "").slice(0, 150),
    p_location: loc,
    p_empty: p.get("vacias") === "1",
  });
  if (error || !data)
    return new Response("No se pudo consultar el conteo.", {
      status: error?.code === "42501" ? 403 : 500,
      headers: { "Cache-Control": "no-store" },
    });
  const bytes = await inventoryCountPdf(
    company.name,
    company.timezone,
    data as CountSheet,
  );
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=conteo-fisico.pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
