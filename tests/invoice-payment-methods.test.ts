import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { authStorageContract } from "./helpers/auth-storage-contract";
import { printedPages } from "./helpers/pdf-printed-pages";
import { emptyItem } from "../src/lib/estimates";
import { parseFinanceRequest } from "../src/lib/finance-requests";
import { storedCommercialDocument } from "../src/lib/commercial-documents";
import { renderCommercialPdf } from "../src/lib/commercial-pdf";
import { expenseMethods, expenseSchema } from "../src/lib/operations";

const methods = [
  "EFECTIVO",
  "CHEQUE",
  "TRANSFERENCIA",
  "TARJETA_EXTERNA",
  "ZELLE",
  "NOT_CHARGED",
  "SIN_METODO",
  "OTRO",
];
test("invoice form accepts Zelle and preserves the existing payment method codes", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    operation: "payment",
    id: randomUUID(),
    request: randomUUID(),
    version: "1",
    payment_id: randomUUID(),
    amount: "1.01",
    payment_date: "2026-10-02",
    method: "ZELLE",
    reference: "QA",
    notes: "Synthetic",
  }))
    form.set(key, value);
  for (const method of methods) {
    form.set("method", method);
    const result = parseFinanceRequest(form);
    assert(result.success);
    assert("method" in result.data.payload);
    assert.equal(result.data.payload.method, method);
  }
  for (const method of ["", "Not charged.", "zellE", "untrusted"]) {
    form.set("method", method);
    assert.equal(parseFinanceRequest(form).success, false);
  }
});

