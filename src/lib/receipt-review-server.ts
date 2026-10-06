import "server-only";
import { aiFeaturesIncluded } from "./product-scope";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { compareReceipt, receiptReviewContextSchema } from "./receipt-review";
import {
  ReceiptProviderError,
  receiptProviderConfig,
} from "./receipt-review-provider";
import {
  verifyWorkforceReceipt,
  workforceReceiptSchema,
} from "./workforce-receipts";
import { assertDeploymentEnvironment } from "./deployment-environment";
import { extractReceiptForReview } from "./receipt-image";

export async function runWorkforceReceiptReview(
  db: SupabaseClient,
  company: string,
  request: string,
  expense: string,
  version: number,
) {
  if (!aiFeaturesIncluded) throw new Error("receipt_review_not_configured");
  const providers = receiptProviderConfig(process.env, company);
  if (!providers.length) throw new Error("receipt_review_not_configured");
  assertDeploymentEnvironment(process.env);
  const executor = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.RECEIPT_REVIEW_SUPABASE_SERVICE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const prepared = await db.rpc("prepare_workforce_receipt_review", {
    p_company: company,
    p_request: request,
    p_id: expense,
    p_version: version,
  });
  if (prepared.error) throw prepared.error;
  const job = z
    .object({
      job: z.uuid(),
      claimed: z.boolean(),
      status: z.string(),
      claim: z.uuid().optional(),
    })
    .parse(prepared.data);
  if (!job.claimed) return { status: job.status };
  let receipt, extraction, context, verdict;
  try {
    const found = await db.rpc("workforce_expense_receipt", {
      p_company: company,
      p_id: expense,
    });
    if (found.error) throw new Error("receipt_unavailable");
    receipt = workforceReceiptSchema.parse(found.data);
    const file = await verifyWorkforceReceipt(db, receipt);
    extraction = await extractReceiptForReview(providers, file);
    const normalizedDate = z.iso.date().safeParse(extraction.data.fecha.trim());
    // Context derives the fallback date from the bound declaration, not the browser.
    const current = await db
      .from("workforce_expenses")
      .select("expense_at")
      .eq("company_id", company)
      .eq("id", expense)
      .single();
    if (current.error) throw new Error("receipt_unavailable");
    const companyData = await db
      .from("companies")
      .select("timezone")
      .eq("id", company)
      .single();
    if (companyData.error) throw new Error("receipt_unavailable");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: companyData.data.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(current.data.expense_at));
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    const fallback = part("year") + "-" + part("month") + "-" + part("day");
    const calculated = await db.rpc("workforce_receipt_review_context", {
      p_company: company,
      p_job: job.job,
      p_date: normalizedDate.success ? normalizedDate.data : fallback,
    });
    if (calculated.error) throw calculated.error;
    context = receiptReviewContextSchema.parse(calculated.data);
    verdict = compareReceipt(extraction.data, context);
  } catch (error) {
    const codes = [
      "receipt_unavailable",
      "receipt_mismatch",
      "heic_conversion_required",
      "review_timeout",
    ];
    const code =
      error instanceof ReceiptProviderError
        ? error.code
        : error instanceof Error && codes.includes(error.message)
          ? error.message
          : "provider_unavailable";
    const failed = await executor.rpc("finish_workforce_receipt_review", {
      p_company: company,
      p_job: job.job,
      p_claim: job.claim,
      p_context: null,
      p_result: null,
      p_provider: null,
      p_model: null,
      p_provider_request: null,
      p_error: code,
    });
    if (failed.error) throw new Error("receipt_review_result_uncertain");
    return { status: String(failed.data.status) };
  }
  const finished = await executor.rpc("finish_workforce_receipt_review", {
    p_company: company,
    p_job: job.job,
    p_claim: job.claim,
    p_context: context,
    p_result: verdict,
    p_provider: extraction.provider,
    p_model: extraction.model,
    p_provider_request: extraction.requestId,
    p_error: null,
  });
  if (finished.error) throw new Error("receipt_review_result_uncertain");
  return { status: String(finished.data.status) };
}
