import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { invoiceDetailReviewSchema } from "../src/lib/financial-reconciliation";

test("invoice detail review preserves cents, refuses incomplete evidence and limits access", async () => {
  const { db } = await fullDatabase();
  const company = randomUUID(),
    owner = randomUUID(),
    staff = randomUUID(),
    outsider = randomUUID(),
    client = randomUUID(),
    invoice = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  try {
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [staff, "staff@example.test"],
      [outsider, "outsider@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'Synthetic company')", [
      company,
    ]);
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    await db.exec("reset role");
    const presentation = {
      title: "Synthetic",
      original_date: "2020-01-01",
      original_status: "OPEN",
      customer_name: "Synthetic",
      amount_cents: "10000",
      details: {},
      review_reasons: [],
    };
    await db.query(
      "insert into public.historical_business(company_id,kind,id,source_id,presentation) values($1,'clients',$2,'client',$3)",
      [company, client, JSON.stringify(presentation)],
    );
    await db.query(
      "insert into public.historical_business(company_id,kind,id,source_id,client_id,presentation) values($1,'invoices',$2,'invoice',$3,$4)",
      [company, invoice, client, JSON.stringify(presentation)],
    );
    await db.query(
      "insert into app_private.historical_business_sources values($1,'invoices',$2,$3,$3,'{}')",
      [company, invoice, "a".repeat(64)],
    );
    const detail = {
      items: [
        {
          label: "Original",
          spec: "",
          price: "99.99",
          data: { secret: "never-expose" },
        },
      ],
      subtotal: "100.00",
      discount: "0.00",
      taxes: "0.00",
      total: "100.00",
    };
    const put = async (j: unknown, raw = false, total = "100.00") => {
      await db.exec("reset role");
      await db.query(
        "update app_private.historical_business_sources set original=$1 where company_id=$2 and id=$3",
        [
          JSON.stringify({ total, source_json: raw ? j : JSON.stringify(j) }),
          company,
          invoice,
        ],
      );
      await as(owner);
    };
    const review = async () =>
      invoiceDetailReviewSchema.parse(
        (
          await db.query("select * from public.review_invoice_details($1)", [
            company,
          ])
        ).rows[0],
      );
    await put(detail);
    let row = await review();
    assert.equal(row.line_difference_cents, "-1");
    assert.equal(row.detail_state, "saved_lines");
    assert.equal(row.summary_difference_cents, "0");
    assert.equal(row.saved_total_matches, true);
    assert.ok(!JSON.stringify(row).includes("never-expose"));
    for (const [price, difference] of [
      ["100.01", "1"],
      ["100.00", "0"],
    ]) {
      await put({ ...detail, items: [{ ...detail.items[0], price }] });
      assert.equal((await review()).line_difference_cents, difference);
    }
    for (const j of [
      "{",
      null,
      [],
      { ...detail, items: null },
      { ...detail, items: [{ ...detail.items[0], price: "1.001" }] },
      { ...detail, subtotal: null },
      { ...detail, taxes: "-1" },
      { ...detail, items: [{ ...detail.items[0], label: 123 }] },
    ]) {
      await put(j, j === "{");
      assert.equal((await review()).detail_state, "invalid");
    }
    for (const j of [{}, { items: [] }]) {
      await put(j);
      assert.equal((await review()).detail_state, "missing");
    }
    await put({ ...detail, discount: "1.00", total: "98.00" });
    row = await review();
    assert.equal(row.summary_difference_cents, "-100");
    assert.equal(row.saved_total_matches, false);
    await put({
      ...detail,
      items: Array.from({ length: 100 }, () => ({
        ...detail.items[0],
        price: "999999999999.99",
      })),
      subtotal: "999999999999.99",
    });
    assert.equal((await review()).line_sum_cents, "9999999999999900");
    for (const id of [staff, outsider]) {
      await as(id);
      await assert.rejects(review, /invoice_review_not_allowed/);
    }
    await as(owner);
    await assert.rejects(
      db.query("select * from public.review_invoice_details($1)", [
        randomUUID(),
      ]),
      /invoice_review_not_allowed/,
    );
    await assert.rejects(
      db.query("select original from app_private.historical_business_sources"),
      /permission denied/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(review, /permission denied/);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from public.invoices")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.payments")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