test("Zelle additive migration, durable payment, reversals and immutable documents", async (t) => {
  const db = new PGlite(),
    owner = randomUUID(),
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
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const execute = async (
    operation: string,
    id: string,
    version: number,
    data: object,
    request: string = randomUUID(),
    tenant: string = company,
  ) =>
    (
      await db.query<{ data: unknown }>(
        "select execute_finance_action($1,$2,$3,$4,$5,$6) data",
        [tenant, request, operation, id, version, JSON.stringify(data)],
      )
    ).rows[0].data;
  const fingerprint = async () => {
    await db.exec("reset role");
    const rows = (
      await db.query<{
        invoices: unknown;
        payments: unknown;
        projects: unknown;
        documents: unknown;
        audits: number;
        receipts: number;
      }>(
        "select (select jsonb_agg(to_jsonb(t) order by id) from invoices t) invoices,(select jsonb_agg(to_jsonb(t) order by id) from payments t) payments,(select jsonb_agg(to_jsonb(t) order by id) from projects t) projects,(select jsonb_agg(to_jsonb(t) order by id) from commercial_documents t) documents,(select count(*) from audit_events) audits,(select count(*) from app_private.finance_requests) receipts",
      )
    ).rows;
    await as(owner);
    return rows;
  };
  try {
    await db.exec(authStorageContract);
    for (const f of (await readdir(directory))
      .filter((f) => f.endsWith(".sql") && f < "202610020070")
      .sort())
      await db.exec(await readFile(new URL(f, directory), "utf8"));
    await db.query(
      "insert into auth.users values($1,'zelle-owner@example.test',now()),($2,'zelle-staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select create_company($1,'Payment methods A'),create_company($2,'Payment methods B')",
      [company, other],
    );
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({ full_name: "Synthetic Peña", status: "active" }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
      company,
      estimate,
      JSON.stringify({
        customer_id: customer,
        status: "PENDIENTE",
        estimate_date: "2026-10-02",
        valid_until: null,
        discount: "0",
        taxes: "0",
        notes: "",
        items: [
          { ...emptyItem, name: "Synthetic service", unit_price: "100.10" },
        ],
      }),
    ]);
    const invoice = String(
      (
        await db.query<{ id: string }>(
          "select approve_estimate($1,$2,1,'2026-10-02','Synthetic project','Synthetic approval') id",
          [company, estimate],
        )
      ).rows[0].id,
    );
    const legacyId = randomUUID(),
      legacyData = {
        payment_id: legacyId,
        amount: "10.11",
        payment_date: "2026-10-02",
        method: "TRANSFERENCIA",
        reference: "QA-OLD",
        notes: "Original method",
      };
    await execute("payment", invoice, 1, legacyData);
    const old = (
      await db.query<{ data: { id: string; snapshot: unknown } }>(
        "select to_jsonb(prepare_commercial_document($1,'invoice',$2,2)) data",
        [company, invoice],
      )
    ).rows[0].data;
    await t.test(
      "migration leaves all pre-existing financial rows, receipts and snapshots unchanged",
      async () => {
        const before = await fingerprint();
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL("202610020070_invoice_payment_methods.sql", directory),
            "utf8",
          ),
        );
        assert.deepEqual(await fingerprint(), before);
      },
    );
    const payments: Array<{
      method: string;
      id: string;
      request: string;
      version: number;
      data: object;
      receipt: unknown;
    }> = [];
    await t.test(
      "all eight codes persist including Not charged and unspecified method; lost-response retries preserve amount, method and audit",
      async () => {
        let version = 2;
        for (const method of methods) {
          const id = randomUUID(),
            request: string = randomUUID(),
            data = {
              payment_id: id,
              amount: "1.01",
              payment_date: "2026-10-02",
              method,
              reference: `QA-${method}`,
              notes: "No real transfer",
            };
          const receipt = await execute(
              "payment",
              invoice,
              version,
              data,
              request,
            ),
            before = await fingerprint();
          assert.deepEqual(
            await execute("payment", invoice, version, data, request),
            receipt,
          );
          await assert.rejects(
            execute(
              "payment",
              invoice,
              version,
              { ...data, method: method === "ZELLE" ? "OTRO" : "ZELLE" },
              request,
            ),
            /request_conflict/,
          );
          assert.deepEqual(await fingerprint(), before);
          payments.push({ method, id, request, version, data, receipt });
          version++;
        }
        assert.deepEqual(
          (
            await db.query(
              "select paid_amount,balance_due,version from invoices where id=$1",
              [invoice],
            )
          ).rows[0],
          { paid_amount: "18.19", balance_due: "81.91", version: 10 },
        );
        for (const p of payments)
          assert.equal(
            (
              await db.query<{ method: string }>(
                "select method from payments where id=$1",
                [p.id],
              )
            ).rows[0].method,
            p.method,
          );
      },
    );
    const zelle = payments.find((p) => p.method === "ZELLE")!;
    await t.test(
      "wrong tenant, read-only and revoked forms cannot register or replay a payment",
      async () => {
        const before = await fingerprint();
        await assert.rejects(
          execute(
            "payment",
            invoice,
            8,
            { ...zelle.data, payment_id: randomUUID() },
            randomUUID(),
            other,
          ),
          /invoice_unavailable/,
        );
        await db.query(
          "select add_company_member($1,'zelle-staff@example.test')",
          [company],
        );
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          company,
          staff,
          JSON.stringify({ "fin-invoices": ["read"] }),
        ]);
        await as(staff);
        await assert.rejects(
          execute("payment", invoice, 10, zelle.data),
          /permission_denied/,
        );
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',false,'{}')", [
          company,
          staff,
        ]);
        await as(staff);
        await assert.rejects(
          execute("payment", invoice, zelle.version, zelle.data, zelle.request),
          /permission_denied/,
        );
        const after = await fingerprint();
        assert.deepEqual(after[0].invoices, before[0].invoices);
        assert.deepEqual(after[0].payments, before[0].payments);
        assert.equal(after[0].receipts, before[0].receipts);
      },
    );
    await t.test(
      "PDF prints captured Zelle method and reversal affects only subsequent snapshots",
      async () => {
        const data = (
          await db.query<{ data: unknown }>(
            "select to_jsonb(prepare_commercial_document($1,'invoice',$2,10)) data",
            [company, invoice],
          )
        ).rows[0].data;
        const captured = storedCommercialDocument.parse(data);
        const content = (
          await printedPages(await renderCommercialPdf(captured, true))
        )
          .flat()
          .map((x) => x.text)
          .join("\n");
        assert.match(content, /Zelle/);
        assert.match(content, /Not charged\./);
        assert.match(content, /\(sin método\)/);
        assert.match(content, /Estado de pago al generar: Pago parcial/);
        assert.match(content, /QA-ZELLE/);
        assert.match(content, /Total de pagos aplicados al generar: \$18.19/);
        assert.equal(
          captured.snapshot.record.payments?.find((p) => p.id === zelle.id)
            ?.method,
          "ZELLE",
        );
        const request: string = randomUUID(),
          receipt = await execute(
            "void-payment",
            zelle.id,
            1,
            { reason: "Synthetic Zelle reversal" },
            request,
          ),
          before = await fingerprint();
        assert.deepEqual(
          await execute(
            "void-payment",
            zelle.id,
            1,
            { reason: "Synthetic Zelle reversal" },
            request,
          ),
          receipt,
        );
        assert.deepEqual(await fingerprint(), before);
        assert.deepEqual(
          (
            await db.query(
              "select paid_amount,balance_due,version from invoices where id=$1",
              [invoice],
            )
          ).rows[0],
          { paid_amount: "17.18", balance_due: "82.92", version: 11 },
        );
        const next = (
          await db.query<{
            data: { snapshot: { record: { payments: Array<{ id: string }> } } };
          }>(
            "select to_jsonb(prepare_commercial_document($1,'invoice',$2,11)) data",
            [company, invoice],
          )
        ).rows[0].data;
        assert.ok(
          next.snapshot.record.payments.every((p) => p.id !== zelle.id),
        );
        assert.deepEqual(
          (
            await db.query<{ snapshot: unknown }>(
              "select snapshot from commercial_documents where id=$1",
              [old.id],
            )
          ).rows[0].snapshot,
          old.snapshot,
        );
        assert.deepEqual(
          (
            await db.query<{ snapshot: unknown }>(
              "select snapshot from commercial_documents where id=$1",
              [captured.id],
            )
          ).rows[0].snapshot,
          (data as { snapshot: unknown }).snapshot,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from payments where invoice_id=$1",
              [invoice],
            )
          ).rows[0].n,
          9,
        );
      },
    );
  } finally {
    await db.close();
  }
});

test("invoice-only legacy methods never expand expense validation", () => {
  assert.deepEqual(
    Object.keys(expenseMethods).sort(),
    [
      "EFECTIVO",
      "CHEQUE",
      "TRANSFERENCIA",
      "TARJETA_EXTERNA",
      "ZELLE",
      "OTRO",
    ].sort(),
  );
  for (const method of ["NOT_CHARGED", "SIN_METODO"])
    assert.equal(expenseSchema.shape.method.safeParse(method).success, false);
});
