import { createClient } from "@/lib/supabase/server";
import { exportTimeSummary } from "@/lib/time-summary-export";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  return exportTimeSummary(
    companyId,
    Object.fromEntries(new URL(req.url).searchParams),
    createClient,
  );
}
