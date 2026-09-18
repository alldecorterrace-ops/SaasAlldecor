import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { stageEstimates } from "../src/lib/migration/stage-estimates";

const company = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const estimate = (external_id: string, notes = "Original") => ({
  external_id,
  total: "12.50",
  discount: "0.00",
  taxes: "0.00",
  status: "ANULADA",
  notes,
  source_json: '{"legacy":true}',
});
const snapshot = (estimates: unknown[]) => ({
  format: "adt-estimates-snapshot-v1",
  origin: "restored_snapshot",
  estimates,
  items: [],
});

test("isolated staging preserves originals, refuses conflicts and replays safely", async (t) => {
  const db = new PGlite();
  try {
    const input = snapshot([estimate("b-existing")]);
    await t.test(
      "first import preserves unavailable details and historical status",
      async () => {
        const result = await stageEstimates(db, input, company);
        assert.equal(result.inserted, 1);
        assert.equal(result.productionWrites, false);
        const rows = await db.query<{
          original: { estimate: unknown };
          planned_record: { reviewReasons: string[] };
        }>("select original,planned_record from migration_rehearsal.estimates");
        assert.deepEqual(rows.rows[0].original.estimate, input.estimates[0]);
        assert.ok(
          rows.rows[0].planned_record.reviewReasons.includes(
            "missing_effective_items",
          ),
        );
        const tables = await db.query<{ count: number }>(
          "select count(*)::int as count from information_schema.tables where table_schema='public'",
        );
        assert.equal(tables.rows[0].count, 0);
      },
    );
    await t.test("same snapshot replays without duplicate rows", async () => {
      const result = await stageEstimates(db, input, company);
      assert.equal(result.inserted, 0);
      assert.equal(result.unchanged, 1);
      const count = await db.query<{ count: number }>(
        "select count(*)::int as count from migration_rehearsal.estimates",
      );
      assert.equal(count.rows[0].count, 1);
    });
    await t.test(
      "different destination is rejected without changing scope",
      async () => {
        await assert.rejects(
          stageEstimates(db, input, second),
          /destination_company_mismatch/,
        );
        const scope = await db.query<{ company_id: string }>(
          "select company_id from migration_rehearsal.scope",
        );
        assert.equal(scope.rows[0].company_id, company);
      },
    );
    await t.test(
      "late source conflict rolls back earlier inserts and its run record",
      async () => {
        await assert.rejects(
          stageEstimates(
            db,
            snapshot([
              estimate("a-new"),
              estimate("b-existing", "Changed source"),
            ]),
            company,
          ),
          /source_changed_conflict/,
        );
        const rows = await db.query<{
          source_id: string;
          original: { estimate: { notes: string } };
        }>("select source_id,original from migration_rehearsal.estimates");
        assert.equal(rows.rows.length, 1);
        assert.equal(rows.rows[0].source_id, "b-existing");
        assert.equal(rows.rows[0].original.estimate.notes, "Original");
        const runs = await db.query<{ count: number }>(
          "select count(*)::int as count from migration_rehearsal.runs",
        );
        assert.equal(runs.rows[0].count, 2);
      },
    );
    await t.test(
      "a later non-conflicting addition preserves all existing rows",
      async () => {
        const result = await stageEstimates(
          db,
          snapshot([estimate("a-new"), estimate("b-existing")]),
          company,
        );
        assert.equal(result.inserted, 1);
        assert.equal(result.unchanged, 1);
      },
    );
  } finally {
    await db.close();
  }
});
