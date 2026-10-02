import { createClient } from "@/lib/supabase/server";
import { workDocument, type WorkDocumentClient } from "@/lib/work-document";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      companyId: string;
      kind: string;
      recordId: string;
      attachmentId: string;
    }>;
  },
) {
  const { companyId, kind, recordId, attachmentId } = await params;
  return workDocument(companyId, kind, recordId, attachmentId, async () => {
    // Limit the SDK boundary to methods used here; rows are runtime-validated.
    return (await createClient()) as unknown as WorkDocumentClient;
  });
}
