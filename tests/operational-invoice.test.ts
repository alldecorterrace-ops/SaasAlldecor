import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fullDatabase } from "./helpers/full-database";
import { historicalBusinessPayload } from "../src/lib/migration/historical-business-payload";
import { historicalEstimatePayload } from "../src/lib/migration/historical-estimate-payload";
import { planOperationalCustomers } from "../src/lib/migration/operational-customers";
import { planOperationalProjects } from "../src/lib/migration/operational-projects";
import { InvoiceProvenance } from "../src/components/invoice-provenance";
import { DocumentLines } from "../src/components/document-lines";
import { emptyItem } from "../src/lib/estimates";

test("reviewed invoice import is atomic, isolated, exact and idempotent", async (t) => {
  const { db } = await fullDatabase(),
    company = randomUUID(),
    foreign = randomUUID(),
    owner = randomUUID(),
    other = randomUUID(),
    staff = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const line = {
    label: "Original line",
    spec: "Saved specification",
    price: "100.00",
    data: { private_token: "never-expose" },
  };
  const invoice = {
    external_id: "i",
    consecutive: "Legacy-1",
    client_external_id: "c",
    project_external_id: "p",
    service_external_id: "",
    invoice_date: "2020-02-03",
    status: "OPEN",
    total: "100.00",
    paid_amount: "40.00",
    balance_due: "60.00",
    payment_status: "PARTIAL",
    notes: "Original note",
    void_reason: "",
    source_json: JSON.stringify({
      nombre: "Captured name",
      email: "saved@example.test",
      telefono: "",
      direccion: "Saved address",
      subtotal: "100.00",
      discount: "0.00",
      taxes: "0.00",
      total: "100.00",
      items: [line],
    }),
  };
  const source = {
    format: "adt-history-snapshot-v1",
    origin: "restored_snapshot",
    clients: [
      {
        external_id: "c",
        full_name: "Current name",
        email: "current@example.test",
        phone: "",
        address: "",
        city: "",
        postal_code: "",
        service: "",
        client_date: "2020-01-01",
        notes: "",
        status: "ACTIVO",
      },
    ],
    estimates: [
      {
        external_id: "e",
        client_external_id: "c",
        consecutive: "E1",
        estimate_date: "2020-01-02",
        status: "LEGACY",
        total: "100.00",
        discount: "0.00",
        taxes: "0.00",
        source_json: "{}",
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
        project_date: "2020-02-03",
        total: "100.00",
      },
    ],
    invoices: [invoice],
    payments: [
      {
        external_id: "pay",
        invoice_external_id: "i",
        client_external_id: "c",
        project_external_id: "p",
        payment_date: "2020-02-03",
        amount: "40.00",
        status: "APPLIED",
        method: "CASH",
        reference: "ABC",
        notes: "Saved payment",
        void_reason: "",
        source_json: "{}",
      },
    ],
    documents: [],
    contracts: [],
  };
  try {
    await db.exec("set timezone='UTC'");
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [other, "other@example.test"],
      [staff, "staff@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'First company')", [
      company,
    ]);
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    await as(other);
    await db.query("select public.create_company($1,'Other company')", [
      foreign,
    ]);
    await db.exec("reset role");
    const ep = historicalEstimatePayload(source, company),
      bp = historicalBusinessPayload(source, company);
    await db.query("select app_private.import_historical_estimates($1,$2,$3)", [
      company,
      ep.snapshotSha256,
      JSON.stringify(ep.records),
    ]);
    await db.query("select app_private.import_historical_business($1,$2,$3)", [
      company,
      bp.snapshotSha256,
      JSON.stringify(bp.records),
    ]);
    const cp = planOperationalCustomers(source, [], company);
    await db.query(
      "select app_private.import_operational_customers($1,$2,$3,$4,$5)",
      [company, owner, cp.snapshotSha256, "[]", JSON.stringify(cp.records)],
    );
    const mappings = (
      await db.query<{ value: { customer_id: string } }>(
        "select to_jsonb(m) value from public.historical_customer_migrations m order by historical_id",
      )
    ).rows.map((r) => r.value);
    const destination = {
        projects: [],
        customer_ids: mappings.map((r) => r.customer_id),
        customer_mappings: mappings,
      },
      pp = planOperationalProjects(source, destination, company);
    await db.query(
      "select app_private.import_operational_projects($1,$2,$3,$4,$5)",
      [
        company,
        owner,
        pp.snapshotSha256,
        JSON.stringify(destination),
        JSON.stringify(pp.records),
      ],
    );
    const project = (
        await db.query<{ id: string; customer_id: string }>(
          "select id,customer_id from public.projects where company_id=$1",
          [company],
        )
      ).rows[0],
      hist = bp.records.find((r) => r.kind === "invoices")!,
      payment = bp.records.find((r) => r.kind === "payments")!;
    const expected = {
      source_sha256: hist.source_sha256,
      customer_id: project.customer_id,
      project_id: project.id,
      payments: [{ id: payment.id, source_sha256: payment.source_sha256 }],
    };
    const load = (e: unknown = expected, actor = owner, c = company) =>
      db.query<{
        result: {
          invoice_id: string;
          inserted: number;
          payments: number;
          unchanged: number;
        };
      }>("select app_private.import_operational_invoice($1,$2,$3,$4) result", [
        c,
        actor,
        hist.id,
        JSON.stringify(e),
      ]);
    const originalsBefore = (
      await db.query(
        "select * from app_private.historical_business_sources order by kind,id",
      )
    ).rows;
    const projectsBefore = (
      await db.query("select * from public.projects order by id")
    ).rows;
    const customersBefore = (
      await db.query("select * from public.customers order by id")
    ).rows;
    await t.test(
      "rejects changed plans, destinations, nonmanagers and foreign company",
      async () => {
        await assert.rejects(
          load({ ...expected, source_sha256: "0".repeat(64) }),
          /invoice_source_changed/,
        );
        await assert.rejects(
          load({ ...expected, payments: [] }),
          /invoice_payment_source_changed/,
        );
        await assert.rejects(
          load({ ...expected, project_id: randomUUID() }),
          /invoice_destination_changed/,
        );
        await assert.rejects(load(expected, staff), /not_manager/);
        await assert.rejects(load(expected, owner, foreign), /not_manager/);
        await assert.rejects(
          load(expected, other, foreign),
          /query returned no rows/,
        );
      },
    );
    const invalidOriginal = async (
      original: unknown,
      kind = "invoices",
      error = /invoice_/,
    ) => {
      await db.exec("begin");
      try {
        await db.query(
          "update app_private.historical_business_sources set original=$1 where company_id=$2 and kind=$3",
          [JSON.stringify(original), company, kind],
        );
        await assert.rejects(load(), error);
      } finally {
        await db.exec("rollback");
      }
    };
    await t.test(
      "rejects missing details, rounding, incorrect balances and unsafe payment records atomically",
      async () => {
        await invalidOriginal({ ...invoice, source_json: "{}" });
        const j = JSON.parse(invoice.source_json);
        j.items[0].price = "99.99";
        await invalidOriginal({ ...invoice, source_json: JSON.stringify(j) });
        await invalidOriginal({ ...invoice, balance_due: "59.99" });
        await invalidOriginal(
          { ...invoice, total: "100.001" },
          "invoices",
          /invalid_invoice_import_money/,
        );
        await invalidOriginal({ ...invoice, status: "VOID" });
        await invalidOriginal(
          { ...source.payments[0], status: "VOID" },
          "payments",
        );
        await invalidOriginal(
          { ...source.payments[0], method: "Not charged." },
          "payments",
        );
        await invalidOriginal(
          { ...source.payments[0], amount: "39.99" },
          "payments",
        );
        assert.equal(
          (await db.query("select * from public.invoices")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.payments")).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from app_private.operational_invoice_imports",
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "private importer is unavailable to app users including owner",
      async () => {
        await as(owner);
        await assert.rejects(load(), /permission denied/);
        await db.exec("reset role");
      },
    );
    const result = (await load()).rows[0].result;
    await t.test(
      "copies original financial fields and links without new approvals or source mutations",
      async () => {
        assert.equal(result.inserted, 1);
        assert.equal(result.payments, 1);
        const i = (
            await db.query<Record<string, unknown>>(
              "select * from public.invoices",
            )
          ).rows[0],
          p = (
            await db.query<Record<string, unknown>>(
              "select * from public.payments",
            )
          ).rows[0];
        assert.equal(i.historical_invoice_id, hist.id);
        assert.equal(i.estimate_id, null);
        assert.equal(i.estimate_version, null);
        assert.equal(i.number, "Legacy-1");
        assert.equal(i.total, "100.00");
        assert.equal(i.paid_amount, "40.00");
        assert.equal(i.balance_due, "60.00");
        assert.deepEqual(i.customer_snapshot, {
          full_name: "Captured name",
          email: "saved@example.test",
          phone: "",
          address: "Saved address",
          city: "",
          postal_code: "",
        });
        assert.equal(JSON.stringify(i.items).includes("private_token"), false);
        assert.equal(p.historical_payment_id, payment.id);
        assert.equal(p.method, "EFECTIVO");
        assert.equal(p.amount, "40.00");
        assert.deepEqual(
          (await db.query("select * from public.projects order by id")).rows,
          projectsBefore,
        );
        assert.deepEqual(
          (await db.query("select * from public.customers order by id")).rows,
          customersBefore,
        );
        assert.deepEqual(
          (
            await db.query(
              "select * from app_private.historical_business_sources order by kind,id",
            )
          ).rows,
          originalsBefore,
        );
        assert.equal(
          (await db.query("select * from public.estimates")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "RLS hides the copies from another company and users without module access",
      async () => {
        for (const id of [other, staff]) {
          await as(id);
          assert.equal(
            (await db.query("select * from public.invoices")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("select * from public.payments")).rows.length,
            0,
          );
        }
        await as(owner);
        assert.equal(
          (await db.query("select * from public.invoices")).rows.length,
          1,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "replay preserves later payment operations and invoice versions",
      async () => {
        await as(owner);
        await db.query("select public.record_payment($1,$2,$3,1,$4)", [
          company,
          randomUUID(),
          result.invoice_id,
          JSON.stringify({
            payment_date: "2020-02-04",
            amount: "10.00",
            method: "EFECTIVO",
            reference: "NEW",
            notes: "",
          }),
        ]);
        await db.exec("reset role");
        const before = (await db.query("select * from public.invoices")).rows;
        assert.deepEqual((await load()).rows[0].result, {
          invoice_id: result.invoice_id,
          inserted: 0,
          payments: 0,
          unchanged: 1,
        });
        assert.deepEqual(
          (await db.query("select * from public.invoices")).rows,
          before,
        );
        assert.equal(
          (await db.query("select * from public.payments")).rows.length,
          2,
        );
        await assert.rejects(
          load({ ...expected, source_sha256: "0".repeat(64) }),
          /invoice_import_plan_changed/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("imported invoice presentation preserves line amounts and makes origin explicit", () => {
  const html = renderToStaticMarkup(
    createElement(DocumentLines, {
      historical: true,
      items: [
        { ...emptyItem, name: "<script>unsafe</script>", line_total: "100.00" },
      ],
      subtotal: "100.00",
      discount: "0.00",
      taxes: "0.00",
      total: "100.00",
    }),
  );
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("Cantidad / medidas"));
  assert.ok(html.includes("$100.00"));
  const origin = renderToStaticMarkup(
    createElement(InvoiceProvenance, {
      companyId: randomUUID(),
      historicalId: randomUUID(),
    }),
  );
  assert.ok(origin.includes("no genera una aprobación ni un cobro nuevo"));
  assert.ok(origin.includes("/historico/invoices/"));
});
