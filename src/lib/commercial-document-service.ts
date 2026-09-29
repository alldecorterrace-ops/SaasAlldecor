import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  storedCommercialDocument,
  type StoredCommercialDocument,
} from "./commercial-documents";
export async function generateCommercialDocument(
  db: SupabaseClient,
  company: string,
  kind: "estimate" | "invoice",
  record: string,
  version: number,
  render: (d: StoredCommercialDocument) => Promise<Uint8Array>,
) {
  const prepared = await db.rpc("prepare_commercial_document", {
    p_company: company,
    p_kind: kind,
    p_record: record,
    p_version: version,
  });
  if (prepared.error) throw prepared.error;
  const doc = storedCommercialDocument.parse(prepared.data);
  if (
    doc.company_id !== company ||
    doc.kind !== kind ||
    doc.record_id !== record ||
    doc.record_version !== version
  )
    throw new Error("document_mismatch");
  if (doc.state === "ready") return doc.id;
  const bytes = await render(doc);
  if (
    bytes.length === 0 ||
    bytes.length > 5000000 ||
    Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-"
  )
    throw new Error("invalid_pdf");
  const sha = createHash("sha256").update(bytes).digest("hex"),
    path = `${company}/${doc.id}.pdf`;
  const upload = await db.storage
    .from("commercial-pdfs")
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) {
    // A completed upload can lose its response; recover only if stored bytes match.
    const existing = await db.storage.from("commercial-pdfs").download(path);
    if (
      existing.error ||
      !existing.data ||
      existing.data.size !== bytes.length ||
      createHash("sha256")
        .update(Buffer.from(await existing.data.arrayBuffer()))
        .digest("hex") !== sha
    )
      throw new Error("document_upload_failed");
  }
  const saved = await db.rpc("finish_commercial_document", {
    p_company: company,
    p_document: doc.id,
    p_sha256: sha,
    p_bytes: bytes.length,
  });
  if (saved.error) throw saved.error;
  if (saved.data !== doc.id) throw new Error("document_mismatch");
  return doc.id;
}
