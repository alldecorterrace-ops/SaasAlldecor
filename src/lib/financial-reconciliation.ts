import { z } from "zod";
import { historicalBusinessSchema } from "./historical-business";
import { historicalEstimateSchema } from "./historical-estimates";
const id = z.uuid();
export const invoiceDetailReviewSchema = z.object({
  company_id: id,
  historical_id: id,
  detail_state: z.enum(["missing", "invalid", "saved_lines"]),
  item_count: z.number().int().nonnegative(),
  line_sum_cents: z
    .string()
    .regex(/^-?\d{1,18}$/)
    .nullable(),
  subtotal_cents: z
    .string()
    .regex(/^-?\d{1,18}$/)
    .nullable(),
  line_difference_cents: z
    .string()
    .regex(/^-?\d{1,18}$/)
    .nullable(),
  summary_difference_cents: z
    .string()
    .regex(/^-?\d{1,18}$/)
    .nullable(),
  saved_total_matches: z.boolean().nullable(),
});
export const reconciliationInputSchema = z.object({
  companyId: id,
  invoiceDetails: z.array(invoiceDetailReviewSchema).optional(),
  history: z.array(
    z.object({
      id,
      company_id: id,
      kind: z.enum(["projects", "invoices", "payments"]),
      client_id: id.nullable(),
      project_id: id.nullable(),
      invoice_id: id.nullable(),
      estimate_id: id.nullable(),
      presentation: historicalBusinessSchema,
    }),
  ),
  estimates: z.array(
    z.object({ id, company_id: id, presentation: historicalEstimateSchema }),
  ),
  customers: z.array(
    z.object({
      company_id: id,
      historical_id: id,
      customer_id: id.nullable(),
      state: z.enum(["imported", "review"]),
    }),
  ),
  projectMappings: z.array(
    z.object({
      company_id: id,
      historical_id: id,
      project_id: id.nullable(),
      state: z.enum(["imported", "review"]),
    }),
  ),
  projects: z.array(z.object({ id, company_id: id, customer_id: id })),
});
export type ReconciliationInput = z.infer<typeof reconciliationInputSchema>;
export const financialReconciliationLabels: Record<string, string> = {
  invoice_details_missing:
    "Faltan las líneas propias de la factura en la copia revisada.",
  invoice_details_invalid:
    "El detalle propio de la factura contiene datos inválidos o incompletos.",
  invoice_line_difference:
    "La suma de las líneas propias difiere del subtotal guardado.",
  invoice_summary_difference:
    "El subtotal, descuento e impuestos propios no coinciden con el total de factura.",
  invoice_saved_total_difference:
    "El total del detalle guardado difiere del total de factura.",
  invalid_money: "Hay importes ausentes, negativos o inválidos.",
  unknown_invoice_status: "El estado de la factura requiere revisión.",
  unknown_payment_status: "Hay pagos con estados no reconocidos.",
  paid_difference: "El pagado guardado no coincide con los pagos aplicados.",
  balance_difference:
    "El saldo guardado no coincide con el saldo esperado para su estado.",
  payment_status_difference:
    "El estado de pago guardado no coincide con los importes y el estado de la factura.",
  overpayment: "Los pagos aplicados superan el total de la factura.",
  applied_to_void: "La factura está anulada pero conserva pagos aplicados.",
  invalid_date: "Hay fechas de factura o pagos que requieren revisión.",
  payment_method: "Hay pagos aplicados cuyo método necesita confirmación.",
  duplicate_reference:
    "Hay pagos con la misma referencia y método en esta factura.",
  duplicate_number: "El número de factura se repite en el histórico.",
  payment_relationship:
    "Un pago tiene vínculos distintos de los de su factura.",
  customer_pending:
    "El cliente aún no tiene una correspondencia operativa confirmada.",
  project_pending:
    "El proyecto aún no tiene una correspondencia operativa confirmada.",
  customer_project_mismatch:
    "El proyecto operativo no corresponde al cliente de esta factura.",
  estimate_pending: "Falta verificar el estimado original del proyecto.",
  estimate_details:
    "El desglose del estimado original está incompleto o presenta diferencias.",
  estimate_total_difference:
    "El total de factura difiere del estimado histórico; revisar la versión y los documentos.",
  associated_to_open:
    "Hay pagos marcados como asociados a factura anulada en una factura abierta.",
  source_relationship: "Hay referencias históricas pendientes de comprobar.",
  service_reference:
    "La referencia histórica del servicio necesita verificarse.",
};
const cents = (value: string | null | undefined) =>
  value != null && /^-?\d{1,16}$/.test(value) ? BigInt(value) : null;
const text = (value: bigint | null) =>
  value === null ? null : value.toString();
