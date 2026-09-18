import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  reconcileHistoricalFinance,
  type ReconciliationInput,
} from "../src/lib/financial-reconciliation";
import { completeQuery } from "../src/lib/complete-query";
import {
  historicalBusinessForDisplay,
  type HistoricalBusiness,
} from "../src/lib/historical-business";
import { FinancialReconciliationTable } from "../src/components/financial-reconciliation-table";
function fixture(): ReconciliationInput {
  const companyId = randomUUID(),
    invoice = randomUUID(),
    project = randomUUID(),
    client = randomUUID(),
    estimate = randomUUID(),
    currentProject = randomUUID(),
    currentCustomer = randomUUID();
  const base: HistoricalBusiness = {
    title: "Invoice 1",
    original_date: "2026-01-02",
    original_status: "OPEN",
    customer_name: "Synthetic customer",
    amount_cents: "10000",
    details: {
      paid_cents: "4000",
      balance_cents: "6000",
      payment_status: "PARTIAL",
    },
    review_reasons: [],
  };
  const row = {
    company_id: companyId,
    client_id: client,
    project_id: project,
    invoice_id: null,
    estimate_id: null,
  };
  return {
    companyId,
    history: [
      { ...row, id: invoice, kind: "invoices", presentation: base },
      {
        ...row,
        id: project,
        kind: "projects",
        estimate_id: estimate,
        presentation: { ...base, title: "Project", details: {} },
      },
      {
        ...row,
        id: randomUUID(),
        kind: "payments",
        invoice_id: invoice,
        presentation: {
          ...base,
          title: "Payment",
          original_status: "APPLIED",
          amount_cents: "4000",
          details: { method: "CASH", reference: "ABC" },
        },
      },
      {
        ...row,
        id: randomUUID(),
        kind: "payments",
        invoice_id: invoice,
        presentation: {
          ...base,
          title: "Voided payment",
          original_status: "VOID",
          amount_cents: "999999",
          details: { method: "CASH", reference: "" },
        },
      },
    ],
    estimates: [
      {
        company_id: companyId,
        id: estimate,
        presentation: {
          number: "E1",
          original_date: "2026-01-01",
          original_status: "APROBADO",
          customer_name: "Synthetic",
          total_cents: "10000",
          discount_cents: "0",
          taxes_cents: "0",
          difference_cents: "0",
          detail_state: "saved_lines",
          review_reasons: [],
          lines: [
            {
              description: "Original line",
              specification: "",
              amount_cents: "10000",
            },
          ],
        },
      },
    ],
    customers: [
      {
        company_id: companyId,
        historical_id: client,
        customer_id: currentCustomer,
        state: "imported",
      },
    ],
    projectMappings: [
      {
        company_id: companyId,
        historical_id: project,
        project_id: currentProject,
        state: "imported",
      },
    ],
    projects: [
      {
        company_id: companyId,
        id: currentProject,
        customer_id: currentCustomer,
      },
    ],
  };
}
test("reconciliation uses only applied payments and leaves source unchanged", () => {
  const input = fixture(),
    before = structuredClone(input),
    result = reconcileHistoricalFinance(input);
  assert.deepEqual(result.rows[0].arithmeticIssues, []);
  assert.deepEqual(result.rows[0].dataIssues, []);
  assert.deepEqual(result.rows[0].dependencyIssues, []);
  assert.equal(result.rows[0].applied, "4000");
  assert.equal(result.rows[0].excludedCount, 1);
  assert.equal(result.rows[0].expectedBalance, "6000");
  assert.deepEqual(input, before);
});
test("void invoices expect zero balance and never count associated or void payments", () => {
  const input = fixture();
  input.history[0].presentation.original_status = "VOID";
  input.history[0].presentation.details = {
    paid_cents: "0",
    balance_cents: "0",
    payment_status: "VOID",
  };
  input.history[2].presentation.original_status = "ASSOCIATED_TO_VOID_INVOICE";
  const row = reconcileHistoricalFinance(input).rows[0];
  assert.equal(row.expectedBalance, "0");
  assert.deepEqual(row.arithmeticIssues, []);
  assert.equal(row.excludedCount, 2);
  const original = {
    ...input.history[0].presentation,
    details: {
      ...input.history[0].presentation.details,
      balance_difference_cents: "10000",
      applied_cents: "0",
    },
    review_reasons: ["balance_mismatch"],
  };
  const display = historicalBusinessForDisplay(original);
  assert.equal(display.details.balance_difference_cents, "0");
  assert.deepEqual(display.review_reasons, []);
  assert.equal(original.details.balance_difference_cents, "10000");
  input.history[2].presentation.original_status = "APPLIED";
  assert.ok(
    reconcileHistoricalFinance(input).rows[0].arithmeticIssues.includes(
      "applied_to_void",
    ),
  );
});
test("exact cents preserve values beyond safe JavaScript integer precision", () => {
  const input = fixture(),
    large = 9007199254740999n;
  input.history[0].presentation.amount_cents = large.toString();
  input.history[0].presentation.details = {
    paid_cents: (large - 1n).toString(),
    balance_cents: "1",
    payment_status: "PARTIAL",
  };
  input.history[2].presentation.amount_cents = (large - 1n).toString();
  input.estimates[0].presentation.total_cents = large.toString();
  const row = reconcileHistoricalFinance(input).rows[0];
  assert.equal(row.expectedBalance, "1");
  assert.equal(row.paidDifference, "0");
  assert.deepEqual(row.arithmeticIssues, []);
});
test("retained void amounts are explained without clearing differences or changing payments", () => {
  const input = fixture();
  input.history[0].presentation.original_status = "VOID";
  input.history[0].presentation.details.payment_status = "VOID";
  input.history[2].presentation.original_status = "ASSOCIATED_TO_VOID_INVOICE";
  const before = structuredClone(input),
    result = reconcileHistoricalFinance(input),
    row = result.rows[0];
  assert.equal(row.retainedVoidAmounts, true);
  assert.equal(row.associated, "4000");
  assert.equal(row.associatedCount, 1);
  assert.equal(row.voidCount, 1);
  assert.equal(row.applied, "0");
  assert.equal(row.expectedBalance, "0");
  assert.deepEqual(row.arithmeticIssues, [
    "paid_difference",
    "balance_difference",
  ]);
  assert.equal(result.summary.arithmeticReview, 1);
  assert.equal(result.summary.arithmeticClear, 0);
  assert.equal(result.summary.retainedVoidAmounts, 1);
  assert.deepEqual(input, before);
  const html = renderToStaticMarkup(
    createElement(FinancialReconciliationTable, {
      rows: result.rows,
      companyId: input.companyId,
    }),
  );
  assert.ok(html.includes("Importes conservados al anular"));
  assert.ok(html.includes("Revisar importes"));
  assert.ok(html.includes("acreditan una devolución"));
});
test("void explanation requires matching amounts, states and relationships", () => {
  const base = fixture();
  base.history[0].presentation.original_status = "VOID";
  base.history[0].presentation.details.payment_status = "VOID";
  base.history[2].presentation.original_status = "ASSOCIATED_TO_VOID_INVOICE";
  const mutations: ((input: ReconciliationInput) => void)[] = [
    (i) => {
      i.history[0].presentation.original_status = "OPEN";
    },
    (i) => {
      i.history[0].presentation.details.payment_status = "PARTIAL";
    },
    (i) => {
      i.history[0].presentation.details.balance_cents = "5000";
    },
    (i) => {
      i.history[0].presentation.details.paid_cents = "3000";
    },
    (i) => {
      i.history[2].presentation.amount_cents = null;
    },
    (i) => {
      i.history[2].presentation.amount_cents = "-4000";
    },
    (i) => {
      i.history[2].presentation.amount_cents = "0";
    },
    (i) => {
      i.history[2].client_id = randomUUID();
    },
    (i) => {
      i.history[2].project_id = randomUUID();
    },
    (i) => {
      i.history[3].presentation.original_status = "UNKNOWN";
    },
    (i) => {
      i.history[2].presentation.original_status = "APPLIED";
    },
    (i) => {
      i.history[2].presentation.original_status = "VOID";
    },
    (i) => {
      i.history[0].presentation.review_reasons = ["client_conflict"];
    },
  ];
  for (const mutate of mutations) {
    const input = structuredClone(base);
    mutate(input);
    assert.equal(
      reconcileHistoricalFinance(input).rows[0].retainedVoidAmounts,
      false,
    );
  }
  base.history[2].presentation.amount_cents = null;
  assert.equal(reconcileHistoricalFinance(base).rows[0].associated, null);
});
test("differences, unknown states and invalid amounts cannot be marked numerically clear", () => {
  const input = fixture();
  input.history[0].presentation.details.paid_cents = "2000";
  input.history[0].presentation.details.balance_cents = "8000";
  let row = reconcileHistoricalFinance(input).rows[0];
  assert.equal(row.paidDifference, "2000");
  assert.equal(row.balanceDifference, "-2000");
  assert.ok(row.arithmeticIssues.includes("paid_difference"));
  assert.ok(row.arithmeticIssues.includes("balance_difference"));
  input.history[2].presentation.original_status = "UNKNOWN";
  row = reconcileHistoricalFinance(input).rows[0];
  assert.equal(row.applied, null);
  assert.equal(row.expectedBalance, null);
  assert.ok(row.arithmeticIssues.includes("unknown_payment_status"));
  input.history[2].presentation.original_status = "APPLIED";
  input.history[2].presentation.amount_cents = null;
  row = reconcileHistoricalFinance(input).rows[0];
  assert.equal(row.applied, null);
  assert.ok(row.arithmeticIssues.includes("invalid_money"));
});
test("payment evidence and dependencies are separate from matching arithmetic", () => {
  const input = fixture();
  input.history[2].presentation.details.method = "Not charged.";
  input.history[2].presentation.original_date = "not a date";
  input.customers[0].state = "review";
  input.projectMappings[0].state = "review";
  input.estimates[0].presentation.detail_state =
    "unavailable_in_reviewed_sources";
  input.estimates[0].presentation.lines = [];
  const row = reconcileHistoricalFinance(input).rows[0];
  assert.deepEqual(row.arithmeticIssues, []);
  assert.ok(row.dataIssues.includes("payment_method"));
  assert.ok(row.dataIssues.includes("invalid_date"));
  assert.ok(row.dependencyIssues.includes("customer_pending"));
  assert.ok(row.dependencyIssues.includes("project_pending"));
  assert.ok(row.dependencyIssues.includes("estimate_details"));
});
test("duplicate payment references, mismatched relationships and orphan payments remain visible", () => {
  const input = fixture();
  const duplicate = structuredClone(input.history[2]);
  duplicate.id = randomUUID();
  duplicate.client_id = randomUUID();
  input.history.push(duplicate);
  const orphan = structuredClone(input.history[2]);
  orphan.id = randomUUID();
  orphan.invoice_id = null;
  input.history.push(orphan);
  const result = reconcileHistoricalFinance(input);
  assert.ok(result.rows[0].dataIssues.includes("duplicate_reference"));
  assert.ok(result.rows[0].dataIssues.includes("payment_relationship"));
  assert.equal(result.orphans.length, 1);
  assert.equal(result.rows[0].paymentCount, 3);
});
test("foreign-company and duplicate records abort the reconciliation", () => {
  const input = fixture();
  input.projects[0].company_id = randomUUID();
  assert.throws(() => reconcileHistoricalFinance(input), /wrong_company/);
  const valid = fixture();
  valid.history.push(valid.history[0]);
  assert.throws(
    () => reconcileHistoricalFinance(valid),
    /duplicate_reconciliation_record/,
  );
});
test("financial table escapes original content and shows retained and calculated values", () => {
  const input = fixture();
  input.history[0].presentation.title = "<script>alert(1)</script>";
  const { rows } = reconcileHistoricalFinance(input);
  const html = renderToStaticMarkup(
    createElement(FinancialReconciliationTable, {
      rows,
      companyId: input.companyId,
    }),
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Guardado:"));
  assert.ok(html.includes("Aplicado:"));
  assert.ok(html.includes("Esperado:"));
});
test("complete query reads every page and refuses errors or silent truncation", async () => {
  const calls: number[] = [];
  const rows = await completeQuery(async (from) => {
    calls.push(from);
    return {
      error: null,
      count: 501,
      data: Array.from({ length: from === 0 ? 500 : 1 }, (_, i) => from + i),
    };
  });
  assert.equal(rows.length, 501);
  assert.deepEqual(calls, [0, 500]);
  await assert.rejects(
    completeQuery(async () => ({
      error: { message: "denied" },
      data: null,
      count: null,
    })),
    /completa/,
  );
  await assert.rejects(
    completeQuery(async () => ({
      error: null,
      count: 10001,
      data: Array.from({ length: 500 }, (_, i) => i),
    })),
    /límite/,
  );
  const capped = await completeQuery(async (from) => ({
    error: null,
    count: 230,
    data: Array.from({ length: Math.min(100, 230 - from) }, (_, i) => from + i),
  }));
  assert.equal(capped.length, 230);
  await assert.rejects(
    completeQuery(async () => ({ error: null, count: 10, data: [] })),
    /completa/,
  );
  await assert.rejects(
    completeQuery(async (from) => ({
      error: null,
      count: from === 0 ? 600 : 601,
      data: Array.from({ length: 500 }, (_, i) => i),
    })),
    /completa/,
  );
});
