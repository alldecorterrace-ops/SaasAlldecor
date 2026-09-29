import { createClient } from "@/lib/supabase/server";
import { uploadExpenseBatchReceipt } from "@/lib/expense-receipt-upload";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ companyId: string; batchId: string; expenseId: string }>;
  },
) {
  const { companyId, batchId, expenseId } = await params;
  return uploadExpenseBatchReceipt(
    request,
    companyId,
    batchId,
    expenseId,
    createClient,
    process.env.NEXT_PUBLIC_SITE_URL,
  );
}
