import { createClient } from "@/lib/supabase/server";
import { uploadIndividualExpenseReceipt } from "@/lib/expense-receipt-upload";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; expenseId: string }> },
) {
  const { companyId, expenseId } = await params;
  const version = request.headers.get("x-expense-version");
  return uploadIndividualExpenseReceipt(
    request,
    companyId,
    expenseId,
    version && /^[0-9]+$/.test(version) ? Number(version) : 0,
    createClient,
    process.env.NEXT_PUBLIC_SITE_URL,
  );
}
