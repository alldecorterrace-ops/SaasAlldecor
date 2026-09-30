import { createClient } from "@/lib/supabase/server";
import {
  uploadWorkforceReceipt,
  workforceReceiptSchema,
  verifyWorkforceReceipt,
} from "@/lib/workforce-receipts";
import { uuid } from "@/lib/validation";
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
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status = 404) =>
    Response.json({ error: "Recibo no disponible." }, { status, headers });
  if (![companyId, expenseId].every((id) => uuid.safeParse(id).success))
    return fail();
  const version = new URL(request.url).searchParams.get("version");
  if (version !== null && !uuid.safeParse(version).success) return fail();
  try {
    const db = await createClient(),
      auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return fail(401);
    const result = version
      ? await db.rpc("workforce_expense_receipt_version", {
          p_company: companyId,
          p_id: expenseId,
          p_receipt: version,
        })
      : await db.rpc("workforce_expense_receipt", {
          p_company: companyId,
          p_id: expenseId,
        });
    if (result.error) return fail();
    const receipt = workforceReceiptSchema.parse(result.data);
    if (receipt.company_id !== companyId || receipt.expense_id !== expenseId)
      return fail();
    const stored = await verifyWorkforceReceipt(db, receipt);
    return new Response(stored.bytes, {
      headers: {
        ...headers,
        "Content-Type": stored.contentType,
        "Content-Disposition": `inline; filename="recibo.${receipt.extension}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return fail();
  }
}
