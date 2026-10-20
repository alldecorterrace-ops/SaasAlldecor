import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import {
  commercialIdentity,
  emptyCommercialIdentity,
} from "../src/lib/commercial-identity";
import { storedCommercialDocument } from "../src/lib/commercial-documents";
import { renderCommercialPdf } from "../src/lib/commercial-pdf";
import { invoiceEmailBody } from "../src/lib/invoice-email";
import { estimateEmailBody } from "../src/lib/estimate-email";
import { emptyItem } from "../src/lib/estimates";
import { printedPages } from "./helpers/pdf-printed-pages";

const identity = {
  ...emptyCommercialIdentity,
  legal_name: "QA Empresa Peña & <b>",
  tagline: "QA Exterior — sin venta",
  address: "123 QA Synthetic\nCiudad de prueba, 33101",
  phone: "000-000-0000",
  email: "office@saasalldecor.invalid",
  website: "https://company.example.invalid",
  license: "QA acreditación ficticia",
  payment_instructions: "Cheque de prueba. No pagar.\nReferencia de ensayo.",
  footer: "Pie QA Peña & <script> — sin validez.",
};
test("commercial identity accepts only explicit contact text and credential-free HTTPS", () => {
  assert.equal(
    commercialIdentity.parse({ ...identity, address: " \r\n123 QA\r\n " })
      .address,
    "123 QA",
  );
  for (const data of [
    { ...identity, website: "javascript:alert(1)" },
    { ...identity, website: "https://user:password@example.test" },
    { ...identity, email: "qa@example.test\r\nBcc: other@example.test" },
    { ...identity, phone: "qa\u0000x" },
    { ...identity, footer: "QA\ttext" },
    { ...identity, unknown: "value" },
  ])
    assert.equal(commercialIdentity.safeParse(data).success, false);
  assert.equal(
    commercialIdentity.safeParse(emptyCommercialIdentity).success,
    true,
  );
});

