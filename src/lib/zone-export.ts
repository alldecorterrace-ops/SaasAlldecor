import { uuid } from "./validation";
import { analyzeAdtZones, zonesCsv, type ZoneSource } from "./zone-analysis";

// The adapter must carry the requesting user's session, never a service role.
export type ZoneExportClient = {
  auth: {
    getUser(): Promise<{ data: { user: unknown | null }; error: unknown }>;
  };
  rpc(
    name: "commercial_zone_source",
    args: { p_company: string },
  ): PromiseLike<{
    data: unknown;
    error: { code?: string } | null;
  }>;
};

export async function exportCommercialZones(
  companyId: string,
  connect: () => Promise<ZoneExportClient>,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status: number) =>
    Response.json({ error: "Exportación no disponible." }, { status, headers });
  if (!uuid.safeParse(companyId).success) return fail(404);
  try {
    const db = await connect();
    const { data: auth, error: ae } = await db.auth.getUser();
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
  } catch {
    // A failed read/calculation is not an empty successful financial export.
    return fail(503);
  }
}
