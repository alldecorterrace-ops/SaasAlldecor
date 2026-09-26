import { createClient } from "@/lib/supabase/server";
import { exportCommercialZones } from "@/lib/zone-export";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  return exportCommercialZones((await params).companyId, createClient);
}
