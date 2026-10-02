import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  emptyItem,
  estimateTaxes,
  estimateTotals,
  estimateSchema,
  moveEstimateItem,
  duplicateEstimateItem,
} from "../src/lib/estimates";
import { defaultPaymentTerms } from "../src/lib/payment-terms";
import { fullDatabase } from "./helpers/full-database";

test("optional tax matches independent ADT editor amounts after discount", () => {
  // edTax = r2((edSubtotal-edDesc)*7/100), current ADT panel SHA ff005823... (2026-10-01).
  for (const [subtotal, discount, tax, total] of [
    ["319.36", "33.33", "20.02", "306.05"],
    ["0.50", "0", "0.04", "0.54"],
    ["1.50", "0", "0.11", "1.61"],
    ["100.01", "10.01", "6.30", "96.30"],
  ]) {
    const input = {
      items: [{ ...emptyItem, name: "QA", unit_price: subtotal }],
      discount,
      taxes: "999",
      tax_pct: "7" as const,
    };
    assert.equal(estimateTaxes(input), tax);
    assert.equal(estimateTotals(input).total, total);
    assert.equal(estimateTaxes({ ...input, tax_pct: "0" }), "0.00");
  }
  const legacy = {
    items: [{ ...emptyItem, name: "QA", unit_price: "319.36" }],
    discount: "33.33",
    taxes: "14.56",
  };
  assert.equal(estimateTotals(legacy).total, "300.59");
  assert.equal(estimateTotals({ ...legacy, tax_pct: null }).total, "300.59");
  assert.throws(() => estimateTaxes({ ...legacy, tax_pct: "8" as "7" }));
  assert.throws(() =>
    estimateTaxes({ ...legacy, discount: "320", tax_pct: "7" }),
  );
});
test("line duplication and ordering preserve captured prices, measures and independent edits", () => {
  const first = {
      ...emptyItem,
      name: "First",
      product_id: randomUUID(),
      unit_price: "13.37",
      qty: "3.125",
      base: "linear_ft" as const,
      length: "5.25",
      description: "Original ñ",
    },
    second = {
      ...emptyItem,
      name: "Manual",
      base: "manual" as const,
      manual_total: "100.01",
      qty: "9",
    };
  const original = [first, second],
    copy = duplicateEstimateItem(original, 0);
  assert.deepEqual(copy, [first, first, second]);
  assert.notEqual(copy[0], copy[1]);
  copy[1].name = "Changed copy";
  assert.equal(original[0].name, "First");
  const moved = moveEstimateItem(copy, 2, -1);
  assert.deepEqual(
    moved.map((x) => x.name),
    ["First", "Manual", "Changed copy"],
  );
  assert.deepEqual(original, [first, second]);
  assert.equal(moveEstimateItem(original, 0, -1), original);
  assert.equal(moveEstimateItem(original, 1, 1), original);
  assert.equal(duplicateEstimateItem(original, -1), original);
  const limit = Array.from({ length: 100 }, () => ({ ...first }));
  assert.equal(duplicateEstimateItem(limit, 0), limit);
});
test("saved tax modes are authoritative, revisioned, isolated and copied on approval", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    other = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const input = {
    customer_id: customer,
    estimate_date: "2026-10-02",
    valid_until: null,
    status: "PENDIENTE",
    notes: "Synthetic",
    discount: "33.33",
    taxes: "14.56",
    items: [{ ...emptyItem, name: "QA", unit_price: "319.36" }],
    commercial_terms: defaultPaymentTerms(),
  };
  const save = (
    version: number,
    data: object = input,
    id = estimate,
    c = company,
  ) =>
    db.query("select save_estimate($1,$2,$3,$4)", [
      c,
      id,
      version,
      JSON.stringify(data),
    ]);
  const amounts = async () =>
    (
      await db.query<{
        subtotal: string;
        discount: string;
        taxes: string;
        total: string;
        tax_pct: number | null;
        version: number;
        commercial_terms: { amounts: string[] } | null;
      }>(
        "select subtotal,discount,taxes,total,tax_pct,version,commercial_terms from estimates where id=$1",
        [estimate],
      )
    ).rows[0];
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select create_company($1,'Tax QA'),create_company($2,'Other QA')",
      [company, other],
    );
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({ full_name: "Synthetic", status: "active" }),
    ]);
    await save(0);
    const initial = (
      await db.query<{ snapshot: Record<string, unknown> }>(
        "select snapshot from estimate_revisions where estimate_id=$1 and version=1",
        [estimate],
      )
    ).rows[0].snapshot;
    await t.test(
      "legacy rate stays unknown and cannot be inferred from the amount",
      async () => {
        assert.equal((await amounts()).tax_pct, null);
        assert.equal((await amounts()).total, "300.59");
        assert.equal(initial.tax_pct, null);
      },
    );
    await t.test(
      "server ignores a forged amount and recalculates the captured 7% rate",
      async () => {
        await save(1, { ...input, taxes: "0.01", tax_pct: "7" });
        const row = await amounts();
        assert.equal(row.taxes, "20.02");
        assert.equal(row.total, "306.05");
        assert.equal(row.tax_pct, 7);
        assert(row.commercial_terms);
        assert.deepEqual(row.commercial_terms.amounts, [
          "30.61",
          "153.03",
          "91.82",
          "30.59",
        ]);
        assert.deepEqual(
          (
            await db.query<{ snapshot: Record<string, unknown> }>(
              "select snapshot from estimate_revisions where estimate_id=$1 and version=1",
              [estimate],
            )
          ).rows[0].snapshot,
          initial,
        );
      },
    );
    await t.test(
      "old clients preserve the captured rate and invalid modes leave no revision",
      async () => {
        await save(2, { ...input, discount: "0", taxes: "0" });
        assert.equal((await amounts()).tax_pct, 7);
        assert.equal((await amounts()).taxes, "22.36");
        const before = await amounts();
        for (const tax_pct of ["8", "7.0", 7.5, true, {}, ""])
          await assert.rejects(
            save(3, { ...input, tax_pct }),
            /invalid_tax_percent/,
          );
        assert.deepEqual(await amounts(), before);
        assert.equal(
          estimateSchema.safeParse({ ...input, tax_pct: "8" }).success,
          false,
        );
      },
    );
    await t.test(
      "explicit zero and legacy amount remain distinct revision choices",
      async () => {
        await save(3, { ...input, tax_pct: "0" });
        assert.equal((await amounts()).taxes, "0.00");
        await save(4, { ...input, tax_pct: null });
        assert.equal((await amounts()).taxes, "14.56");
        assert.equal((await amounts()).tax_pct, null);
        await save(5, { ...input, tax_pct: "7" });
      },
    );
    await t.test(
      "permission revocation and a second company cannot edit this document",
      async () => {
        await db.query("select add_company_member($1,'staff@example.test')", [
          company,
        ]);
        await as(staff);
        await assert.rejects(
          save(6, { ...input, tax_pct: "0" }),
          /permission_denied/,
        );
        await as(owner);
        await assert.rejects(
          save(6, { ...input, tax_pct: "0" }, estimate, other),
          /record_conflict/,
        );
        assert.equal((await amounts()).version, 6);
      },
    );
    await t.test(
      "approval captures the chosen tax without making a payment",
      async () => {
        const invoice = (
          await db.query<{ id: string }>(
            "select approve_estimate($1,$2,6,'2026-10-02','QA project','Synthetic approval') id",
            [company, estimate],
          )
        ).rows[0].id;
        const row = (
          await db.query<{
            tax_pct: number | null;
            taxes: string;
            total: string;
            paid_amount: string;
            estimate_version: number;
          }>(
            "select tax_pct,taxes,total,paid_amount,estimate_version from invoices where id=$1",
            [invoice],
          )
        ).rows[0];
        assert.deepEqual(row, {
          tax_pct: 7,
          taxes: "20.02",
          total: "306.05",
          paid_amount: "0.00",
          estimate_version: 6,
        });
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from payments",
            )
          ).rows[0].n,
          0,
        );
        await assert.rejects(
          save(7, { ...input, tax_pct: "0" }),
          /approved_estimate_locked/,
        );
        const snapshot = (
          await db.query<{ data: { record: { tax_pct: number | null } } }>(
            "select (prepare_commercial_document($1,'invoice',$2,1)).snapshot data",
            [company, invoice],
          )
        ).rows[0].data;
        assert.equal(snapshot.record.tax_pct, 7);
      },
    );
  } finally {
    await db.close();
  }
});
