import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { printedPages } from "./helpers/pdf-printed-pages";
import { emptyItem } from "../src/lib/estimates";
import { storedCommercialDocument } from "../src/lib/commercial-documents";
import { renderCommercialPdf } from "../src/lib/commercial-pdf";

test("invoice PDF captures applied payments at its locked version without changing finance", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID(),
    foreign = randomUUID();
  const first = randomUUID(),
    second = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const fingerprint = async () =>
    JSON.stringify(
      (
        await db.query(
          "select 'invoices' entity,md5(string_agg(to_jsonb(t)::text,'' order by id)) hash from invoices t union all select 'payments',md5(string_agg(to_jsonb(t)::text,'' order by id)) from payments t union all select 'projects',md5(string_agg(to_jsonb(t)::text,'' order by id)) from projects t",
        )
      ).rows,
    );
  try {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now()),($2,'reader@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query("select create_company($1,'Invoice payment QA')", [company]);
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
        notes: "Synthetic invoice payments",
        items: [{ ...emptyItem, name: "QA service", unit_price: "100.10" }],
      }),
    ]);
    const invoice = String(
      (
        await db.query<{ id: string }>(
          "select approve_estimate($1,$2,1,'2026-10-02','QA project','Synthetic approval') id",
          [company, estimate],
        )
      ).rows[0].id,
    );
    const capturedSnapshots = new Map<string, unknown>();
    const prepare = async (version: number) => {
      const raw = (
        await db.query<{ data: { id: string; snapshot: unknown } }>(
          "select to_jsonb(prepare_commercial_document($1,'invoice',$2,$3)) data",
          [company, invoice, version],
        )
      ).rows[0].data;
      if (!capturedSnapshots.has(raw.id))
        capturedSnapshots.set(raw.id, raw.snapshot);
      return storedCommercialDocument.parse(raw);
    };
    const pay = async (
      id: string,
      version: number,
      amount: string,
      reference: string,
    ) =>
      db.query("select record_payment($1,$2,$3,$4,$5)", [
        company,
        id,
        invoice,
        version,
        JSON.stringify({
          amount,
          payment_date: "2026-10-02",
          method: "TRANSFERENCIA",
          reference,
          notes: "QA depósito Peña, sin transferencia real",
        }),
      ]);
    let noPayments: Awaited<ReturnType<typeof prepare>>;
    let partial: Awaited<ReturnType<typeof prepare>>;
    let paid: Awaited<ReturnType<typeof prepare>>;
    await t.test(
      "no-payment snapshot is explicit; preparation preserves financial rows",
      async () => {
        const before = await fingerprint();
        noPayments = await prepare(1);
        assert.deepEqual(noPayments.snapshot.record.payments, []);
        assert.equal(await fingerprint(), before);
        const content = (
          await printedPages(await renderCommercialPdf(noPayments, true))
        )
          .flat()
          .map((x) => x.text)
          .join("\n");
        assert.match(content, /Sin pagos aplicados al generar/);
        assert.match(content, /Total de pagos aplicados al generar: \$0.00/);
      },
    );
    await t.test(
      "partial and full receipts preserve amounts, references and earlier snapshots",
      async () => {
        await pay(first, 1, "30.06", "QA-PARTIAL");
        const before = await fingerprint();
        partial = await prepare(2);
        assert.equal(await fingerprint(), before);
        assert.equal(partial.snapshot.record.paid_amount, 30.06);
        assert.equal(partial.snapshot.record.balance_due, 70.04);
        assert.deepEqual(
          partial.snapshot.record.payments?.map((p) => [
            p.id,
            p.amount,
            p.reference,
          ]),
          [[first, 30.06, "QA-PARTIAL"]],
        );
        await pay(second, 2, "70.04", "QA-BALANCE");
        paid = await prepare(3);
        assert.equal(paid.snapshot.record.paid_amount, 100.1);
        assert.equal(paid.snapshot.record.balance_due, 0);
        assert.equal(paid.snapshot.record.payment_status, "PAID");
        assert.equal(paid.snapshot.record.payments?.length, 2);
        await assert.rejects(() => prepare(2), /record_conflict/);
        const old = (
          await db.query<{ snapshot: unknown }>(
            "select snapshot from commercial_documents where id=$1",
            [partial.id],
          )
        ).rows[0].snapshot;
        assert.deepEqual(old, capturedSnapshots.get(partial.id));
        const content = (
          await printedPages(await renderCommercialPdf(paid, true))
        )
          .flat()
          .map((x) => x.text)
          .join("\n");
        assert.match(content, /Estado de pago al generar: Pagada/);
        assert.match(content, /QA-PARTIAL/);
        assert.match(content, /QA-BALANCE/);
        assert.match(content, /Total de pagos aplicados al generar: \$100.10/);
      },
    );
    await t.test(
      "reversals affect a new document; old applied-payment receipt remains immutable",
      async () => {
        await db.query("select void_payment($1,$2,1,'Synthetic reversal')", [
          company,
          first,
        ]);
        const before = await fingerprint(),
          reversed = await prepare(4);
        assert.equal(await fingerprint(), before);
        assert.equal(reversed.snapshot.record.paid_amount, 70.04);
        assert.equal(reversed.snapshot.record.balance_due, 30.06);
        assert.deepEqual(
          reversed.snapshot.record.payments?.map((p) => p.id),
          [second],
        );
        const original = (
          await db.query<{ snapshot: unknown }>(
            "select snapshot from commercial_documents where id=$1",
            [paid.id],
          )
        ).rows[0].snapshot;
        assert.deepEqual(original, capturedSnapshots.get(paid.id));
        assert.equal(
          (await prepare(4)).id,
          reversed.id,
          "repeat creates no duplicate",
        );
      },
    );
    await t.test(
      "printed payment status uses the captured revision; legacy status is never inferred",
      async () => {
        for (const [doc, label] of [
          [noPayments, "Sin pagos"],
          [partial, "Pago parcial"],
          [paid, "Pagada"],
        ] as const) {
          const content = (
            await printedPages(await renderCommercialPdf(doc, true))
          )
            .flat()
            .map((x) => x.text)
            .join("\n");
          assert.ok(content.includes(`Estado de pago al generar: ${label}`));
          assert.ok(content.includes("Estado al generar: Emitida"));
        }
        const legacy = structuredClone(noPayments);
        delete legacy.snapshot.record.payment_status;
        const legacyText = (
          await printedPages(await renderCommercialPdf(legacy, true))
        )
          .flat()
          .map((x) => x.text)
          .join("\n");
        assert.ok(!legacyText.includes("Estado de pago al generar:"));
        assert.equal(
          storedCommercialDocument.safeParse({
            ...legacy,
            snapshot: {
              ...legacy.snapshot,
              record: { ...legacy.snapshot.record, payment_status: "INVENTED" },
            },
          }).success,
          false,
        );
        // Renderer and VOID snapshot capture are covered by separate contracts.
        const voidFixture = structuredClone(noPayments);
        voidFixture.snapshot.record.status = "VOID";
        voidFixture.snapshot.record.payment_status = "VOID";
        const voidText = (
          await printedPages(await renderCommercialPdf(voidFixture, true))
        )
          .flat()
          .map((x) => x.text)
          .join("\n");
        assert.ok(voidText.includes("Estado de pago al generar: Anulada"));
      },
    );
    await t.test(
      "wrong company, reader and revoked writer cannot prepare payments",
      async () => {
        await assert.rejects(
          () =>
            db.query("select prepare_commercial_document($1,'invoice',$2,4)", [
              foreign,
              invoice,
            ]),
          /permission_denied/,
        );
        await db.query("select add_company_member($1,'reader@example.test')", [
          company,
        ]);
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          company,
          staff,
          JSON.stringify({ "fin-invoices": ["read"] }),
        ]);
        await as(staff);
        await assert.rejects(() => prepare(4), /permission_denied/);
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          company,
          staff,
          JSON.stringify({ "fin-invoices": ["read", "write"] }),
        ]);
        await as(staff);
        assert.equal((await prepare(4)).record_version, 4);
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',false,$3)", [
          company,
          staff,
          JSON.stringify({ "fin-invoices": ["read", "write"] }),
        ]);
        await as(staff);
        await assert.rejects(() => prepare(4), /permission_denied/);
        await as(owner);
      },
    );
    await t.test(
      "inconsistent applied-payment total fails before inserting a document",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update invoices set version=5,paid_amount=70.03,balance_due=30.07 where id=$1",
          [invoice],
        );
        await as(owner);
        const before = await fingerprint();
        await assert.rejects(() => prepare(5), /payment_snapshot_mismatch/);
        assert.equal(await fingerprint(), before);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from commercial_documents where company_id=$1 and record_version=5",
              [company],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "legacy snapshots stay optional; many long notes paginate with payment references intact",
      async () => {
        const legacy = structuredClone(paid);
        delete legacy.snapshot.record.payments;
        delete legacy.snapshot.record.payment_status;
        assert.ok(storedCommercialDocument.safeParse(legacy).success);
        const legacyBytes = await renderCommercialPdf(legacy, true);
        assert.equal(
          (await printedPages(legacyBytes))
            .flat()
            .filter((x) => x.text === "Pagos y depósitos aplicados").length,
          0,
        );
        const long = structuredClone(paid);
        long.snapshot.record.payments = Array.from({ length: 25 }, (_, i) => ({
          id: randomUUID(),
          version: 1,
          payment_date: "2026-10-02",
          amount: i === 24 ? 4.1 : 4.0,
          method: "TRANSFERENCIA",
          reference: `QA-${i + 1}-Peña`,
          notes: `Comprobante sintético número ${i + 1}. `.repeat(7),
        }));
        const bytes = await renderCommercialPdf(long, true),
          pages = await printedPages(bytes),
          content = pages
            .flat()
            .map((x) => x.text)
            .join("\n");
        assert.ok(pages.length > 2);
        for (let i = 1; i <= 25; i++)
          assert.match(content, new RegExp(`QA-${i}-Peña`));
        for (const page of pages)
          for (let i = 0; i < page.length; i++)
            if (page[i].text === "Pagos y depósitos aplicados")
              assert.ok(page[i + 1], "title stays with first payment");
        assert.deepEqual(await renderCommercialPdf(long, true), bytes);
        await mkdir(".local/closure-20261002", { recursive: true });
        await writeFile(
          ".local/closure-20261002/invoice-applied-payments.pdf",
          await renderCommercialPdf(paid, true),
        );
        await writeFile(
          ".local/closure-20261002/invoice-many-payments.pdf",
          bytes,
        );
      },
    );
  } finally {
    await db.close();
  }
});
