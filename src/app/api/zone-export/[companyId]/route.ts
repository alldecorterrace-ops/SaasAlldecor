import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import {
  analyzeAdtZones,
  zonesCsv,
  type ZoneSource,
} from "@/lib/zone-analysis";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status: number) =>
    Response.json({ error: "Exportación no disponible." }, { status, headers });
  const { companyId } = await params;
  if (!uuid.safeParse(companyId).success) return fail(404);
  const db = await createClient(),
    { data: auth, error: ae } = await db.auth.getUser();
  if (ae || !auth.user) return fail(401);
  const { data, error } = await db.rpc("commercial_zone_source", {
    p_company: companyId,
  });
  if (error) return fail(error.code === "42501" ? 403 : 503);
  if (!data) return fail(503);
  return new Response(zonesCsv(analyzeAdtZones(data as ZoneSource)), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="zonas-saas.csv"',
      "Content-Security-Policy": "sandbox",
    },
  });
}
