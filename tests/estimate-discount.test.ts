import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  captureEstimateInput,
  estimateTotals,
  estimateSchema,
  emptyItem,
  type EstimateInput,
} from "../src/lib/estimates";
import { fullDatabase } from "./helpers/full-database";

function input(customer: string): EstimateInput {
  return {
    customer_id: customer,
    estimate_date: "2026-10-02",
    valid_until: null,
    status: "BORRADOR",
    notes: "Synthetic discount QA",
    discount: "0",
    taxes: "0",
    tax_pct: "7",
    commercial_terms: null,
    items: [{ ...emptyItem, name: "QA captured price", unit_price: "100.01" }],
  };
}
test("ADT discount cap is applied before optional tax without changing source input", () => {
  const source = input(randomUUID()),
    original = structuredClone(source);
  for (const [requested, applied, tax, total] of [
    ["0", "0.00", "7.00", "107.01"],
    ["2.50", "2.50", "6.83", "104.34"],
    ["100.00", "100.00", "0.00", "0.01"],
    ["100.01", "100.01", "0.00", "0.00"],
    ["100.02", "100.01", "0.00", "0.00"],
    ["999999999.99", "100.01", "0.00", "0.00"],
  ]) {
    const captured = captureEstimateInput({ ...source, discount: requested });
    assert.equal(captured.discount, applied);
    assert.equal(captured.taxes, tax);
    assert.equal(estimateTotals(captured).total, total);
    assert.deepEqual(captured.items, source.items);
  }
  assert.deepEqual(source, original);
  const manual = captureEstimateInput({
    ...source,
    tax_pct: null,
    taxes: "14.56",
    discount: "100.02",
  });
  assert.equal(manual.tax_pct, null);
  assert.equal(
    manual.taxes,
    "14.56",
    "An unknown historical rate remains an amount",
  );
  assert.equal(
    estimateSchema.safeParse({ ...source, discount: "-1" }).success,
    false,
  );
  assert.throws(() => captureEstimateInput({ ...source, discount: "100.001" }));
});

test("captured capped discount persists with revisions and current authorization", async (t) => {
  const { db } = await fullDatabase(),
    owner = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID(),
    customer = randomUUID(),
    est = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const save = (v: number, data: EstimateInput, c = company) =>
    db.query("select save_estimate($1,$2,$3,$4)", [
      c,
      est,
      v,
      JSON.stringify(data),
    ]);
  const row = async () =>
    (
      await db.query<{
        discount: string;
        taxes: string;
        total: string;
        version: number;
        tax_pct: number;
        items: unknown;
      }>(
        "select discount,taxes,total,version,tax_pct,items from estimates where id=$1",
        [est],
      )
    ).rows[0];
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select create_company($1,'Discount QA'),create_company($2,'Other QA')",
      [company, foreign],
    );
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({ full_name: "Synthetic", status: "active" }),
    ]);
    const source = input(customer);
    await save(0, captureEstimateInput(source));
    const original = (
      await db.query<{ snapshot: unknown }>(
        "select snapshot from estimate_revisions where estimate_id=$1 and version=1",
        [est],
      )
    ).rows[0].snapshot;
    await t.test(
      "new revision captures the capped amount and leaves original snapshot intact",
      async () => {
        const capped = captureEstimateInput({ ...source, discount: "100.02" });
        await save(1, capped);
        assert.deepEqual(await row(), {
          discount: "100.01",
          taxes: "0.00",
          total: "0.00",
          version: 2,
          tax_pct: 7,
          items: (original as { items: unknown }).items,
        });
        assert.deepEqual(
          (
            await db.query<{ snapshot: unknown }>(
              "select snapshot from estimate_revisions where estimate_id=$1 and version=1",
              [est],
            )
          ).rows[0].snapshot,
          original,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select (select count(*) from invoices)+(select count(*) from payments)+(select count(*) from projects) n",
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "direct invalid payload and stale retry cannot change the saved amount",
      async () => {
        const before = await row();
        await assert.rejects(
          () => save(2, { ...source, discount: "100.02" }),
          /invalid_total/,
        );
        await assert.rejects(() =>
          save(1, captureEstimateInput({ ...source, discount: "100.02" })),
        );
        assert.deepEqual(await row(), before);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from estimate_revisions where estimate_id=$1",
              [est],
            )
          ).rows[0].n,
          2,
        );
      },
    );
    await t.test(
      "read-only and another company cannot save a normalized quote",
      async () => {
        await db.query("select add_company_member($1,'staff@example.test')", [
          company,
        ]);
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          company,
          staff,
          JSON.stringify({ "fin-estimados": ["read"] }),
        ]);
        await as(staff);
        await assert.rejects(() =>
          save(2, captureEstimateInput({ ...source, discount: "2.50" })),
        );
        await assert.rejects(() =>
          save(0, captureEstimateInput(source), foreign),
        );
        await as(owner);
        assert.equal((await row()).version, 2);
        await save(2, captureEstimateInput({ ...source, discount: "2.50" }));
        assert.equal((await row()).total, "104.34");
        assert.equal((await row()).discount, "2.50");
      },
    );
  } finally {
    await db.close();
  }
});
