import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoricalBusinessDetail } from "../src/components/historical-business-detail";
import { historicalBusinessPayload } from "../src/lib/migration/historical-business-payload";
import { historicalEstimatePayload } from "../src/lib/migration/historical-estimate-payload";
import { fullDatabase } from "./helpers/full-database";
const fixture = () => ({
  format: "adt-history-snapshot-v1",
  origin: "restored_snapshot",
  clients: [
    {
      external_id: "c",
      full_name: "Synthetic",
      status: "SKIP:invalid_email",
      client_date: "old",
      email: "original email",
      source_json: '{"token":"PRIVATE"}',
    },
  ],
  estimates: [
    {
      external_id: "e",
      client_external_id: "c",
      status: "LEGACY",
      total: "10.00",
      discount: "0.00",
      taxes: "0.00",
      source_json: '{"items":[]}',
    },
  ],
  items: [],
  projects: [
    {
      external_id: "p",
      client_external_id: "c",
      estimate_external_id: "e",
      name: "Original project",
      status: "Nuevo",
      total: "10.00",
      geo_lat: "PRIVATE_COORDINATE",
    },
  ],
  invoices: [
    {
      external_id: "i",
      client_external_id: "c",
      project_external_id: "p",
      consecutive: "OLD-1",
      status: "OPEN",
      total: "10.00",
      paid_amount: "2.00",
      balance_due: "8.00",
      payment_status: "PARTIAL",
    },
  ],
  payments: [
    {
      external_id: "pay1",
      client_external_id: "c",
      project_external_id: "p",
      invoice_external_id: "i",
      status: "APPLIED",
      amount: "3.00",
      method: "CASH",
    },
    {
      external_id: "pay2",
      client_external_id: "c",
      project_external_id: "p",
      invoice_external_id: "i",
      status: "VOID",
      amount: "4.00",
      method: "CASH",
    },
  ],
  documents: [],
  contracts: [],
});

