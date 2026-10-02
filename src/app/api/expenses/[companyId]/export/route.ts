import { createClient } from "@/lib/supabase/server";
import { exportCostRegister } from "@/lib/cost-export";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const filters = Object.fromEntries(new URL(request.url).searchParams);
  return exportCostRegister((await params).companyId, filters, createClient);
}
