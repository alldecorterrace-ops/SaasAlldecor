import { createClient } from "@/lib/supabase/server";
import { customerDocument } from "@/lib/customer-document";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      companyId: string;
      customerId: string;
      attachmentId: string;
    }>;
  },
) {
  const { companyId, customerId, attachmentId } = await params;
  return customerDocument(companyId, customerId, attachmentId, createClient);
}