test("business projection preserves mismatches and excludes void payments and private fields", () => {
  const source = fixture(),
    payload = historicalBusinessPayload(source, randomUUID()),
    invoice = payload.records.find((r) => r.kind === "invoices")!;
  assert.equal(invoice.presentation.details.applied_cents, "300");
  assert.equal(invoice.presentation.details.paid_cents, "200");
  assert.equal(invoice.presentation.details.balance_cents, "800");
  assert.equal(invoice.presentation.details.paid_difference_cents, "100");
  assert.equal(invoice.presentation.details.balance_difference_cents, "-100");
  assert.ok(invoice.presentation.review_reasons.includes("paid_mismatch"));
  assert.ok(invoice.presentation.review_reasons.includes("balance_mismatch"));
  assert.deepEqual(invoice.original, source.invoices[0]);
  assert.ok(
    !JSON.stringify(payload.records.map((r) => r.presentation)).includes(
      "PRIVATE",
    ),
  );
  assert.ok(
    payload.records
      .find((r) => r.kind === "clients")!
      .presentation.review_reasons.includes("source_client_warning"),
  );
  source.payments[0].status = "UNKNOWN";
  const unknown = historicalBusinessPayload(source, randomUUID()).records.find(
    (r) => r.kind === "invoices",
  )!;
  assert.equal(unknown.presentation.details.applied_cents, null);
  assert.ok(
    unknown.presentation.review_reasons.includes("unknown_payment_status"),
  );
  source.invoices[0].client_external_id = "absent";
  assert.throws(
    () => historicalBusinessPayload(source, randomUUID()),
    /relationship_requires_review/,
  );
});
test("business history renders source text without executing HTML or offering mutations", () => {
  const record = historicalBusinessPayload(
    fixture(),
    randomUUID(),
  ).records.find((r) => r.kind === "invoices")!.presentation;
  record.title = "<img src=x onerror=alert(1)>";
  const html = renderToStaticMarkup(
    createElement(HistoricalBusinessDetail, { record }),
  );
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes("<button"));
  assert.ok(html.includes("Pagado guardado"));
  assert.ok(html.includes("$2.00"));
  assert.ok(html.includes("sin ajustes automáticos"));
});
test("business archive keeps typed tenant relations, module boundaries and atomic imports", async (t) => {
  const { db } = await fullDatabase(),
    company = randomUUID(),
    foreign = randomUUID(),
    owner = randomUUID(),
    staff = randomUUID(),
    other = randomUUID();
  const source = fixture(),
    estimates = historicalEstimatePayload(source, company),
    payload = historicalBusinessPayload(source, company);
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const load = (records = payload.records) =>
    db.query<{ result: { inserted: number; unchanged: number } }>(
      "select app_private.import_historical_business($1,$2,$3) result",
      [company, payload.snapshotSha256, JSON.stringify(records)],
    );
  try {
    for (const [id, email] of [
      [owner, "archive-owner@example.test"],
      [staff, "archive-staff@example.test"],
      [other, "archive-other@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'Archive A')", [company]);
    await db.query(
      "select public.add_company_member($1,'archive-staff@example.test')",
      [company],
    );
    await as(other);
    await db.query("select public.create_company($1,'Archive B')", [foreign]);
    await db.exec("reset role");
    await db.query("select app_private.import_historical_estimates($1,$2,$3)", [
      company,
      estimates.snapshotSha256,
      JSON.stringify(estimates.records),
    ]);
    await t.test(
      "loads forward references, replays and leaves current business untouched",
      async () => {
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 5,
          unchanged: 0,
        });
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 0,
          unchanged: 5,
        });
        for (const table of ["customers", "projects", "invoices", "payments"])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        const rows = await db.query<{ original: unknown }>(
          "select original from app_private.historical_business_sources",
        );
        assert.equal(rows.rows.length, 5);
      },
    );
    await t.test(
      "cross-company targets and wrong target kinds cannot be linked",
      async () => {
        const payment = payload.records.find((r) => r.kind === "payments")!,
          project = payload.records.find((r) => r.kind === "projects")!;
        await assert.rejects(
          db.query(
            "update public.historical_business set client_id=$1 where company_id=$2 and kind='payments'",
            [project.id, company],
          ),
          /foreign key/,
        );
        const foreignPayload = historicalBusinessPayload(source, foreign);
        const fp = foreignPayload.records.find((r) => r.kind === "payments")!;
        fp.client_id = payment.client_id;
        const fe = historicalEstimatePayload(source, foreign);
        await db.query(
          "select app_private.import_historical_estimates($1,$2,$3)",
          [foreign, fe.snapshotSha256, JSON.stringify(fe.records)],
        );
        await assert.rejects(
          db.query("select app_private.import_historical_business($1,$2,$3)", [
            foreign,
            foreignPayload.snapshotSha256,
            JSON.stringify(foreignPayload.records),
          ]),
          /foreign key/,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.historical_business where company_id=$1",
              [foreign],
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "late changes roll back prior inserts and reject unknown public fields",
      async () => {
        const added = structuredClone(
          payload.records.find((r) => r.kind === "clients")!,
        );
        added.id = randomUUID();
        added.source_id = "new";
        added.original.external_id = "new";
        const changed = structuredClone(
          payload.records.find((r) => r.kind === "invoices")!,
        );
        changed.presentation.amount_cents = "999";
        await assert.rejects(
          load([added, changed]),
          /historical_business_conflict/,
        );
        assert.equal(
          (await db.query("select * from public.historical_business")).rows
            .length,
          5,
        );
        Object.assign(added.presentation.details, { token: "PRIVATE" });
        await assert.rejects(load([added]), /invalid_business_record/);
      },
    );
    await t.test(
      "owner sees only own records, cannot alter them or read raw sources",
      async () => {
        await as(owner);
        assert.equal(
          (await db.query("select * from public.historical_business")).rows
            .length,
          5,
        );
        await assert.rejects(
          db.query("select * from app_private.historical_business_sources"),
          /permission denied/,
        );
        await assert.rejects(load(), /permission denied/);
        await assert.rejects(
          db.query("update public.historical_business set presentation='{}'"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("delete from public.historical_business"),
          /permission denied/,
        );
        await as(other);
        assert.equal(
          (await db.query("select * from public.historical_business")).rows
            .length,
          0,
        );
      },
    );
    await t.test(
      "each existing module controls its own history; financial permission includes payments",
      async () => {
        for (const [module, kinds] of [
          ["clientes", ["clients"]],
          ["fin-proyectos", ["projects"]],
          ["fin-invoices", ["invoices", "payments"]],
        ] as const) {
          await as(owner);
          await db.query(
            "select public.set_member_access($1,$2,'member',true,$3)",
            [company, staff, JSON.stringify({ [module]: ["read"] })],
          );
          await as(staff);
          const rows = await db.query<{ kind: string }>(
            "select distinct kind from public.historical_business order by kind",
          );
          assert.deepEqual(
            rows.rows.map((r) => r.kind),
            kinds,
          );
        }
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [company, staff],
        );
        await as(staff);
        assert.equal(
          (await db.query("select * from public.historical_business")).rows
            .length,
          0,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(
          db.query("select * from public.historical_business"),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
