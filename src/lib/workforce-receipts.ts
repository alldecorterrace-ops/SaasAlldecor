import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { receiptLimit } from "./expense-batch-receipts";
import { sameOriginRequest } from "./operation-queue";
import { uuid } from "./validation";
import { workforceExpenseError } from "./workforce-expenses";
export const workforceReceiptSchema = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  expense_id: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(1).max(receiptLimit),
  extension: z.enum(["jpg", "png", "webp", "heic", "heif"]),
  original_name: z.string().min(1).max(200),
});
export function safeWorkforceReceiptName(name: string) {
  return (
    Array.from(name.trim().replace(/[\x00-\x1f\x7f/\\]/g, "_"))
      .slice(0, 200)
      .join("") || "recibo"
  );
}
// Check image dimensions, not the user-supplied filename/MIME. HEIF uses ADT's ISO-BMFF brand check.
export function identifyWorkforceReceipt(input: Uint8Array) {
  const b = Buffer.from(input);
  let extension: "jpg" | "png" | "webp" | "heic" | "heif" | undefined;
  if (!b.length || b.length > receiptLimit)
    throw new Error("invalid_workforce_receipt");
  if (
    b.length >= 33 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.readUInt32BE(8) === 13 &&
    b.toString("ascii", 12, 16) === "IHDR" &&
    b.readUInt32BE(16) > 0 &&
    b.readUInt32BE(20) > 0
  )
    extension = "png";
  if (b.length >= 12 && b[0] === 255 && b[1] === 216) {
    let p = 2;
    while (p + 4 <= b.length && b[p] === 255) {
      while (p < b.length && b[p] === 255) p++;
      const marker = b[p++];
      if (marker === 217 || marker === 218 || p + 2 > b.length) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const size = b.readUInt16BE(p);
      if (size < 2 || p + size > b.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        size >= 8 &&
        b.readUInt16BE(p + 3) > 0 &&
        b.readUInt16BE(p + 5) > 0
      ) {
        extension = "jpg";
        break;
      }
      p += size;
    }
  }
  if (
    b.length >= 25 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP" &&
    b.readUInt32LE(4) + 8 === b.length
  ) {
    const chunk = b.toString("ascii", 12, 16),
      size = b.readUInt32LE(16);
    if (
      size <= b.length - 20 &&
      ((chunk === "VP8X" && size >= 10 && b.length >= 30) ||
        (chunk === "VP8L" && size >= 5 && b[20] === 47) ||
        (chunk === "VP8 " &&
          size >= 10 &&
          b.length >= 30 &&
          b.subarray(23, 26).equals(Buffer.from([157, 1, 42])) &&
          (b.readUInt16LE(26) & 16383) > 0 &&
          (b.readUInt16LE(28) & 16383) > 0))
    )
      extension = "webp";
  }
  if (!extension && b.length >= 16 && b.toString("ascii", 4, 8) === "ftyp") {
    const size = b.readUInt32BE(0),
      end = Math.min(64, b.length, size);
    const brands = [b.toString("ascii", 8, 12)];
    for (let p = 16; p + 4 <= end; p += 4)
      brands.push(b.toString("ascii", p, p + 4));
    if (
      size >= 16 &&
      size <= b.length &&
      brands.some((x) =>
        [
          "heic",
          "heix",
          "hevc",
          "hevx",
          "heim",
          "heis",
          "mif1",
          "msf1",
        ].includes(x),
      )
    )
      extension = brands.some((x) => x.startsWith("hei") || x.startsWith("hev"))
        ? "heic"
        : "heif";
  }
  if (!extension) throw new Error("invalid_workforce_receipt");
  return {
    extension,
    contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}`,
    sha256: createHash("sha256").update(b).digest("hex"),
  };
}
export async function verifyWorkforceReceipt(
  db: SupabaseClient,
  receipt: z.infer<typeof workforceReceiptSchema>,
) {
  const path = `${receipt.company_id}/${receipt.expense_id}/${receipt.id}.${receipt.extension}`;
  const stored = await db.storage.from("workforce-receipts").download(path);
  if (stored.error || !stored.data || stored.data.size !== receipt.bytes)
    throw new Error("receipt_unavailable");
  const actual = identifyWorkforceReceipt(
    new Uint8Array(await stored.data.arrayBuffer()),
  );
  if (
    actual.extension !== receipt.extension ||
    actual.sha256 !== receipt.sha256 ||
    stored.data.type.split(";")[0] !== actual.contentType
  )
    throw new Error("receipt_mismatch");
  return {
    bytes: await stored.data.arrayBuffer(),
    contentType: actual.contentType,
  };
}
export async function uploadWorkforceReceipt(
  request: Request,
  company: string,
  expense: string,
  connect: () => Promise<SupabaseClient>,
  siteUrl: string | undefined,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status: number, error = "Recibo no disponible.") =>
    Response.json({ error }, { status, headers });
  if (!sameOriginRequest(request, siteUrl)) return fail(403);
  if (![company, expense].every((id) => uuid.safeParse(id).success))
    return fail(404);
  try {
    const db = await connect(),
      auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return fail(401);
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > receiptLimit))
      return fail(413, "El recibo supera 8 MiB.");
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
          return fail(413, "El recibo supera 8 MiB.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, size),
      format = identifyWorkforceReceipt(bytes);
    const name = safeWorkforceReceiptName(
      decodeURIComponent(request.headers.get("x-receipt-name") ?? "recibo"),
    );
    const prepared = await db.rpc("prepare_workforce_receipt", {
      p_company: company,
      p_expense: expense,
      p_sha256: format.sha256,
      p_bytes: size,
      p_extension: format.extension,
      p_name: name,
    });
    if (prepared.error) throw prepared.error;
    const receipt = workforceReceiptSchema.parse(prepared.data);
    if (
      receipt.company_id !== company ||
      receipt.expense_id !== expense ||
      receipt.bytes !== size ||
      receipt.sha256 !== format.sha256 ||
      receipt.extension !== format.extension ||
      receipt.original_name !== name
    )
      throw new Error("receipt_mismatch");
    const path = `${company}/${expense}/${receipt.id}.${receipt.extension}`;
    await db.storage
      .from("workforce-receipts")
      .upload(path, bytes, {
        contentType: format.contentType,
        upsert: false,
        cacheControl: "60",
      });
    await verifyWorkforceReceipt(db, receipt);
    return Response.json({ receiptId: receipt.id }, { headers });
  } catch (error) {
    return fail(
      error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "42501"
        ? 403
        : 400,
      workforceExpenseError(error),
    );
  }
}