const knownMethods = new Set([
  "CASH",
  "CHEQUE",
  "Wire transfer",
  "ZELL",
  "STRIPE",
]);
export function reconcileHistoricalFinance(input: unknown) {
  const source = reconciliationInputSchema.parse(input);
  for (const records of [
    source.history,
    source.estimates,
    source.customers,
    source.projectMappings,
    source.projects,
    source.invoiceDetails ?? [],
  ])
    if (records.some((r) => r.company_id !== source.companyId))
      throw new Error("reconciliation_wrong_company");
  const invoices = source.history.filter((r) => r.kind === "invoices"),
    payments = source.history.filter((r) => r.kind === "payments");
  const keys = source.history.map((r) => `${r.kind}:${r.id}`);
  if (new Set(keys).size !== keys.length)
    throw new Error("duplicate_reconciliation_record");
  if (source.invoiceDetails) {
    const detailIds = new Set(
      source.invoiceDetails.map((r) => r.historical_id),
    );
    if (
      detailIds.size !== source.invoiceDetails.length ||
      detailIds.size !== invoices.length ||
      invoices.some((r) => !detailIds.has(r.id))
    )
      throw new Error("incomplete_invoice_detail_review");
  }
  const rows = invoices
    .map((invoice) => {
      const p = invoice.presentation,
        related = payments.filter((r) => r.invoice_id === invoice.id),
        arithmeticIssues: string[] = [],
        dataIssues: string[] = [],
        dependencyIssues: string[] = [];
      const ownDetails =
        source.invoiceDetails?.find((r) => r.historical_id === invoice.id) ??
        null;
      if (ownDetails) {
        if (ownDetails.detail_state === "missing")
          dataIssues.push("invoice_details_missing");
        if (ownDetails.detail_state === "invalid")
          dataIssues.push("invoice_details_invalid");
        if (
          ownDetails.line_difference_cents !== null &&
          BigInt(ownDetails.line_difference_cents) !== 0n
        )
          arithmeticIssues.push("invoice_line_difference");
        if (
          ownDetails.summary_difference_cents !== null &&
          BigInt(ownDetails.summary_difference_cents) !== 0n
        )
          arithmeticIssues.push("invoice_summary_difference");
        if (ownDetails.saved_total_matches === false)
          arithmeticIssues.push("invoice_saved_total_difference");
      }
      const total = cents(p.amount_cents),
        paid = cents(p.details.paid_cents),
        balance = cents(p.details.balance_cents),
        voided = p.original_status === "VOID";
      if (
        total === null ||
        paid === null ||
        balance === null ||
        total < 0n ||
        paid < 0n ||
        balance < 0n
      )
        arithmeticIssues.push("invalid_money");
      if (!["OPEN", "VOID"].includes(p.original_status))
        arithmeticIssues.push("unknown_invoice_status");
      if (
        related.some(
          (r) =>
            !["APPLIED", "VOID", "ASSOCIATED_TO_VOID_INVOICE"].includes(
              r.presentation.original_status,
            ),
        )
      )
        arithmeticIssues.push("unknown_payment_status");
      const applied = related.filter(
          (r) => r.presentation.original_status === "APPLIED",
        ),
        amounts = applied.map((r) => cents(r.presentation.amount_cents));
      if (amounts.some((a) => a === null || a <= 0n))
        arithmeticIssues.push("invalid_money");
      const sum =
        arithmeticIssues.includes("unknown_payment_status") ||
        amounts.some((a) => a === null || a <= 0n)
          ? null
          : amounts.reduce<bigint>((a, b) => a + b!, 0n);
      const associated = related.filter(
          (r) =>
            r.presentation.original_status === "ASSOCIATED_TO_VOID_INVOICE",
        ),
        associatedAmounts = associated.map((r) =>
          cents(r.presentation.amount_cents),
        ),
        associatedSum = associatedAmounts.some((a) => a === null || a <= 0n)
          ? null
          : associatedAmounts.reduce<bigint>((a, b) => a + b!, 0n);
      const expectedBalance = voided
        ? 0n
        : p.original_status === "OPEN" && total !== null && sum !== null
          ? total - sum
          : null;
      if (sum !== null && paid !== null && sum !== paid)
        arithmeticIssues.push("paid_difference");
      if (
        expectedBalance !== null &&
        balance !== null &&
        expectedBalance !== balance
      )
        arithmeticIssues.push("balance_difference");
      if (sum !== null && total !== null && sum > total)
        arithmeticIssues.push("overpayment");
      if (voided && applied.length) arithmeticIssues.push("applied_to_void");
      const expectedStatus = voided
        ? "VOID"
        : p.original_status === "OPEN" && sum !== null && total !== null
          ? sum === 0n
            ? "UNPAID"
            : sum === total
              ? "PAID"
              : "PARTIAL"
          : null;
      if (expectedStatus && p.details.payment_status !== expectedStatus)
        arithmeticIssues.push("payment_status_difference");
      if (
        !z.iso.date().safeParse(p.original_date).success ||
        related.some(
          (r) => !z.iso.date().safeParse(r.presentation.original_date).success,
        )
      )
        dataIssues.push("invalid_date");
      if (
        applied.some(
          (r) => !knownMethods.has(r.presentation.details.method ?? ""),
        )
      )
        dataIssues.push("payment_method");
      const refs = applied
        .map((r) => [
          r.presentation.details.method ?? "",
          r.presentation.details.reference?.trim() ?? "",
        ])
        .filter((r) => r[1])
        .map((r) => JSON.stringify(r));
      if (new Set(refs).size !== refs.length)
        dataIssues.push("duplicate_reference");
      if (
        invoices.some(
          (other) =>
            other.id !== invoice.id && other.presentation.title === p.title,
        )
      )
        dataIssues.push("duplicate_number");
      if (
        related.some(
          (r) =>
            r.client_id !== invoice.client_id ||
            r.project_id !== invoice.project_id,
        )
      )
        dataIssues.push("payment_relationship");
      if (
        !voided &&
        related.some(
          (r) =>
            r.presentation.original_status === "ASSOCIATED_TO_VOID_INVOICE",
        )
      )
        dataIssues.push("associated_to_open");
      if (p.review_reasons.includes("out_of_scope:service_external_id"))
        dataIssues.push("service_reference");
      if (
        p.review_reasons.some(
          (r) =>
            (r.startsWith("out_of_scope:") &&
              r !== "out_of_scope:service_external_id") ||
            r.includes("conflict"),
        )
      )
        dataIssues.push("source_relationship");
      // ADT's void action retains paid/balance and relabels applied payments.
      // This explains matching retained amounts; it never clears differences,
      // proves a refund, or turns associated payments into applied payments.
      const retainedVoidAmounts =
        voided &&
        p.details.payment_status === "VOID" &&
        associated.length > 0 &&
        associatedSum !== null &&
        sum === 0n &&
        applied.length === 0 &&
        total !== null &&
        paid !== null &&
        balance !== null &&
        total >= 0n &&
        paid > 0n &&
        balance >= 0n &&
        associatedSum === paid &&
        balance === total - paid &&
        !dataIssues.includes("payment_relationship") &&
        !dataIssues.includes("source_relationship");
      const customer = source.customers.find(
          (r) =>
            r.historical_id === invoice.client_id && r.state === "imported",
        ),
        mapping = source.projectMappings.find(
          (r) =>
            r.historical_id === invoice.project_id && r.state === "imported",
        ),
        project = source.projects.find((r) => r.id === mapping?.project_id);
      if (!customer?.customer_id) dependencyIssues.push("customer_pending");
      if (!project) dependencyIssues.push("project_pending");
      if (
        project &&
        customer?.customer_id &&
        project.customer_id !== customer.customer_id
      )
        dependencyIssues.push("customer_project_mismatch");
      const historicalProject = source.history.find(
          (r) => r.kind === "projects" && r.id === invoice.project_id,
        ),
        estimate = source.estimates.find(
          (r) => r.id === historicalProject?.estimate_id,
        )?.presentation;
      if (!estimate) dependencyIssues.push("estimate_pending");
      else {
        if (
          estimate.detail_state !== "saved_lines" ||
          estimate.difference_cents !== "0" ||
          estimate.review_reasons.length
        )
          dependencyIssues.push("estimate_details");
        if (total !== null && cents(estimate.total_cents) !== total)
          dependencyIssues.push("estimate_total_difference");
      }
      return {
        id: invoice.id,
        title: p.title,
        customerName: p.customer_name,
        date: p.original_date,
        status: p.original_status,
        total: p.amount_cents,
        storedPaid: p.details.paid_cents ?? null,
        storedBalance: p.details.balance_cents ?? null,
        applied: text(sum),
        associated: text(associatedSum),
        associatedCount: associated.length,
        voidCount: related.filter(
          (r) => r.presentation.original_status === "VOID",
        ).length,
        retainedVoidAmounts,
        ownDetails,
        expectedBalance: text(expectedBalance),
        paidDifference: paid !== null && sum !== null ? text(sum - paid) : null,
        balanceDifference:
          balance !== null && expectedBalance !== null
            ? text(expectedBalance - balance)
            : null,
        paymentCount: related.length,
        appliedCount: applied.length,
        excludedCount: related.filter((r) =>
          ["VOID", "ASSOCIATED_TO_VOID_INVOICE"].includes(
            r.presentation.original_status,
          ),
        ).length,
        arithmeticIssues: [...new Set(arithmeticIssues)],
        dataIssues: [...new Set(dataIssues)],
        dependencyIssues: [...new Set(dependencyIssues)],
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const invoiceIds = new Set(invoices.map((r) => r.id)),
    orphans = payments
      .filter((r) => !r.invoice_id || !invoiceIds.has(r.invoice_id))
      .map((r) => ({
        id: r.id,
        title: r.presentation.title,
        date: r.presentation.original_date,
        status: r.presentation.original_status,
        amount: r.presentation.amount_cents,
      }));
  return {
    rows,
    orphans,
    summary: {
      invoices: rows.length,
      payments: payments.length,
      arithmeticClear: rows.filter((r) => !r.arithmeticIssues.length).length,
      arithmeticReview: rows.filter((r) => r.arithmeticIssues.length).length,
      retainedVoidAmounts: rows.filter((r) => r.retainedVoidAmounts).length,
      dataReview: rows.filter((r) => r.dataIssues.length).length,
      dependencyReview: rows.filter((r) => r.dependencyIssues.length).length,
      orphanPayments: orphans.length,
    },
  };
}
