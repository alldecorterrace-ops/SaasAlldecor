import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  workforceReceiptSchema,
  verifyWorkforceReceipt,
} from "./workforce-receipts";
import { receiptReviewFormSchema } from "./receipt-review";
export const manualReceiptReviewSchema = receiptReviewFormSchema.extend({
  note: z.string().trim().min(5).max(500),
  reviewed_visually: z.literal("on"),
});
export async function reviewReceiptManually(
  db: SupabaseClient,
  company: string,
  input: unknown,
) {
  const v = manualReceiptReviewSchema.parse(input);
  const r = await db.rpc("workforce_expense_receipt", {
    p_company: company,
    p_id: v.id,
  });
  if (r.error) throw r.error;
  const receipt = workforceReceiptSchema.parse(r.data);
  if (receipt.company_id !== company || receipt.expense_id !== v.id)
    throw new Error("receipt_mismatch");
  await verifyWorkforceReceipt(db, receipt);
  const done = await db.rpc("review_workforce_receipt_manually", {
    p_company: company,
    p_request: v.request,
    p_id: v.id,
    p_version: v.version,
    p_note: v.note,
  });
  if (done.error) throw done.error;
  return done.data;
}
