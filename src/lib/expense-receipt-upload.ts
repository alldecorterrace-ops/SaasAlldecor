import type { SupabaseClient } from "@supabase/supabase-js";
import { sameOriginRequest } from "./operation-queue";
import { uuid } from "./validation";
import {
  prepareExpenseBatchReceipt,
  receiptLimit,
  expenseReceiptError,
} from "./expense-batch-receipts";
import {
  prepareExpenseReceipt,
  singleReceiptError,
} from "./expense-single-receipts";

async function receiveReceipt(
  request: Request,
  company: string,
  context: { batch: string } | { version: number },
  expense: string,
  connect: () => Promise<SupabaseClient>,
  siteUrl: string | undefined,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status: number, error = "Comprobante no disponible.") =>
    Response.json({ error }, { status, headers });
  // This route receives a single raw file, not a multipart form containing all rows.
  if (!sameOriginRequest(request, siteUrl)) return fail(403);
  if (
    ![company, expense, ...("batch" in context ? [context.batch] : [])].every(
      (id) => uuid.safeParse(id).success,
    )
  )
    return fail(404);
  if (
    "version" in context &&
    (!Number.isSafeInteger(context.version) || context.version < 1)
  )
    return fail(400);
  try {
    const db = await connect();
    const auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return fail(401);
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > receiptLimit))
      return fail(413, "El comprobante supera 8 MiB.");
    if (!request.body) return fail(400);
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > receiptLimit) {
          await reader.cancel();
          return fail(413, "El comprobante supera 8 MiB.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, size);
    const receiptId =
      "batch" in context
        ? await prepareExpenseBatchReceipt(
            db,
            company,
            context.batch,
            expense,
            bytes,
          )
        : await prepareExpenseReceipt(
            db,
            company,
            expense,
            context.version,
            bytes,
          );
    return Response.json({ receiptId }, { headers });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42501"
    )
      return fail(403);
    return fail(
      400,
      "batch" in context
        ? expenseReceiptError(error)
        : singleReceiptError(error),
    );
  }
}

export function uploadExpenseBatchReceipt(
  request: Request,
  company: string,
  batch: string,
  expense: string,
  connect: () => Promise<SupabaseClient>,
  siteUrl: string | undefined,
) {
  return receiveReceipt(request, company, { batch }, expense, connect, siteUrl);
}
export function uploadIndividualExpenseReceipt(
  request: Request,
  company: string,
  expense: string,
  version: number,
  connect: () => Promise<SupabaseClient>,
  siteUrl: string | undefined,
) {
  return receiveReceipt(
    request,
    company,
    { version },
    expense,
    connect,
    siteUrl,
  );
}
