import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateLaborCents,
  previewLabor,
  reconcileDailyLabor,
} from "../src/lib/labor-costs";
import { laborBase, laborIds } from "./helpers/labor-cases";
const { p, q, worker } = laborIds;
test("a reviewed short day costs one dated daily wage; breaks/hours are not a multiplier", () => {
  const i = laborBase();
  i.entries[0].minutes = 30;
  const r = previewLabor(i);
  assert.equal(r.knownCostCents, 25000);
  assert.equal(r.costs.length, 1);
  assert.equal(r.costs[0].date, "2026-10-01");
  assert.equal(r.posted, false);
});
test("multiple shifts preserve sources but charge the worker-day-project once", () => {
  const i = laborBase();
  i.entries.push({ ...i.entries[0], external_id: "shift-2", minutes: 10 });
  const r = previewLabor(i);
  assert.equal(r.knownCostCents, 25000);
  assert.deepEqual(r.costs[0].sources, ["qa-shift-1", "shift-2"]);
  const reordered = previewLabor({ ...i, entries: [...i.entries].reverse() });
  assert.deepEqual(reordered.costs, r.costs);
});
test("a rate must be effective on the local workday; current hourly rate cannot substitute", () => {
  const i = laborBase();
  i.rates = {};
  const r = previewLabor(i);
  assert.equal(r.knownCostCents, 0);
  assert.equal(r.complete, false);
  assert.deepEqual(r.pending, [
    {
      workerId: worker,
      date: "2026-10-01",
      reason: "DATED_DAILY_RATE_REQUIRED",
    },
  ]);
  assert.equal(r.attendance.length, 1);
});
test("pending corrections and open shifts produce dated incidents, never complete zero cost", () => {
  const i = laborBase();
  i.entries[0].req_status = "PENDING";
  const r = previewLabor(i);
  assert.equal(r.costs.length, 0);
  assert.equal(r.complete, false);
  assert.equal(r.pending[0].reason, "SHIFT_REVIEW_REQUIRED");
  assert.equal(r.pending[0].date, "2026-10-01");
});
test("a mixed project day requires an explicit rule; confirmed allocation preserves every cent", () => {
  const i = laborBase();
  i.projects[q] = { mode: "day" };
  i.entries.push({
    ...i.entries[0],
    external_id: "shift-2",
    project_external_id: q,
    minutes: 150,
  });
  assert.equal(previewLabor(i).pending[0].reason, "SHARED_DAY_RULE_REQUIRED");
  const r = previewLabor({ ...i, splitRule: "minutes" });
  assert.equal(r.knownCostCents, 25000);
  assert.deepEqual(
    r.costs.map((c) => c.amountCents).sort((a, b) => a - b),
    [6250, 18750],
  );
});
test("large wages allocate exactly with rational cent remainders and stable ties", () => {
  assert.deepEqual(allocateLaborCents(25001, { b: 1, a: 1 }), {
    a: 12501,
    b: 12500,
  });
  const total = 9007199254740000,
    r = allocateLaborCents(total, { a: 10080, b: 10079, c: 10078 });
  assert.equal(
    Object.values(r).reduce((a, b) => a + b, 0),
    total,
  );
  assert.ok(Object.values(r).every(Number.isSafeInteger));
});
test("saved adjustment includes crew and does not recalculate from daily wages or sale price", () => {
  const i = laborBase();
  i.projects[p] = { mode: "adjustment" };
  i.adjustments[p] = {
    id: "agreement",
    workerId: worker,
    amountCents: 609000,
    estimateId: "saved",
    revision: "v4",
  };
  i.entries.push({
    ...i.entries[0],
    external_id: "crew",
    worker_id: "qa-crew",
  });
  const r = previewLabor(i);
  assert.equal(r.knownCostCents, 609000);
  assert.equal(r.costs.length, 1);
  assert.equal(r.costs[0].revision, "v4");
  assert.ok(r.attendance.every((a) => a.includedInAdjustment));
});
test("unconfirmed adjustment, overlapping rates and conflicting duplicates remain explicit", () => {
  const i = laborBase();
  i.projects[p] = { mode: "adjustment" };
  assert.equal(
    previewLabor(i).pending[0].reason,
    "ADJUSTMENT_SNAPSHOT_REQUIRED",
  );
  const j = laborBase();
  j.rates[worker].push({ ...j.rates[worker][0] });
  assert.equal(previewLabor(j).pending[0].reason, "DATED_DAILY_RATE_REQUIRED");
  j.entries.push({ ...j.entries[0], minutes: 50 });
  assert.throws(() => previewLabor(j), /Conflicting duplicate/);
});
test("company timezone and DST determine the recorded day independently of the browser", () => {
  const i = laborBase();
  i.entries[0].clock_in = Date.parse("2026-10-02T02:00:00Z") / 1000;
  i.entries[0].clock_out = i.entries[0].clock_in + 3600;
  assert.equal(previewLabor(i).costs[0].date, "2026-10-01");
  assert.equal(
    previewLabor({ ...i, timezone: "UTC" }).costs[0].date,
    "2026-10-02",
  );
  i.entries[0].clock_in = Date.parse("2026-11-01T05:30:00Z") / 1000;
  i.entries[0].clock_out = Date.parse("2026-11-01T07:30:00Z") / 1000;
  assert.equal(previewLabor(i).costs[0].date, "2026-11-01");
});
const historical = (amountCents: number) => ({
  id: "old-payroll-cost",
  workerId: worker,
  projectId: p,
  date: "2026-10-01",
  amountCents,
});
test("existing payroll cost is preserved and deducted from the supplement, without confirming payment", () => {
  const r = reconcileDailyLabor(previewLabor(laborBase()), [historical(15000)]);
  assert.equal(r.historicalCostCents, 15000);
  assert.equal(r.supplementCostCents, 10000);
  assert.equal(r.knownCostCents, 25000);
  assert.equal(r.complete, true);
  assert.equal(r.posted, false);
});
test("fully covered and repeated payroll costs never create another cost", () => {
  const r = reconcileDailyLabor(previewLabor(laborBase()), [
    historical(25000),
    historical(25000),
  ]);
  assert.equal(r.supplements.length, 0);
  assert.equal(r.knownCostCents, 25000);
  assert.throws(
    () =>
      reconcileDailyLabor(previewLabor(laborBase()), [
        historical(25000),
        historical(24000),
      ]),
    /Conflicting historical/,
  );
});
test("historical cost over a daily rate remains intact and creates a dated reconciliation issue", () => {
  const r = reconcileDailyLabor(previewLabor(laborBase()), [historical(26000)]);
  assert.equal(r.knownCostCents, 26000);
  assert.equal(r.supplements.length, 0);
  assert.equal(r.complete, false);
  assert.equal(r.pending[0].reason, "HISTORICAL_COST_EXCEEDS_DAILY_RATE");
  assert.equal(r.pending[0].date, "2026-10-01");
});
test("unmatched historical labor stays visible; it does not silently consume a different workday", () => {
  const h = { ...historical(10000), date: "2026-09-30" };
  const r = reconcileDailyLabor(previewLabor(laborBase()), [h]);
  assert.equal(r.knownCostCents, 35000);
  assert.equal(r.complete, false);
  assert.equal(r.pending[0].reason, "HISTORICAL_LABOR_WITHOUT_VALUED_DAY");
  assert.equal(r.pending[0].date, "2026-09-30");
});
test("existing labor blocks a second whole-crew adjustment pending reconciliation", () => {
  const i = laborBase();
  i.projects[p] = { mode: "adjustment" };
  i.adjustments[p] = {
    id: "agreement",
    workerId: worker,
    amountCents: 609000,
    estimateId: "saved",
    revision: "v4",
  };
  const r = reconcileDailyLabor(previewLabor(i), [historical(50000)]);
  assert.equal(r.knownCostCents, 50000);
  assert.equal(r.supplements.length, 0);
  assert.equal(r.complete, false);
  assert.equal(r.pending[0].reason, "EXISTING_LABOR_RECONCILIATION_REQUIRED");
});
