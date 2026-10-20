import { createClient } from "@/lib/supabase/server";
import { uploadWorkforceReceipt } from "@/lib/workforce-receipts";
import { downloadWorkforceReceipt } from "@/lib/workforce-receipt-download";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ companyId: string; expenseId: string }> };
export async function POST(request: Request, { params }: Context) {
  const { companyId, expenseId } = await params;
  return uploadWorkforceReceipt(
    request,
    companyId,
    expenseId,
    createClient,
    process.env.NEXT_PUBLIC_SITE_URL,
  );
}
export async function GET(request: Request, { params }: Context) {
  const { companyId, expenseId } = await params;
  return downloadWorkforceReceipt(request, companyId, expenseId, createClient);
}
