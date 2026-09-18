import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoricalEstimateDetail } from "../src/components/historical-estimate-detail";
import { fullDatabase } from "./helpers/full-database";
import { historicalEstimatePayload } from "../src/lib/migration/historical-estimate-payload";
import {
  historicalEstimateSchema,
  historicalMoney,
} from "../src/lib/historical-estimates";

function snapshot() {
  return {
    format: "adt-history-snapshot-v1",
    origin: "restored_snapshot",
    clients: [
      {
        external_id: "c1",
        full_name: "Synthetic customer",
        token: "PRIVATE_CUSTOMER_TOKEN",
      },
    ],
    estimates: [
      {
        external_id: "e1",
        client_external_id: "c1",
        consecutive: "OLD-1",
        estimate_date: "legacy date",
        status: "LEGACY_SIGNED",
        total: "10.00",
        discount: "0.00",
        taxes: "0.00",
        source_json: JSON.stringify({
          token: "PRIVATE_TOKEN",
          items: [
            {
              label: "Saved line",
              price: 9.99,
              data: { secret: "PRIVATE_MOTOR_DATA" },
            },
          ],
        }),
      },
    ],
    items: [],
    projects: [],
    invoices: [],
    payments: [],
    documents: [],
    contracts: [],
  };
}
test("historical screen escapes source text and contains no mutation controls", () => {
  const record = historicalEstimatePayload(snapshot(), randomUUID()).records[0]
    .presentation;
  record.lines[0].description = "<img src=x onerror=alert(1)>";
  const html = renderToStaticMarkup(
    createElement(HistoricalEstimateDetail, { record }),
  );
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes("<button"));
  assert.ok(html.includes("Total original (USD)"));
  assert.ok(html.includes("$10.00"));
  record.lines = [];
  record.detail_state = "unavailable_in_reviewed_sources";
  const missing = renderToStaticMarkup(
    createElement(HistoricalEstimateDetail, { record }),
  );
  assert.ok(missing.includes("sin crear partidas de ajuste"));
});
test("historical projection is an allowlist, preserves cents and never exposes nested credentials", () => {
  const input = snapshot(),
    result = historicalEstimatePayload(input, randomUUID()),
    p = result.records[0].presentation;
  assert.equal(p.total_cents, "1000");
  assert.equal(p.lines[0].amount_cents, "999");
  assert.equal(p.difference_cents, "-1");
  assert.ok(p.review_reasons.includes("historical_total_mismatch"));
  assert.ok(!JSON.stringify(p).includes("PRIVATE_"));
  assert.deepEqual(result.records[0].original.estimate, input.estimates[0]);
  assert.equal(historicalMoney("9999999999999999"), "$99,999,999,999,999.99");
  assert.equal(historicalMoney("-1"), "−$0.01");
  assert.equal(historicalMoney(null), "No disponible");
  assert.equal(
    historicalEstimateSchema.safeParse({ ...p, token: "not-allowed" }).success,
    false,
  );
  input.estimates[0].client_external_id = "missing";
  assert.throws(
    () => historicalEstimatePayload(input, randomUUID()),
    /relationship_requires_review/,
  );
});

test("historical read model enforces module, tenant and immutable application access", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    outsider = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const payload = historicalEstimatePayload(snapshot(), company);
  const load = () =>
    db.query<{ result: { inserted: number; unchanged: number } }>(
      "select app_private.import_historical_estimates($1,$2,$3) result",
      [company, payload.snapshotSha256, JSON.stringify(payload.records)],
    );
  try {
    for (const [id, email] of [
      [owner, "history-owner@example.test"],
      [staff, "history-staff@example.test"],
      [outsider, "history-other@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'Synthetic archive A')", [
      company,
    ]);
    await db.query(
      "select public.add_company_member($1,'history-staff@example.test')",
      [company],
    );
    await as(outsider);
    await db.query("select public.create_company($1,'Synthetic archive B')", [
      foreign,
    ]);
    await db.exec("reset role");
    await t.test(
      "administrative load is repeatable and creates no current financial records",
      async () => {
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 1,
          unchanged: 0,
        });
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 0,
          unchanged: 1,
        });
        for (const table of ["estimates", "invoices", "payments", "projects"])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        assert.equal(
          (await db.query("select * from app_private.document_counters")).rows
            .length,
          0,
        );
      },
    );
    await t.test(
      "unknown public fields are rejected even through the administrative loader",
      async () => {
        const changed = structuredClone(payload.records);
        Object.assign(changed[0].presentation, { token: "secret" });
        await assert.rejects(
          db.query("select app_private.import_historical_estimates($1,$2,$3)", [
            company,
            payload.snapshotSha256,
            JSON.stringify(changed),
          ]),
          /invalid_historical_record/,
        );
      },
    );
    await t.test("late conflict rolls back an earlier new record", async () => {
      const added = structuredClone(payload.records[0]);
      added.id = randomUUID();
      added.source_id = "e2";
      added.original.estimate.external_id = "e2";
      const changed = structuredClone(payload.records[0]);
      changed.presentation.total_cents = "2000";
      await assert.rejects(
        db.query("select app_private.import_historical_estimates($1,$2,$3)", [
          company,
          payload.snapshotSha256,
          JSON.stringify([added, changed]),
        ]),
        /historical_source_conflict/,
      );
      assert.equal(
        (await db.query("select * from public.historical_estimates")).rows
          .length,
        1,
      );
    });
    await t.test(
      "owners can read only their company, without raw source access or writes",
      async () => {
        await as(owner);
        assert.equal(
          (await db.query("select * from public.historical_estimates")).rows
            .length,
          1,
        );
        await assert.rejects(
          db.query("select * from app_private.historical_estimate_sources"),
          /permission denied/,
        );
        await assert.rejects(load(), /permission denied/);
        await assert.rejects(
          db.query("update public.historical_estimates set presentation='{}'"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("delete from public.historical_estimates"),
          /permission denied/,
        );
        await as(outsider);
        assert.equal(
          (await db.query("select * from public.historical_estimates")).rows
            .length,
          0,
        );
      },
    );
    await t.test(
      "module grants and revocation apply to direct database reads",
      async () => {
        await as(staff);
        assert.equal(
          (await db.query("select * from public.historical_estimates")).rows
            .length,
          0,
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [company, staff, JSON.stringify({ "fin-estimados": ["read"] })],
        );
        await as(staff);
        assert.equal(
          (await db.query("select * from public.historical_estimates")).rows
            .length,
          1,
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [company, staff],
        );
        await as(staff);
        assert.equal(
          (await db.query("select * from public.historical_estimates")).rows
            .length,
          0,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(
          db.query("select * from public.historical_estimates"),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
