import type { SupabaseClient } from "@supabase/supabase-js";
import {
  workforceReceiptSchema,
  verifyWorkforceReceipt,
} from "./workforce-receipts";
import { prepareReceiptImage } from "./receipt-image";
import { uuid } from "./validation";
export async function downloadWorkforceReceipt(
  request: Request,
  companyId: string,
  expenseId: string,
  connect: () => Promise<SupabaseClient>,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  const fail = (status = 404) =>
    Response.json({ error: "Recibo no disponible." }, { status, headers });
  if (![companyId, expenseId].every((id) => uuid.safeParse(id).success))
    return fail();
  const version = new URL(request.url).searchParams.get("version");
  if (version !== null && !uuid.safeParse(version).success) return fail();
  try {
    const db = await connect(),
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
    const original = await verifyWorkforceReceipt(db, receipt);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    const stored = preview ? await prepareReceiptImage(original) : original;
    const current = version
      ? await db.rpc("workforce_expense_receipt_version", {
          p_company: companyId,
          p_id: expenseId,
          p_receipt: version,
        })
      : await db.rpc("workforce_expense_receipt", {
          p_company: companyId,
          p_id: expenseId,
        });
    if (current.error) return fail();
    const latest = workforceReceiptSchema.parse(current.data);
    if (latest.id !== receipt.id || latest.sha256 !== receipt.sha256)
      return fail();
    return new Response(stored.bytes, {
      headers: {
        ...headers,
        "Content-Type": stored.contentType,
        "Content-Disposition": `inline; filename="recibo.${preview && stored.contentType === "image/jpeg" ? "jpg" : receipt.extension}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return fail();
  }
}
