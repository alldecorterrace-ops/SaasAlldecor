import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  exactCents,
  planEstimateMigration,
} from "../src/lib/migration/estimates";

const company = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const estimate = (extra = {}) => ({
  external_id: "example-1",
  total: "10.00",
  discount: "0.00",
  taxes: "0.00",
  status: "TERMINADO",
  source_json: JSON.stringify({
    items: [{ label: "Synthetic item", price: 10, data: { qty: 1 } }],
  }),
  ...extra,
});
const snapshot = (estimates: unknown[], items: unknown[] = []) => ({
  format: "adt-estimates-snapshot-v1",
  origin: "restored_snapshot",
  estimates,
  items,
});
const item = (extra = {}) => ({
  id: "1",
  external_id: "manual-1",
  estimate_external_id: "example-1",
  position: "0",
  created: "100",
  changed: "100",
  line_total: "10.00",
  ...extra,
});

test("historical money uses exact cents and never silently rounds", () => {
  assert.equal(exactCents("99999999999999.99"), 9999999999999999n);
  assert.equal(exactCents("0.10"), 10n);
  assert.equal(exactCents("-0.25"), -25n);
  assert.equal(exactCents(99999999999999.99), null);
  for (const value of [
    null,
    undefined,
    "1.005",
    Infinity,
    NaN,
    "$10",
    true,
    "1e4",
    "1,000.00",
    {},
  ])
    assert.equal(exactCents(value), null);
});
test("dry run preserves original payload, status and both item representations", () => {
  const input = snapshot(
    [
      estimate({
        notes: "Original note",
        source_json: '{"items":[{"price":10}],"geometry":{"custom":true}}',
      }),
    ],
    [item()],
  );
  const before = structuredClone(input);
  const plan = planEstimateMigration(input, company);
  assert.deepEqual(input, before);
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.writesEnabled, false);
  assert.deepEqual(plan.records[0].original.estimate, input.estimates[0]);
  assert.deepEqual(plan.records[0].original.items, input.items);
  assert.equal(plan.records[0].originalStatus, "TERMINADO");
  assert.equal(plan.summary.reconciled, 1);
});
test("replay identity is stable, company-scoped and content changes alter only digest", () => {
  const input = snapshot([estimate()]);
  const first = planEstimateMigration(input, company).records[0];
  assert.deepEqual(planEstimateMigration(input, company).records[0], first);
  assert.notEqual(
    planEstimateMigration(input, other).records[0].candidateId,
    first.candidateId,
  );
  const updated = planEstimateMigration(
    snapshot([estimate({ notes: "A later revision" })]),
    company,
  ).records[0];
  assert.equal(updated.candidateId, first.candidateId);
  assert.notEqual(updated.sourceSha256, first.sourceSha256);
});
test("duplicate identities, orphan rows and invalid target are rejected", () => {
  assert.throws(
    () => planEstimateMigration(snapshot([estimate(), estimate()]), company),
    /identity/,
  );
  assert.throws(() =>
    planEstimateMigration(snapshot([estimate({ external_id: "" })]), company),
  );
  assert.throws(
    () =>
      planEstimateMigration(
        snapshot([estimate()], [item({ estimate_external_id: "absent" })]),
        company,
      ),
    /orphan/,
  );
  assert.throws(() =>
    planEstimateMigration(snapshot([estimate()]), "not-a-company"),
  );
});
test("missing details stay missing and never become a fabricated total-only line", () => {
  const plan = planEstimateMigration(
    snapshot([estimate({ source_json: '{"status":"TERMINADO"}' })]),
    company,
  );
  assert.equal(plan.summary.withoutItems, 1);
  assert.equal(plan.summary.requiresReview, 1);
  assert.equal(plan.records[0].effectiveLines.length, 0);
  assert.equal(plan.records[0].reconciliation.storedTotalCents, "1000");
  assert.equal(plan.records[0].reconciliation.calculatedTotalCents, null);
});
test("JSON is authoritative over untouched ADT seeded projections but not manual rows", () => {
  const seeded =
    "ei" +
    createHash("md5").update("example-1|sj|0|100").digest("hex").slice(0, 10);
  const input = snapshot(
    [estimate()],
    [item({ external_id: seeded, line_total: "7.00" })],
  );
  const plan = planEstimateMigration(input, company);
  assert.equal(plan.records[0].itemSource, "source_json");
  assert.equal(plan.summary.reconciled, 1);
  assert.equal(plan.records[0].original.items[0].line_total, "7.00");
  const manual = planEstimateMigration(
    snapshot(
      [estimate()],
      [item({ external_id: seeded, changed: "101", line_total: "7.00" })],
    ),
    company,
  );
  assert.equal(manual.records[0].itemSource, "item_table");
  assert.equal(manual.records[0].reconciliation.differenceCents, "-300");
  assert.ok(
    manual.records[0].reviewReasons.includes("historical_total_mismatch"),
  );
});
test("explicit source markers win even when their selected source is empty", () => {
  for (const marker of ["source_json", "item_table"]) {
    const json =
      marker === "source_json"
        ? { _adt_items_source: marker, items: [] }
        : { _adt_items_source: marker, items: [{ price: 10 }] };
    const plan = planEstimateMigration(
      snapshot(
        [estimate({ source_json: JSON.stringify(json) })],
        marker === "source_json" ? [item()] : [],
      ),
      company,
    );
    assert.equal(plan.records[0].itemSource, marker);
    assert.equal(plan.summary.withoutItems, 1);
  }
});
test("invalid JSON and invalid financial values remain preserved and flagged", () => {
  const original = estimate({ source_json: "{invalid", total: "10.005" });
  const plan = planEstimateMigration(snapshot([original]), company);
  assert.deepEqual(plan.records[0].original.estimate, original);
  assert.ok(
    plan.records[0].reviewReasons.includes("invalid_or_missing_source_json"),
  );
  assert.ok(plan.records[0].reviewReasons.includes("invalid_document_amount"));
  const badLine = planEstimateMigration(
    snapshot([estimate({ source_json: '{"items":[null,{"price":-1}]}' })]),
    company,
  );
  assert.ok(badLine.records[0].reviewReasons.includes("invalid_item_amount"));
});
test("discount and taxes reconcile exactly without changing historical total", () => {
  const plan = planEstimateMigration(
    snapshot([estimate({ discount: "1.50", taxes: "0.50", total: "9.00" })]),
    company,
  );
  assert.equal(plan.records[0].reconciliation.calculatedTotalCents, "900");
  assert.equal(plan.summary.reconciled, 1);
  assert.equal(plan.records[0].original.estimate.total, "9.00");
});
