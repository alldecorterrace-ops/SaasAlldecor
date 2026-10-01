import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  paymentSchedule,
  paymentTermsInput,
  defaultPaymentTerms,
} from "../src/lib/payment-terms";
import { emptyItem } from "../src/lib/estimates";
import { storedCommercialDocument } from "../src/lib/commercial-documents";
import { renderCommercialPdf } from "../src/lib/commercial-pdf";
import { fullDatabase } from "./helpers/full-database";

test("payment calendar matches the independent ADT displayed cent amounts", () => {
  // ADT EST-2026-0169, read-only UI and pagosDe source, refreshed 2026-10-01.
  assert.deepEqual(paymentSchedule("47937.34", ["10", "50", "30", "10"]), [
    "4793.73",
    "23968.67",
    "14381.20",
    "4793.74",
  ]);
  assert.deepEqual(paymentSchedule("120.10", ["10", "50", "30", "10"]), [
    "12.01",
    "60.05",
    "36.03",
    "12.01",
  ]);
  assert.deepEqual(paymentSchedule("0.01", ["10", "50", "30", "10"]), [
    "0.00",
    "0.01",
    "0.00",
    "0.00",
  ]);
  assert.deepEqual(paymentSchedule("100.01", ["12.5", "37.5", "40", "10"]), [
    "12.50",
    "37.50",
    "40.00",
    "10.01",
  ]);
  assert.throws(
    () => paymentSchedule("0.02", ["33.33", "33.33", "33.34", "0"]),
    /redondeo/,
  );
});
test("terms reject invalid percentages and retain original multiline conditions", () => {
  const original = {
    ...defaultPaymentTerms(),
    conditions: "Entrega café · área Ñ\nCondición particular original",
    delivery_date: "2026-10-31",
  };
  assert.deepEqual(paymentTermsInput.parse(original), original);
  for (const percentages of [
    ["10", "50", "30", "9"],
    ["-1", "51", "40", "10"],
    ["101", "0", "0", "0"],
    ["1e2", "0", "0", "0"],
    ["10", "50", "30"],
    ["10.001", "49.999", "30", "10"],
  ])
    assert.equal(
      paymentTermsInput.safeParse({ ...original, percentages }).success,
      false,
    );
});
test("saved terms survive revisions, invoice approval, PDFs and old client saves", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    other = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID(),
    legacy = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const input = {
    customer_id: customer,
    estimate_date: "2026-10-01",
    valid_until: null,
    status: "PENDIENTE",
    notes: "Synthetic",
    items: [{ ...emptyItem, name: "QA", unit_price: "47937.34" }],
    discount: "0",
    taxes: "0",
  };
  const terms = {
    ...defaultPaymentTerms(),
    delivery_date: "2026-11-01",
    conditions: "Condiciones sintéticas · café Ñ\nConservar texto y entrega.",
  };
  const save = async (id: string, version: number, data: object) =>
    db.query("select save_estimate($1,$2,$3,$4)", [
      company,
      id,
      version,
      JSON.stringify(data),
    ]);
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select create_company($1,'Terms QA'),create_company($2,'Other QA')",
      [company, other],
    );
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({ full_name: "Synthetic customer", status: "active" }),
    ]);
    await save(legacy, 0, input);
    await t.test(
      "unknown legacy terms stay null and old snapshots stay untouched",
      async () => {
        const legacyRow = (
          await db.query<{ commercial_terms: null }>(
            "select commercial_terms from estimates where id=$1",
            [legacy],
          )
        ).rows[0];
        assert.equal(legacyRow.commercial_terms, null);
        await save(legacy, 1, input);
        assert.equal(
          (
            await db.query<{ commercial_terms: null }>(
              "select commercial_terms from estimates where id=$1",
              [legacy],
            )
          ).rows[0].commercial_terms,
          null,
        );
        const revisions = (
          await db.query<{ snapshot: Record<string, unknown> }>(
            "select snapshot from estimate_revisions where estimate_id=$1 order by version",
            [legacy],
          )
        ).rows;
        assert(revisions.every((r) => r.snapshot.commercial_terms === null));
      },
    );
    await save(estimate, 0, {
      ...input,
      commercial_terms: { ...terms, amounts: ["1", "2", "3", "4"] },
    });
    const expected = {
      ...terms,
      amounts: ["4793.73", "23968.67", "14381.20", "4793.74"],
    };
    assert.deepEqual(
      (
        await db.query<{ commercial_terms: object }>(
          "select commercial_terms from estimates where id=$1",
          [estimate],
        )
      ).rows[0].commercial_terms,
      expected,
    );
    const original = (
      await db.query<{ snapshot: object }>(
        "select snapshot from estimate_revisions where estimate_id=$1 and version=1",
        [estimate],
      )
    ).rows[0].snapshot;
    const changed = {
      ...input,
      items: [{ ...emptyItem, name: "QA", unit_price: "100.01" }],
    };
    await save(estimate, 1, changed); // Old application has no terms field: preserve and recalculate only this new revision.
    await t.test(
      "new revision recalculates calendar while previous terms remain captured",
      async () => {
        assert.deepEqual(
          (
            await db.query<{ snapshot: object }>(
              "select snapshot from estimate_revisions where estimate_id=$1 and version=1",
              [estimate],
            )
          ).rows[0].snapshot,
          original,
        );
        assert.deepEqual(
          (
            await db.query<{ commercial_terms: object }>(
              "select commercial_terms from estimates where id=$1",
              [estimate],
            )
          ).rows[0].commercial_terms,
          { ...terms, amounts: ["10.00", "50.01", "30.00", "10.00"] },
        );
        const before = (
          await db.query(
            "select version,commercial_terms from estimates where id=$1",
            [estimate],
          )
        ).rows;
        await assert.rejects(
          save(estimate, 2, {
            ...changed,
            commercial_terms: {
              ...terms,
              percentages: ["10", "50", "30", "9"],
            },
          }),
          /invalid_payment_terms/,
        );
        await assert.rejects(
          save(estimate, 2, {
            ...changed,
            commercial_terms: { ...terms, delivery_date: "2026-02-30" },
          }),
          /date/,
        );
        assert.deepEqual(
          (
            await db.query(
              "select version,commercial_terms from estimates where id=$1",
              [estimate],
            )
          ).rows,
          before,
        );
      },
    );
    const invoice = (
      await db.query<{ id: string }>(
        "select approve_estimate($1,$2,2,'2026-10-01','Synthetic project','Synthetic approval') id",
        [company, estimate],
      )
    ).rows[0].id;
    await t.test(
      "approval captures terms exactly and does not register a deposit",
      async () => {
        const rows = (
          await db.query<{ commercial_terms: object; paid_amount: string }>(
            "select commercial_terms,paid_amount from invoices where id=$1",
            [invoice],
          )
        ).rows[0];
        assert.deepEqual(rows.commercial_terms, {
          ...terms,
          amounts: ["10.00", "50.01", "30.00", "10.00"],
        });
        assert.equal(rows.paid_amount, "0.00");
        assert.equal(
          (await db.query("select id from payments")).rows.length,
          0,
        );
        await assert.rejects(
          save(estimate, 3, { ...changed, commercial_terms: null }),
          /approved_estimate_locked/,
        );
        const document = storedCommercialDocument.parse(
          (
            await db.query<{ data: unknown }>(
              "select to_jsonb(prepare_commercial_document($1,'invoice',$2,1)) data",
              [company, invoice],
            )
          ).rows[0].data,
        );
        assert.deepEqual(
          document.snapshot.record.commercial_terms,
          rows.commercial_terms,
        );
        const pdf = await renderCommercialPdf(document, true);
        assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-");
      },
    );
    await t.test(
      "terms cannot cross company boundaries or bypass write permission",
      async () => {
        await db.query("select add_company_member($1,'staff@example.test')", [
          company,
        ]);
        await as(staff);
        await assert.rejects(
          save(legacy, 2, { ...input, commercial_terms: terms }),
          /permission_denied/,
        );
        await as(owner);
        await assert.rejects(
          db.query("select save_estimate($1,$2,2,$3)", [
            other,
            legacy,
            JSON.stringify({ ...input, commercial_terms: terms }),
          ]),
          /record_conflict/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
