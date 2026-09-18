import {
  historicalBusinessSchema,
  historicalKinds,
  type HistoricalKind,
} from "../historical-business";
import { exactCents } from "./estimates";
import { historyHash, planHistoryMigration } from "./history";
const text = (v: unknown) => (typeof v === "string" ? v : "");
export function historicalBusinessPayload(input: unknown, companyId: string) {
  const plan = planHistoryMigration(input, companyId);
  const clients = new Map(
    plan.records
      .filter((r) => r.kind === "clients")
      .map((r) => [r.sourceId, r.original]),
  );
  const payments = plan.records.filter((r) => r.kind === "payments");
  const records = plan.records
    .filter((r) => (historicalKinds as readonly string[]).includes(r.kind))
    .map((record) => {
      const kind = record.kind as HistoricalKind,
        source = record.original;
      if (
        record.references.some((r) =>
          ["conflict", "missing", "invalid"].includes(r.status),
        )
      )
        throw new Error("business_relationship_requires_review");
      const link = (field: string) =>
        record.references.find(
          (r) => r.field === field && r.status === "resolved",
        )?.candidateId ?? null;
      const customer =
        kind === "clients"
          ? source
          : clients.get(text(source.client_external_id));
      const reasons = [...record.issues];
      const details: Record<string, string | null> = {};
      const money = (v: unknown) => {
        const amount = exactCents(v);
        if (amount === null) reasons.push("invalid_money");
        return amount;
      };
      let amount: bigint | null = null;
      if (kind === "clients") {
        for (const key of [
          "email",
          "phone",
          "address",
          "city",
          "postal_code",
          "service",
        ])
          details[key] = text(source[key]);
        if (text(source.status).startsWith("SKIP:"))
          reasons.push("source_client_warning");
      } else amount = money(kind === "payments" ? source.amount : source.total);
      if (kind === "invoices") {
        const paid = money(source.paid_amount),
          balance = money(source.balance_due);
        details.paid_cents = paid?.toString() ?? null;
        details.balance_cents = balance?.toString() ?? null;
        details.payment_status = text(source.payment_status);
        details.void_reason = text(source.void_reason);
        const related = payments.filter(
          (p) => p.original.invoice_external_id === record.sourceId,
        );
        const unknown = related.some(
          (p) =>
            !["APPLIED", "VOID", "ASSOCIATED_TO_VOID_INVOICE"].includes(
              text(p.original.status),
            ),
        );
        if (unknown) reasons.push("unknown_payment_status");
        const applied = related
          .filter((p) => p.original.status === "APPLIED")
          .map((p) => money(p.original.amount));
        const sum =
          unknown || applied.includes(null)
            ? null
            : applied.reduce<bigint>((a, b) => a + b!, 0n);
        const paidDifference =
          sum !== null && paid !== null ? sum - paid : null;
        const balanceDifference =
          sum !== null && amount !== null && balance !== null
            ? amount - sum - balance
            : null;
        details.applied_cents = sum?.toString() ?? null;
        details.paid_difference_cents = paidDifference?.toString() ?? null;
        details.balance_difference_cents =
          balanceDifference?.toString() ?? null;
        if (paidDifference !== null && paidDifference !== 0n)
          reasons.push("paid_mismatch");
        if (balanceDifference !== null && balanceDifference !== 0n)
          reasons.push("balance_mismatch");
      }
      if (kind === "payments")
        for (const key of ["method", "reference", "void_reason"])
          details[key] = text(source[key]);
      const dateField = {
        clients: "client_date",
        projects: "project_date",
        invoices: "invoice_date",
        payments: "payment_date",
      }[kind];
      const title =
        kind === "clients"
          ? text(source.full_name)
          : kind === "projects"
            ? text(source.name)
            : kind === "invoices"
              ? text(source.consecutive)
              : text(source.reference);
      const presentation = historicalBusinessSchema.parse({
        title: title || record.sourceId,
        original_date: text(source[dateField]),
        original_status: text(source.status),
        customer_name: text(customer?.full_name),
        amount_cents: amount?.toString() ?? null,
        details,
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
        invoice_id: link("invoice_external_id"),
        estimate_id: link("estimate_external_id"),
      };
    });
  return {
    companyId: plan.companyId,
    snapshotSha256: plan.snapshotSha256,
    records,
  };
}
