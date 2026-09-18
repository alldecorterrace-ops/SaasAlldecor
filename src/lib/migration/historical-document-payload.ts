import { z } from "zod";
import {
  archiveKindSchema,
  fileStateSchema,
  historicalDocumentSchema,
} from "../historical-documents";
import { exactCents } from "./estimates";
import { historyHash, planHistoryMigration } from "./history";
const text = (v: unknown) => (typeof v === "string" ? v : "");
const filesSchema = z.object({
  records: z.array(
    z.object({
      kind: archiveKindSchema,
      source_id: z.string(),
      file_state: fileStateSchema,
      file_sha256: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .nullable(),
      file_bytes: z
        .number()
        .int()
        .positive()
        .max(20 * 1024 * 1024)
        .nullable(),
      expected_size_matches: z.boolean().optional(),
    }),
  ),
});
function date(value: unknown) {
  const original = text(value);
  if (!/^\d{1,10}$/.test(original)) return original;
  return original === "0"
    ? ""
    : new Date(Number(original) * 1000).toISOString();
}
export function historicalDocumentPayload(
  input: unknown,
  fileInput: unknown,
  companyId: string,
) {
  const plan = planHistoryMigration(input, companyId),
    files = filesSchema.parse(fileInput).records;
  const index = new Map(files.map((f) => [`${f.kind}:${f.source_id}`, f]));
  if (index.size !== files.length) throw new Error("duplicate_archive_file");
  const selected = plan.records.filter(
    (r) => archiveKindSchema.safeParse(r.kind).success,
  );
  if (files.length !== selected.length)
    throw new Error("archive_file_manifest_mismatch");
  const records = selected.map((record) => {
    const kind = archiveKindSchema.parse(record.kind),
      source = record.original;
    const file = index.get(`${kind}:${record.sourceId}`);
    if (
      !file ||
      (file.file_state === "available") !==
        (file.file_sha256 !== null && file.file_bytes !== null) ||
      (file.file_state !== "available" &&
        (file.file_sha256 !== null || file.file_bytes !== null))
    )
      throw new Error("invalid_archive_file_manifest");
    const reasons = [...record.issues];
    const clients = new Set<string>();
    for (const reference of record.references.filter(
      (r) => r.status === "resolved",
    )) {
      const target = plan.records.find(
        (r) => r.candidateId === reference.candidateId,
      );
      const client =
        target?.kind === "clients"
          ? target.sourceId
          : text(target?.original.client_external_id);
      if (client) clients.add(client);
    }
    if (clients.size > 1) reasons.push("related_client_conflict");
    const held = reasons.length > 0;
    const amount = kind === "contracts" ? exactCents(source.total) : null;
    if (kind === "contracts" && amount === null) reasons.push("invalid_money");
    if (file.expected_size_matches === false)
      reasons.push("file_size_mismatch");
    const link = (field: string) =>
      held
        ? null
        : (record.references.find(
            (r) => r.field === field && r.status === "resolved",
          )?.candidateId ?? null);
    const client = plan.records.find(
      (r) => r.kind === "clients" && r.sourceId === source.client_external_id,
    );
    const presentation = historicalDocumentSchema.parse({
      title:
        text(kind === "documents" ? source.file_name : source.estimate_no) ||
        record.sourceId,
      original_type: kind === "documents" ? text(source.kind) : "contrato",
      original_status: text(source.status),
      original_date: date(source.created),
      signed_date: date(source.signed_at),
      customer_name:
        kind === "contracts"
          ? text(source.client_name)
          : text(client?.original.full_name),
      amount_cents: amount?.toString() ?? null,
      has_signed_content: Boolean(text(source.signed_html)),
      has_signature: Boolean(text(source.signature_b64)),
      relation_state: held ? "review" : "linked",
      review_reasons: [...new Set(reasons)],
    });
    return {
      kind,
      id: record.candidateId,
      source_id: record.sourceId,
      source_sha256: record.sourceSha256,
      projection_sha256: historyHash(presentation),
      original: source,
      presentation,
      client_id: link("client_external_id"),
      project_id: link("project_external_id"),
      estimate_id: link("estimate_external_id"),
      file_state: file.file_state,
      file_sha256: file.file_sha256,
      file_bytes: file.file_bytes,
    };
  });
  return {
    companyId: plan.companyId,
    snapshotSha256: plan.snapshotSha256,
    records,
  };
}
