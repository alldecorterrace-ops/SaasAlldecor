import { createClient } from "@/lib/supabase/server";
import { downloadEstimateEmailCapture } from "@/lib/estimate-email-download";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string; attemptId: string }> },
) {
  const { companyId, attemptId } = await params;
  return downloadEstimateEmailCapture(
    await createClient(),
    companyId,
    attemptId,
  );
}
