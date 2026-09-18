import { historicalEstimateSchema } from "../historical-estimates";
import { exactCents, planEstimateMigration } from "./estimates";
import { historyHash, planHistoryMigration } from "./history";

const text = (value: unknown) => (typeof value === "string" ? value : "");
// Explicit display allowlist. No source JSON, tokens, HTML, signatures, URLs or
// nested motor metadata cross into the public read model.
export function historicalEstimatePayload(input: unknown, companyId: string) {
  const history = planHistoryMigration(input, companyId);
  const raw = input as Record<string, unknown>;
  const estimates = planEstimateMigration(
    { ...raw, format: "adt-estimates-snapshot-v1" },
    companyId,
  );
  const clients = new Map(
    history.records
      .filter((r) => r.kind === "clients")
      .map((r) => [r.sourceId, r.original]),
  );
  const graph = new Map(
    history.records
      .filter((r) => r.kind === "estimates")
      .map((r) => [r.sourceId, r]),
  );
  const records = estimates.records.map((record) => {
    const original = record.original.estimate,
      relations = graph.get(record.sourceId)!;
    const customerRef = relations.references.find(
      (r) => r.field === "client_external_id",
    );
    if (
      customerRef?.status !== "resolved" ||
      relations.references.some((r) =>
        ["conflict", "missing", "invalid"].includes(r.status),
      )
    )
      throw new Error("historical_estimate_relationship_requires_review");
    const customer = clients.get(customerRef.sourceValue!)!;
    const presentation = historicalEstimateSchema.parse({
      number: text(original.consecutive) || record.sourceId,
      original_date: text(original.estimate_date),
      original_status: text(original.status),
      customer_name: text(customer.full_name),
      total_cents: record.reconciliation.storedTotalCents,
      discount_cents: exactCents(original.discount)?.toString() ?? null,
      taxes_cents: exactCents(original.taxes)?.toString() ?? null,
      difference_cents: record.reconciliation.differenceCents,
      detail_state: record.effectiveLines.length
        ? "saved_lines"
        : "unavailable_in_reviewed_sources",
      review_reasons: [
        ...new Set([...record.reviewReasons, ...relations.issues]),
      ],
      lines: record.effectiveLines.map((line) => {
        const source = line.source as Record<string, unknown>;
        return {
          description:
            text(source.name) ||
            text(source.label) ||
            "Partida sin descripción",
          specification: text(source.spec),
          amount_cents: line.amountCents,
        };
      }),
    });
    return {
      id: record.candidateId,
      source_id: record.sourceId,
      source_sha256: record.sourceSha256,
      original: record.original,
      presentation,
      projection_sha256: historyHash(presentation),
    };
  });
  return {
    companyId: history.companyId,
    snapshotSha256: history.snapshotSha256,
    records,
  };
}
