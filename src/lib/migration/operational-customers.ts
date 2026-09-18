import { z } from "zod";
import { customerSchema } from "../validation";
import { historyHash, planHistoryMigration } from "./history";
export function customerMatchKey(
  field: "full_name" | "email" | "phone",
  value: unknown,
) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (field === "full_name") return text.replace(/\s+/g, " ");
  if (field === "email") return text;
  const digits = text.replace(/[^0-9]/g, ""),
    normalized =
      digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length >= 7 ? normalized : "";
}
export function planOperationalCustomers(
  input: unknown,
  existingInput: unknown,
  companyId: string,
) {
  const plan = planHistoryMigration(input, companyId),
    source = plan.records.filter((r) => r.kind === "clients");
  const existing = z
    .array(
      z
        .object({
          id: z.uuid(),
          company_id: z.uuid(),
          version: z.number().int().positive(),
        })
        .passthrough(),
    )
    .parse(existingInput);
  if (existing.some((r) => r.company_id !== plan.companyId))
    throw new Error("customer_snapshot_wrong_company");
  if (new Set(existing.map((r) => r.id)).size !== existing.length)
    throw new Error("duplicate_current_customer_identity");
  const records = source.map((record) => {
    const reasons: string[] = [];
    if (record.original.status !== "ACTIVO") reasons.push("source_status");
    const candidate = Object.fromEntries(
      Object.keys(customerSchema.shape).map((key) => [
        key,
        key === "status"
          ? "active"
          : typeof record.original[key] === "string"
            ? (record.original[key] as string).trim()
            : record.original[key] == null
              ? ""
              : record.original[key],
      ]),
    );
    const parsed = customerSchema.safeParse(candidate);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        reasons.push(`invalid:${String(issue.path[0])}`);
    for (const field of ["full_name", "email", "phone"] as const) {
      const key = customerMatchKey(field, record.original[field]);
      if (!key) continue;
      if (
        source.some(
          (other) =>
            other.sourceId !== record.sourceId &&
            customerMatchKey(field, other.original[field]) === key,
        )
      )
        reasons.push(`source_duplicate:${field}`);
      if (
        existing.some((other) => customerMatchKey(field, other[field]) === key)
      )
        reasons.push(`current_duplicate:${field}`);
    }
    return {
      historical_id: record.candidateId,
      source_sha256: record.sourceSha256,
      state: reasons.length ? ("review" as const) : ("imported" as const),
      review_reasons: [...new Set(reasons)].sort(),
      data: reasons.length ? null : parsed.data!,
    };
  });
  return {
    companyId: plan.companyId,
    snapshotSha256: plan.snapshotSha256,
    existing,
    records,
    planSha256: historyHash(records),
    summary: {
      source: records.length,
      ready: records.filter((r) => r.state === "imported").length,
      review: records.filter((r) => r.state === "review").length,
    },
  };
}
