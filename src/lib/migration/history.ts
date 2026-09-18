import { createHash } from "node:crypto";
import { z } from "zod";
import { planEstimateMigration } from "./estimates";

export const historyTables = {
  clients: "adt_crm_client",
  estimates: "adt_crm_estimate",
  items: "adt_crm_estimate_item",
  projects: "adt_crm_project",
  invoices: "adt_crm_invoice",
  payments: "adt_crm_payment",
  documents: "adt_crm_doc",
  contracts: "adt_crm_contract",
} as const;
export type HistoryKind = keyof typeof historyTables;
type Row = Record<string, unknown>;
type ReferenceRule = {
  field: string;
  target: HistoryKind | null;
  required?: boolean;
};
const rules: Record<HistoryKind, ReferenceRule[]> = {
  clients: [],
  estimates: [
    { field: "client_external_id", target: "clients", required: true },
    { field: "project_id", target: "projects" },
    { field: "web_est_id", target: null },
  ],
  items: [
    { field: "estimate_external_id", target: "estimates", required: true },
    { field: "product_external_id", target: null },
  ],
  projects: [
    { field: "client_external_id", target: "clients", required: true },
    { field: "estimate_external_id", target: "estimates" },
  ],
  invoices: [
    { field: "client_external_id", target: "clients", required: true },
    { field: "project_external_id", target: "projects" },
    { field: "service_external_id", target: null },
  ],
  payments: [
    { field: "invoice_external_id", target: "invoices", required: true },
    { field: "client_external_id", target: "clients" },
    { field: "project_external_id", target: "projects" },
  ],
  documents: [
    { field: "estimate_external_id", target: "estimates" },
    { field: "client_external_id", target: "clients" },
    { field: "project_external_id", target: "projects" },
  ],
  contracts: [
    { field: "estimate_external_id", target: "estimates", required: true },
    { field: "client_external_id", target: "clients", required: true },
  ],
};
const rows = z.array(z.record(z.string(), z.unknown())).max(1000000);
const schema = z.object({
  format: z.literal("adt-history-snapshot-v1"),
  origin: z.literal("restored_snapshot"),
  clients: rows,
  estimates: rows,
  items: rows,
  projects: rows,
  invoices: rows,
  payments: rows,
  documents: rows,
  contracts: rows,
});
export function canonicalHistory(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalHistory).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Row;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalHistory(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const historyHash = (value: unknown) =>
  createHash("sha256").update(canonicalHistory(value)).digest("hex");
function identity(company: string, kind: HistoryKind, source: string) {
  const bytes = createHash("sha256")
    .update(JSON.stringify([historyTables[kind], company, source]))
    .digest();
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function sourceId(kind: HistoryKind, row: Row) {
  const value = kind === "documents" ? row.id : row.external_id;
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.length > 128
  )
    throw new Error("invalid_history_identity");
  return value;
}
function referenceValue(row: Row, field: string) {
  const value = row[field];
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (field === "web_est_id" && (value === "0" || value === 0))
  )
    return null;
  return typeof value === "string" && value.trim() === value
    ? value
    : undefined;
}

// Exact source identifiers only. Names, email addresses and similar amounts
// never establish a relationship. Raw contracts can contain secrets: private output only.
export function planHistoryMigration(input: unknown, companyId: string) {
  const company = z.uuid().parse(companyId).toLowerCase();
  const snapshot = schema.parse(input);
  const kinds = Object.keys(historyTables) as HistoryKind[];
  const indexes = Object.fromEntries(
    kinds.map((kind) => {
      const index = new Map<string, Row>();
      for (const row of snapshot[kind]) {
        const id = sourceId(kind, row);
        if (index.has(id)) throw new Error("duplicate_history_identity");
        index.set(id, row);
      }
      return [kind, index];
    }),
  ) as Record<HistoryKind, Map<string, Row>>;
  const estimates = planEstimateMigration(
    { ...snapshot, format: "adt-estimates-snapshot-v1" },
    company,
  );
  const estimatePlans = new Map(estimates.records.map((r) => [r.sourceId, r]));
  const records = kinds
    .flatMap((kind) =>
      [...indexes[kind]].map(([id, original]) => {
        const issues: string[] = [];
        const references = rules[kind].map((rule) => {
          const value = referenceValue(original, rule.field);
          const targetRow =
            value && rule.target ? indexes[rule.target].get(value) : undefined;
          let status: string =
            value === undefined
              ? "invalid"
              : value === null
                ? rule.required
                  ? "missing"
                  : "absent"
                : rule.target === null
                  ? "out_of_scope"
                  : targetRow
                    ? "resolved"
                    : "missing";
          if (
            status === "missing" ||
            status === "invalid" ||
            status === "out_of_scope"
          )
            issues.push(`${status}:${rule.field}`);
          if (targetRow && rule.target !== "clients") {
            const ownClient = referenceValue(original, "client_external_id");
            const parentClient = referenceValue(
              targetRow,
              "client_external_id",
            );
            if (ownClient && parentClient && ownClient !== parentClient) {
              issues.push(`client_conflict:${rule.field}`);
              status = "conflict";
            }
            if (kind === "payments" && rule.target === "invoices") {
              const ownProject = referenceValue(
                original,
                "project_external_id",
              );
              const parentProject = referenceValue(
                targetRow,
                "project_external_id",
              );
              if (ownProject && parentProject && ownProject !== parentProject) {
                issues.push(`project_conflict:${rule.field}`);
                status = "conflict";
              }
            }
            if (kind === "estimates" && rule.target === "projects") {
              const inverse = referenceValue(targetRow, "estimate_external_id");
              if (inverse && inverse !== id) {
                issues.push("estimate_project_inverse_conflict");
                status = "conflict";
              }
            }
          }
          return {
            field: rule.field,
            targetKind: rule.target,
            sourceValue: value ?? null,
            status,
            candidateId:
              status === "resolved"
                ? identity(company, rule.target!, value!)
                : null,
          };
        });
        const estimate = estimatePlans.get(id);
        const presentation =
          kind === "estimates" && estimate
            ? {
                mode: "historical_read_only",
                details: estimate.effectiveLines.length
                  ? "saved_lines"
                  : "unavailable_in_reviewed_sources",
                originalStatus: estimate.originalStatus,
                totalCents: estimate.reconciliation.storedTotalCents,
                reviewReasons: estimate.reviewReasons,
                reconciliation: estimate.reconciliation,
                // No fictional line to force the historical total into a current editor.
                allowIssue: false,
                allowRecalculate: false,
              }
            : null;
        return {
          kind,
          sourceId: id,
          candidateId: identity(company, kind, id),
          companyId: company,
          sourceSha256: historyHash(original),
          original,
          references,
          issues,
          relationDisposition: issues.length
            ? "hold_for_review"
            : "source_links_consistent",
          presentation,
        };
      }),
    )
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || a.sourceId.localeCompare(b.sourceId),
    );
  const references = records.flatMap((r) => r.references);
  return {
    format: "adt-history-plan-v1",
    mode: "offline-only",
    productionWrites: false,
    companyId: company,
    snapshotSha256: historyHash(snapshot),
    records,
    summary: {
      records: records.length,
      counts: Object.fromEntries(kinds.map((k) => [k, indexes[k].size])),
      references: Object.fromEntries(
        [
          "resolved",
          "missing",
          "invalid",
          "absent",
          "out_of_scope",
          "conflict",
        ].map((status) => [
          status,
          references.filter((r) => r.status === status).length,
        ]),
      ),
      recordsWithRelationIssues: records.filter((r) => r.issues.length).length,
      estimates: estimates.summary,
    },
  };
}