test("tenant commercial identity is versioned, manager-only and frozen with each new PDF", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    other = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID();
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const save = async (
    version: number,
    data: unknown = identity,
    confirmed = true,
    c = company,
  ) =>
    db.query("select save_commercial_identity($1,$2,$3,$4) v", [
      c,
      version,
      JSON.stringify(data),
      confirmed,
    ]);
  const prepare = async (kind: string, record: string, version: number) =>
    storedCommercialDocument.parse(
      (
        await db.query<{ d: unknown }>(
          "select to_jsonb(prepare_commercial_document($1,$2,$3,$4)) d",
          [company, kind, record, version],
        )
      ).rows[0].d,
    );
  const finance = async () => {
    await db.exec("reset role");
    return JSON.stringify(
      (
        await db.query(
          "select * from (select 'estimates' entity,to_jsonb(e) value from estimates e union all select 'invoices',to_jsonb(i) from invoices i union all select 'payments',to_jsonb(p) from payments p union all select 'projects',to_jsonb(p) from projects p) q order by entity,value::text",
        )
      ).rows,
    );
  };
  try {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now()),($2,'staff@example.test',now()),($3,'other@example.test',now())",
      [owner, staff, other],
    );
    await as(owner);
    await db.query("select create_company($1,'QA Company A')", [company]);
    await as(other);
    await db.query("select create_company($1,'QA Company B')", [foreign]);
    await save(
      0,
      {
        ...identity,
        legal_name: "OTHER TENANT QA",
        email: "foreign@example.invalid",
      },
      true,
      foreign,
    );
    await as(owner);
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "QA Customer Peña",
        email: "customer@saasalldecor.invalid",
        status: "active",
      }),
    ]);
    const input = {
      customer_id: customer,
      status: "PENDIENTE",
      estimate_date: "2026-10-07",
      valid_until: null,
      discount: "0",
      taxes: "0",
      notes: "QA sin venta",
      items: [{ ...emptyItem, name: "QA Service", unit_price: "100.10" }],
    };
    await db.query("select save_estimate($1,$2,0,$3)", [
      company,
      estimate,
      JSON.stringify(input),
    ]);
    const legacy = await prepare("estimate", estimate, 1),
      legacyPdf = await renderCommercialPdf(legacy, true);
    assert.equal(legacy.snapshot.company.commercial, undefined);
    let first!: typeof legacy,
      second!: typeof legacy,
      invoiceDoc!: typeof legacy;
    await t.test(
      "confirmation, malformed direct input and stale versions cannot change identity or finance",
      async () => {
        const protectedRows = await finance();
        await as(owner);
        await assert.rejects(
          save(0, identity, false),
          /identity_confirmation_required/,
        );
        for (const invalid of [
          { ...identity, website: "https://user:password@example.test" },
          { ...identity, footer: "bad\u0000value" },
          { ...identity, unknown: "value" },
        ])
          await assert.rejects(
            save(0, invalid),
            /invalid_commercial_identity|unsupported Unicode escape/,
          );
        await save(0);
        await assert.rejects(
          save(0, { ...identity, legal_name: "Stale" }),
          /record_conflict/,
        );
        assert.equal(await finance(), protectedRows);
      },
    );
    await t.test(
      "read-only and commercial writers cannot impersonate a tenant or change protected identity",
      async () => {
        await db.exec("reset role");
        await db.query(
          "insert into memberships(company_id,user_id,email,role,permissions) values($1,$2,'staff@example.test','member','{\"fin-estimados\":[\"read\"]}')",
          [company, staff],
        );
        await as(staff);
        assert.equal(
          (
            await db.query(
              "select * from commercial_profiles where company_id=$1",
              [company],
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select * from commercial_profiles where company_id=$1",
              [foreign],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(save(1), /permission_denied/);
        await db.exec("reset role");
        await db.query(
          'update memberships set permissions=\'{"fin-estimados":["write"]}\' where company_id=$1 and user_id=$2',
          [company, staff],
        );
        await as(staff);
        await assert.rejects(save(1), /permission_denied/);
        await assert.rejects(
          save(1, identity, true, foreign),
          /permission_denied/,
        );
        await assert.rejects(
          db.query(
            "update commercial_profiles set identity='{}' where company_id=$1",
            [company],
          ),
          /permission denied/,
        );
        await db.exec("reset role");
        await db.query(
          "update memberships set active=false where company_id=$1 and user_id=$2",
          [company, staff],
        );
        await as(staff);
        assert.equal(
          (await db.query("select * from commercial_profiles")).rows.length,
          0,
        );
        await assert.rejects(save(1), /permission_denied/);
        await db.exec("reset role");
        await db.exec("set role anon");
        await assert.rejects(save(1), /permission denied/);
      },
    );
    await t.test(
      "old PDF stays exact; new revisions capture identity and later settings cannot replace it",
      async () => {
        await as(owner);
        assert.deepEqual(await prepare("estimate", estimate, 1), legacy);
        assert.deepEqual(await renderCommercialPdf(legacy, true), legacyPdf);
        await db.query("select save_estimate($1,$2,1,$3)", [
          company,
          estimate,
          JSON.stringify(input),
        ]);
        first = await prepare("estimate", estimate, 2);
        assert.equal(first.snapshot.company.commercial?.version, 1);
        assert.equal(
          first.snapshot.company.commercial?.legal_name,
          identity.legal_name,
        );
        const protectedRows = await finance();
        await as(owner);
        await save(1, {
          ...identity,
          legal_name: "QA Changed Later",
          email: "later@saasalldecor.invalid",
        });
        assert.equal(await finance(), protectedRows);
        await as(owner);
        assert.deepEqual(await prepare("estimate", estimate, 2), first);
        await db.query("select save_estimate($1,$2,2,$3)", [
          company,
          estimate,
          JSON.stringify(input),
        ]);
        second = await prepare("estimate", estimate, 3);
        assert.equal(second.snapshot.company.commercial?.version, 2);
        assert.equal(
          second.snapshot.company.commercial?.legal_name,
          "QA Changed Later",
        );
        const invoice = String(
          (
            await db.query<{ id: string }>(
              "select approve_estimate($1,$2,3,'2026-10-07','QA Project','Synthetic approval only') id",
              [company, estimate],
            )
          ).rows[0].id,
        );
        invoiceDoc = await prepare("invoice", invoice, 1);
        assert.equal(invoiceDoc.snapshot.record.total, 100.1);
        assert.equal(invoiceDoc.snapshot.record.paid_amount, 0);
        assert.equal(invoiceDoc.snapshot.record.balance_due, 100.1);
      },
    );
    await t.test(
      "both real PDF renderers and MIME bodies preserve captured fields with escaped HTML and exact money",
      async () => {
        const pdf = await renderCommercialPdf(first, true),
          invoicePdf = await renderCommercialPdf(invoiceDoc, true);
        const text = (await printedPages(pdf))
          .flat()
          .map((x) => x.text)
          .join("\n");
        const itext = (await printedPages(invoicePdf))
          .flat()
          .map((x) => x.text)
          .join("\n");
        for (const value of [
          "QA Empresa Peña & <b>",
          "office@saasalldecor.invalid",
          "QA acreditación ficticia",
          "Pie QA Peña & <script>",
          "100.10",
        ])
          assert.ok(text.includes(value), value);
        for (const value of [
          "QA Changed Later",
          "later@saasalldecor.invalid",
          "Cheque de prueba. No pagar.",
          "100.10",
        ])
          assert.ok(itext.includes(value), value);
        const estimateLines = (await printedPages(pdf))[0];
        const titleY = estimateLines.find((x) =>
          x.text.startsWith("Estimado EST-"),
        )!.y;
        const licenseY = estimateLines.find(
          (x) => x.text === identity.license,
        )!.y;
        assert.ok(
          licenseY - titleY >= 26,
          "Company contact must not overlap the estimate title",
        );
        assert.ok(!text.includes("OTHER TENANT QA"));
        assert.ok(!itext.includes("OTHER TENANT QA"));
        const mail = estimateEmailBody(first, true),
          imail = invoiceEmailBody(invoiceDoc, true);
        assert.match(mail.html, /QA Empresa Peña &amp; &lt;b&gt;/);
        assert.match(mail.html, /Pie QA Peña &amp; &lt;script&gt;/);
        assert.ok(!mail.html.includes("<script>"));
        assert.match(imail.html, /Cheque de prueba\. No pagar\./);
        assert.ok(!imail.html.includes("<script>"));
        assert.ok(mail.text.includes(identity.email));
        assert.ok(imail.text.includes("later@saasalldecor.invalid"));
        await mkdir(".local/closure-commercial-identity", { recursive: true });
        await writeFile(
          ".local/closure-commercial-identity/estimate-captured.pdf",
          pdf,
        );
        await writeFile(
          ".local/closure-commercial-identity/invoice-captured.pdf",
          invoicePdf,
        );
        await writeFile(
          ".local/closure-commercial-identity/estimate-legacy.pdf",
          legacyPdf,
        );
      },
    );
    await t.test(
      "long company header, contact and footer paginate without losing saved content or repeating amounts",
      async () => {
        const long = structuredClone(invoiceDoc);
        long.snapshot.company.commercial = {
          ...identity,
          version: 1,
          legal_name: "QA nombre comercial largo ".repeat(6).trim(),
          address: "QA Dirección extensa ".repeat(40),
          footer: "QA pie multilínea de la empresa.\n".repeat(50),
        };
        const bytes = await renderCommercialPdf(long, true),
          pages = await printedPages(bytes),
          text = pages
            .flat()
            .map((x) => x.text)
            .join("\n");
        assert.ok(pages.length > 1);
        assert.ok(text.includes("QA pie multilínea de la empresa."));
        assert.ok(text.includes("office@saasalldecor.invalid"));
        for (const line of pages.flat())
          assert.ok(line.y >= 20 && line.y <= 792, `${line.text} at ${line.y}`);
        assert.deepEqual(await renderCommercialPdf(long, true), bytes);
        await writeFile(
          ".local/closure-commercial-identity/invoice-long.pdf",
          bytes,
        );
      },
    );
  } finally {
    await db.close();
  }
});
