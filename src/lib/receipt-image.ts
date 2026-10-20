import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { receiptLimit } from "./expense-batch-receipts";
import { identifyWorkforceReceipt } from "./workforce-receipts";
import {
  extractReceipt,
  type ReceiptProvider,
} from "./receipt-review-provider";

export type ReceiptImage = { bytes: ArrayBuffer; contentType: string };
export type ReviewImage = {
  bytes: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

// Bound CPU work to one child per application process; no credentials inherit.
let converting = false;
export async function prepareReceiptImage(
  file: ReceiptImage,
): Promise<ReviewImage> {
  const actual = identifyWorkforceReceipt(new Uint8Array(file.bytes));
  if (actual.contentType !== file.contentType)
    throw new Error("receipt_mismatch");
  if (
    file.contentType === "image/jpeg" ||
    file.contentType === "image/png" ||
    file.contentType === "image/webp"
  )
    return { bytes: file.bytes, contentType: file.contentType };
  if (file.contentType !== "image/heic" && file.contentType !== "image/heif")
    throw new Error("heic_conversion_required");
  if (converting) throw new Error("review_timeout");
  converting = true;
  try {
    const output = await new Promise<Buffer>((resolveResult, reject) => {
      const child = execFile(
        process.execPath,
        [
          "--max-old-space-size=256",
          resolve(process.cwd(), "scripts/receipt-heic-convert.cjs"),
        ],
        {
          encoding: "buffer",
          timeout: 30_000,
          maxBuffer: receiptLimit,
          env: { NODE_ENV: "production" },
          windowsHide: true,
        },
        (error, stdout) => {
          if (error) {
            reject(
              new Error(
                error.killed ? "review_timeout" : "heic_conversion_required",
              ),
            );
            return;
          }
          resolveResult(stdout);
        },
      );
      child.stdin?.on("error", () => child.kill());
      child.stdin?.end(Buffer.from(file.bytes));
    });
    if (identifyWorkforceReceipt(output).contentType !== "image/jpeg")
      throw new Error("heic_conversion_required");
    return { bytes: Uint8Array.from(output).buffer, contentType: "image/jpeg" };
  } catch (error) {
    if (error instanceof Error && error.message === "review_timeout")
      throw error;
    throw new Error("heic_conversion_required");
  } finally {
    converting = false;
  }
}

export async function extractReceiptForReview(
  providers: ReceiptProvider[],
  file: ReceiptImage,
  request: typeof fetch = fetch,
) {
  const image = await prepareReceiptImage(file);
  return extractReceipt(providers, image.bytes, image.contentType, request);
}
