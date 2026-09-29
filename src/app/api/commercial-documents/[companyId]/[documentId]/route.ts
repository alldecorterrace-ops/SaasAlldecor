import { createClient } from "@/lib/supabase/server";
import { downloadCommercialDocument } from "@/lib/commercial-document-download";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string; documentId: string }> },
) {
  const { companyId, documentId } = await params;
  return downloadCommercialDocument(
    await createClient(),
    companyId,
    documentId,
    new URL(request.url).searchParams.get("customer"),
  );
}
