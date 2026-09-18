import { z } from "zod";
import { projectSchema } from "../finance";
import { historyHash, planHistoryMigration } from "./history";
import { customerMatchKey } from "./operational-customers";

const destinationSchema = z.object({
  projects: z.array(
    z.object({ id: z.uuid(), company_id: z.uuid() }).passthrough(),
  ),
  customer_ids: z.array(z.uuid()),
  customer_mappings: z.array(
    z
      .object({
        company_id: z.uuid(),
        historical_id: z.uuid(),
        customer_id: z.uuid().nullable(),
        state: z.enum(["imported", "review"]),
      })
      .passthrough(),
  ),
});
export function planOperationalProjects(
  input: unknown,
  destinationInput: unknown,
  companyId: string,
) {
  const history = planHistoryMigration(input, companyId),
    destination = destinationSchema.parse(destinationInput);
  if (
    [...destination.projects, ...destination.customer_mappings].some(
      (r) => r.company_id !== history.companyId,
    )
  )
    throw new Error("project_destination_wrong_company");
  if (
    new Set(destination.customer_mappings.map((r) => r.historical_id)).size !==
    destination.customer_mappings.length
  )
    throw new Error("duplicate_customer_mapping");
  const source = history.records.filter((r) => r.kind === "projects");
  const records = source.map((record) => {
    const reasons: string[] = [],
      original = record.original;
    const client = record.references.find(
      (r) => r.field === "client_external_id" && r.status === "resolved",
    );
    const estimate = record.references.find(
      (r) => r.field === "estimate_external_id" && r.status === "resolved",
    );
    const mapping = destination.customer_mappings.find(
      (m) => m.historical_id === client?.candidateId,
    );
    const customer =
      mapping?.state === "imported" &&
      mapping.customer_id &&
      destination.customer_ids.includes(mapping.customer_id)
        ? mapping.customer_id
        : null;
    if (!customer) reasons.push("customer_pending");
    if (!estimate) reasons.push("estimate_reference");
    if (original.status !== "Nuevo") reasons.push("source_status");
    const fields = {
      name: original.name,
      status: "NUEVO",
      start_date: null,
      end_date: null,
      notes: "",
    };
    const parsed = projectSchema.safeParse(fields),
      date = z.iso.date().safeParse(original.project_date);
    if (!parsed.success) reasons.push("invalid_project_fields");
    if (!date.success) reasons.push("invalid_project_date");
    if (
      record.references.some((r) =>
        ["conflict", "missing", "invalid"].includes(r.status),
      )
    )
      reasons.push("source_relationship");
    const name = customerMatchKey("full_name", original.name);
    if (
      source.some(
        (other) =>
          other.sourceId !== record.sourceId &&
          original.estimate_external_id &&
          other.original.estimate_external_id === original.estimate_external_id,
      )
    )
      reasons.push("source_duplicate");
    if (
      customer &&
      destination.projects.some(
        (p) =>
          p.customer_id === customer &&
          customerMatchKey("full_name", p.name) === name,
      )
    )
      reasons.push("current_duplicate");
    return {
      historical_id: record.candidateId,
      source_sha256: record.sourceSha256,
      state: reasons.length ? ("review" as const) : ("imported" as const),
      review_reasons: [...new Set(reasons)].sort(),
      customer_id: reasons.length ? null : customer,
      data: reasons.length
        ? null
        : { ...parsed.data!, project_date: date.data! },
    };
  });
  return {
    companyId: history.companyId,
    snapshotSha256: history.snapshotSha256,
    destination,
    records,
    planSha256: historyHash(records),
    summary: {
      source: records.length,
      ready: records.filter((r) => r.state === "imported").length,
      review: records.filter((r) => r.state === "review").length,
    },
  };
}
