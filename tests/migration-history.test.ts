import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { planEstimateMigration } from "../src/lib/migration/estimates";
import {
  historyHash,
  planHistoryMigration,
} from "../src/lib/migration/history";
import { stageHistory } from "../src/lib/migration/stage-history";

const company = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const fixture = () => ({
  format: "adt-history-snapshot-v1",
  origin: "restored_snapshot",
  clients: [{ external_id: "c1", full_name: "Synthetic customer" }],
  estimates: [
    {
      external_id: "e1",
      client_external_id: "c1",
      project_id: "p1",
      total: "10.00",
      discount: "0.00",
      taxes: "0.00",
      status: "ENVIADO_LEGACY",
      source_json: '{"items":[]}',
    },
  ],
  items: [] as Record<string, unknown>[],
  projects: [
    { external_id: "p1", client_external_id: "c1", estimate_external_id: "e1" },
  ],
  invoices: [
    {
      external_id: "i1",
      client_external_id: "c1",
      project_external_id: "p1",
      total: "10.00",
      status: "HISTORICAL",
    },
  ],
  payments: [
    {
      external_id: "pay1",
      invoice_external_id: "i1",
      client_external_id: "c1",
      project_external_id: "p1",
      amount: "5.00",
      status: "ORIGINAL",
    },
  ],
  documents: [
    {
      id: "1",
      estimate_external_id: "e1",
      client_external_id: "c1",
      project_external_id: "p1",
      url: "https://example.test/original.pdf",
    },
  ],
  contracts: [
    {
      external_id: "contract1",
      estimate_external_id: "e1",
      client_external_id: "c1",
      token: "synthetic-private-token",
      signed_html: "<p>Original</p>",
    },
  ],
});

test("history mapping preserves rows and resolves exact relationships including cycles", () => {
  const input = fixture(),
    plan = planHistoryMigration(input, company);
  assert.equal(plan.summary.records, 7);
  assert.equal(plan.summary.recordsWithRelationIssues, 0);
  assert.equal(plan.summary.references.resolved, 14);
  const contract = plan.records.find((r) => r.kind === "contracts")!;
  assert.deepEqual(contract.original, input.contracts[0]);
  const estimate = plan.records.find((r) => r.kind === "estimates")!;
  const previous = planEstimateMigration(
    { ...input, format: "adt-estimates-snapshot-v1" },
    company,
  ).records[0];
  assert.equal(estimate.candidateId, previous.candidateId);
  assert.equal(
    estimate.presentation?.details,
    "unavailable_in_reviewed_sources",
  );
  assert.equal(estimate.presentation?.totalCents, "1000");
  assert.equal(estimate.presentation?.originalStatus, "ENVIADO_LEGACY");
  assert.equal(estimate.presentation?.allowIssue, false);
  assert.equal(estimate.presentation?.allowRecalculate, false);
  assert.ok(
    estimate.presentation?.reviewReasons.includes("missing_effective_items"),
  );
});

test("missing targets remain unattached even when other fields match", () => {
  const input = fixture();
  input.documents[0].estimate_external_id = "absent";
  const doc = planHistoryMigration(input, company).records.find(
    (r) => r.kind === "documents",
  )!;
  const reference = doc.references.find(
    (r) => r.field === "estimate_external_id",
  )!;
  assert.equal(reference.status, "missing");
  assert.equal(reference.candidateId, null);
  assert.equal(reference.sourceValue, "absent");
  assert.ok(doc.issues.includes("missing:estimate_external_id"));
  assert.equal(doc.original.client_external_id, "c1");
});

test("foreign client/project and inverse estimate references are flagged without rewriting", () => {
  const input = fixture();
  input.clients.push({ external_id: "c2", full_name: "Synthetic customer" });
  input.projects.push({
    external_id: "p2",
    client_external_id: "c2",
    estimate_external_id: "e1",
  });
  input.payments[0].client_external_id = "c2";
  input.payments[0].project_external_id = "p2";
  input.projects[0].estimate_external_id = "other-estimate";
  const plan = planHistoryMigration(input, company);
  const payment = plan.records.find((r) => r.kind === "payments")!;
  assert.ok(payment.issues.includes("client_conflict:invoice_external_id"));
  assert.ok(payment.issues.includes("project_conflict:invoice_external_id"));
  const invoiceReference = payment.references.find(
    (r) => r.field === "invoice_external_id",
  )!;
  assert.equal(invoiceReference.status, "conflict");
  assert.equal(invoiceReference.candidateId, null);
  assert.equal(payment.relationDisposition, "hold_for_review");
  assert.deepEqual(payment.original, input.payments[0]);
  assert.ok(
    plan.records
      .find((r) => r.kind === "estimates")!
      .issues.includes("estimate_project_inverse_conflict"),
  );
});

