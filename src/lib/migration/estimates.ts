import { createHash } from "node:crypto";
import { z } from "zod";

type SourceRow = Record<string, unknown>;
const row = z.record(z.string(), z.unknown());
const snapshotSchema = z.object({
  format: z.literal("adt-estimates-snapshot-v1"),
  origin: z.literal("restored_snapshot"),
  estimates: z.array(row).max(100000),
  items: z.array(row).max(1000000),
});
function object(value: unknown): SourceRow | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as SourceRow)
    : null;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = object(value);
  if (record)
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function identity(company: string, source: string) {
  const bytes = createHash("sha256")
    .update(JSON.stringify(["adt_crm_estimate", company, source]))
    .digest();
  bytes[6] = (bytes[6] & 15) | 128; // UUIDv8, scoped to destination company.
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
// Never round a historical amount to make a document reconcile.
export function exactCents(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!/^-?\d{1,14}(?:\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, decimal = ""] = text.replace(/^-/, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
  if (typeof value === "number" && cents > BigInt(Number.MAX_SAFE_INTEGER))
    return null;
  return negative ? -cents : cents;
}

export function planEstimateMigration(input: unknown, companyId: string) {
  const company = z.uuid().parse(companyId).toLowerCase();
  const snapshot = snapshotSchema.parse(input);
  const seen = new Set<string>();
  const estimates = snapshot.estimates.map((source) => {
    const id = z.string().trim().min(1).max(64).parse(source.external_id);
    if (id !== source.external_id || seen.has(id))
      throw new Error("duplicate_or_invalid_source_identity");
    seen.add(id);
    return source;
  });
  const groups = new Map<string, SourceRow[]>();
  for (const item of snapshot.items) {
    const key = String(item.estimate_external_id ?? "");
    if (!seen.has(key)) throw new Error("orphan_source_item");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const records = estimates
    .map((source) => {
      const id = String(source.external_id);
      const reasons: string[] = [];
      const stored = [...(groups.get(id) ?? [])].sort(
        (a, b) =>
          Number(a.position) - Number(b.position) ||
          String(a.id).localeCompare(String(b.id)),
      );
      let json: SourceRow | null = null;
      try {
        json = object(JSON.parse(String(source.source_json ?? "")));
      } catch {
        /* Preserved below. */
      }
      if (!json) reasons.push("invalid_or_missing_source_json");
      const sourceItems = Array.isArray(json?.items) ? json.items : [];
      // Matches the deployed ADT estimateItemsEffective rule. Seeded projections
      // must not replace a later JSON revision. Both originals remain in the plan.
      const seeded =
        stored.length > 0 &&
        stored.every((item) => {
          const expected =
            "ei" +
            createHash("md5")
              .update(
                `${id}|sj|${Number(item.position)}|${Number(item.created)}`,
              )
              .digest("hex")
              .slice(0, 10);
          return (
            item.external_id === expected &&
            Number(item.changed) === Number(item.created)
          );
        });
      const marker = json?._adt_items_source;
      const itemSource =
        marker === "source_json"
          ? "source_json"
          : marker === "item_table"
            ? "item_table"
            : !stored.length || (seeded && sourceItems.length > 0)
              ? "source_json"
              : "item_table";
      const effective: unknown[] =
        itemSource === "source_json" ? sourceItems : stored;
      if (
        marker !== undefined &&
        marker !== "source_json" &&
        marker !== "item_table"
      )
        reasons.push("unknown_item_source_marker");
      if (!effective.length) reasons.push("missing_effective_items");
      const lines = effective.map((value, index) => {
        const item = object(value);
        const amount = exactCents(
          itemSource === "source_json"
            ? (item?.price ?? item?.line_total)
            : item?.line_total,
        );
        if (!item || amount === null || amount < 0n)
          reasons.push("invalid_item_amount");
        return {
          index,
          amountCents: amount?.toString() ?? null,
          source: value,
        };
      });
      const total = exactCents(source.total);
      const discount = exactCents(source.discount);
      const taxes = exactCents(source.taxes);
      if ([total, discount, taxes].some((v) => v === null || v < 0n))
        reasons.push("invalid_document_amount");
      const complete =
        effective.length > 0 && lines.every((l) => l.amountCents !== null);
      const subtotal = complete
        ? lines.reduce((sum, l) => sum + BigInt(l.amountCents!), 0n)
        : null;
      const calculated =
        subtotal !== null && discount !== null && taxes !== null
          ? subtotal - discount + taxes
          : null;
      if (calculated !== null && total !== null && calculated !== total)
        reasons.push("historical_total_mismatch");
      const savedSubtotal = exactCents(json?.subtotal);
      const savedTotal = exactCents(json?.total);
      const summaryMatches =
        savedSubtotal !== null &&
        total !== null &&
        discount !== null &&
        taxes !== null &&
        savedTotal === total &&
        exactCents(json?.discount) === discount &&
        exactCents(json?.taxes) === taxes &&
        savedSubtotal - discount + taxes === total;
      const engines = sourceItems
        .map((v) => object(object(v)?.data))
        .filter((v) => v?.origen === "motor-sin-3d" && object(v.totales));
      const engine = engines.length === 1 ? engines[0] : null;
      const engineTotals = object(engine?.totales);
      const engineParts = exactCents(engineTotals?.partidas);
      const engineExtras = exactCents(engineTotals?.extras);
      const engineMatches =
        summaryMatches &&
        engineTotals !== null &&
        exactCents(engineTotals.subtotal) === savedSubtotal &&
        exactCents(engineTotals.total) === total &&
        exactCents(engineTotals.descuento) === discount &&
        exactCents(engineTotals.impuesto) === taxes &&
        engineParts !== null &&
        engineExtras !== null &&
        engineParts + engineExtras === savedSubtotal;
      const delta =
        calculated !== null && total !== null ? calculated - total : null;
      const roundingSupported =
        itemSource === "source_json" &&
        engineMatches &&
        !reasons.includes("invalid_item_amount") &&
        !reasons.includes("invalid_document_amount") &&
        delta !== null &&
        delta !== 0n &&
        delta >= -2n &&
        delta <= 2n;
      // A reconciliation result is evidence, never authorization to issue/approve
      // an estimate, invoice, project, payment, or overwrite a historical record.
      return {
        sourceId: id,
        candidateId: identity(company, id),
        companyId: company,
        sourceSha256: hash(canonical({ estimate: source, items: stored })),
        original: { estimate: source, items: stored },
        originalStatus: source.status,
        itemSource,
        effectiveLines: lines,
        reconciliation: {
          storedTotalCents: total?.toString() ?? null,
          subtotalCents: subtotal?.toString() ?? null,
          calculatedTotalCents: calculated?.toString() ?? null,
          differenceCents:
            calculated !== null && total !== null
              ? (calculated - total).toString()
              : null,
          savedSubtotalCents: savedSubtotal?.toString() ?? null,
          sourceSummaryMatchesTotal: summaryMatches,
          engineSummaryMatches: engineMatches,
          roundingEvidence: roundingSupported
            ? "consistent_with_source_line_rounding"
            : null,
          // Evidence only: never add an adjustment line or clear review flags.
          historicalAmountsChanged: false,
        },
        reviewReasons: [...new Set(reasons)],
      };
    })
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  return {
    format: "adt-estimates-plan-v1",
    mode: "dry-run",
    writesEnabled: false,
    destinationCompanyId: company,
    snapshotSha256: hash(canonical(snapshot)),
    summary: {
      estimates: records.length,
      preservedItemRows: snapshot.items.length,
      usingJson: records.filter(
        (r) => r.itemSource === "source_json" && r.effectiveLines.length,
      ).length,
      usingTable: records.filter(
        (r) => r.itemSource === "item_table" && r.effectiveLines.length,
      ).length,
      withoutItems: records.filter((r) => !r.effectiveLines.length).length,
      requiresReview: records.filter((r) => r.reviewReasons.length).length,
      reconciled: records.filter((r) => !r.reviewReasons.length).length,
      roundingSupported: records.filter(
        (r) => r.reconciliation.roundingEvidence !== null,
      ).length,
    },
    records,
  };
}
