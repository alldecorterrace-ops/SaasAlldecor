import { createClient } from "@/lib/supabase/server";
import { exportExpenses } from "@/lib/expense-register";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const filters = Object.fromEntries(new URL(request.url).searchParams);
  return exportExpenses((await params).companyId, filters, createClient);
}
