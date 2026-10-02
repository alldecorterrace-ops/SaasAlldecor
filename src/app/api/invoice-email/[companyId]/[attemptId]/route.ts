import { createClient } from "@/lib/supabase/server";
import { downloadInvoiceEmailCapture } from "@/lib/invoice-email-download";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string; attemptId: string }> },
) {
  const { companyId, attemptId } = await params;
  return downloadInvoiceEmailCapture(
    await createClient(),
    companyId,
    attemptId,
  );
}