test("identities are scoped by table and company, never by name or numeric coercion", () => {
  const input = fixture();
  input.clients.push({ external_id: "e1", full_name: "Synthetic customer" });
  const first = planHistoryMigration(input, company),
    other = planHistoryMigration(input, second);
  assert.equal(
    new Set(first.records.map((r) => r.candidateId)).size,
    first.records.length,
  );
  for (let i = 0; i < first.records.length; i++)
    assert.notEqual(first.records[i].candidateId, other.records[i].candidateId);
  input.documents[0].estimate_external_id = " e1";
  const doc = planHistoryMigration(input, company).records.find(
    (r) => r.kind === "documents",
  )!;
  assert.equal(doc.references[0].status, "invalid");
  input.clients.push({ ...input.clients[0] });
  assert.throws(
    () => planHistoryMigration(input, company),
    /duplicate_history_identity/,
  );
});

test("uncaptured reference domains are explicit and saved lines stay historical", () => {
  const input = fixture();
  input.items.push({
    external_id: "item1",
    estimate_external_id: "e1",
    product_external_id: "product-not-in-snapshot",
    line_total: "10.00",
    position: "0",
  });
  const plan = planHistoryMigration(input, company);
  assert.equal(
    plan.records.find((r) => r.kind === "estimates")?.presentation?.details,
    "saved_lines",
  );
  const item = plan.records.find((r) => r.kind === "items")!;
  assert.equal(item.references[1].status, "out_of_scope");
  assert.equal(item.references[1].candidateId, null);
  assert.deepEqual(item.original, input.items[0]);
});

test("history rehearsal is atomic, repeatable, company-bound and detects changed links", async (t) => {
  const db = new PGlite();
  const input = fixture();
  try {
    await t.test(
      "first load preserves originals with enforced target foreign keys",
      async () => {
        assert.equal((await stageHistory(db, input, company)).inserted, 7);
        const records = await db.query<{
          source_sha256: string;
          original: unknown;
        }>("select source_sha256,original from history_rehearsal.records");
        for (const r of records.rows)
          assert.equal(r.source_sha256, historyHash(r.original));
        assert.equal(
          (
            await db.query(
              "select * from history_rehearsal.relations where status='resolved'",
            )
          ).rows.length,
          14,
        );
        await assert.rejects(
          db.query(
            "update history_rehearsal.relations set target_id=$1 where status='resolved'",
            [second],
          ),
          /foreign key/,
        );
        assert.equal(
          (
            await db.query(
              "select * from information_schema.tables where table_schema='public'",
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "reopening logic does not duplicate rows or relations",
      async () => {
        const result = await stageHistory(db, input, company);
        assert.equal(result.inserted, 0);
        assert.equal(result.unchanged, 7);
        assert.equal(
          (
            await db.query(
              "select * from history_rehearsal.relations where status='resolved'",
            )
          ).rows.length,
          14,
        );
      },
    );
    await t.test("another company cannot reuse the rehearsal", async () => {
      await assert.rejects(
        stageHistory(db, input, second),
        /destination_company_mismatch/,
      );
    });
    await t.test(
      "late financial source conflict rolls back earlier new customer",
      async () => {
        const changed = fixture();
        changed.clients.push({ external_id: "c2", full_name: "New synthetic" });
        changed.payments[0].amount = "6.00";
        await assert.rejects(
          stageHistory(db, changed, company),
          /history_source_or_relationship_changed/,
        );
        assert.equal(
          (await db.query("select * from history_rehearsal.records")).rows
            .length,
          7,
        );
        assert.equal(
          (await db.query("select * from history_rehearsal.runs")).rows.length,
          2,
        );
      },
    );
    await t.test(
      "removing a target changes the graph and cannot leave stale links",
      async () => {
        const changed = fixture();
        changed.projects = [];
        await assert.rejects(
          stageHistory(db, changed, company),
          /history_source_or_relationship_changed/,
        );
        assert.equal(
          (
            await db.query(
              "select * from history_rehearsal.relations where status='resolved'",
            )
          ).rows.length,
          14,
        );
      },
    );
  } finally {
    await db.close();
  }
});
