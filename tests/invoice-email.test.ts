import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { renderCommercialPdf } from "../src/lib/commercial-pdf";
import { storedCommercialDocument } from "../src/lib/commercial-documents";
import { printedPages } from "./helpers/pdf-printed-pages";
import {
  invoiceEmailConfig,
  composeInvoiceMail,
  deliverInvoiceEmail,
  sendInvoiceMail,
  type InvoiceEmailConfig,
  type InvoiceEmailAttempt,
} from "../src/lib/invoice-email";
import { downloadInvoiceEmailCapture } from "../src/lib/invoice-email-download";

const company = randomUUID();
const stageEnv = {
  APP_ENVIRONMENT: "staging",
  STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
  NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
  NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
};
const config: InvoiceEmailConfig = {
  mode: "capture",
  from: "notice@saasalldecor.invalid",
  site: stageEnv.NEXT_PUBLIC_SITE_URL,
};
test("invoice email is opt-in per production tenant and staging cannot enable delivery", () => {
  assert.equal(invoiceEmailConfig({}, company), null);
  assert.deepEqual(invoiceEmailConfig(stageEnv, company), config);
  const prod = {
    APP_ENVIRONMENT: "production",
    NEXT_PUBLIC_SITE_URL: "https://app.example.test",
    INVOICE_MAIL_ENABLED: "true",
    INVOICE_MAIL_COMPANY_IDS: company,
    MAIL_FROM_ADDRESS: "notice@example.test",
  };
  assert.equal(invoiceEmailConfig(prod, company)?.mode, "send");
  for (const patch of [
    { INVOICE_MAIL_ENABLED: "false" },
    { INVOICE_MAIL_COMPANY_IDS: "" },
    { INVOICE_MAIL_COMPANY_IDS: randomUUID() },
    { INVOICE_MAIL_COMPANY_IDS: `${company},bad` },
    { MAIL_FROM_ADDRESS: "-flag@example.test" },
    { MAIL_FROM_ADDRESS: "safe@example.test\r\nBcc: leaked@example.test" },
    { NEXT_PUBLIC_SITE_URL: "https://secret@app.example.test" },
    { NEXT_PUBLIC_SITE_URL: "http://app.example.test" },
  ])
    assert.equal(invoiceEmailConfig({ ...prod, ...patch }, company), null);
  assert.equal(
    invoiceEmailConfig({ ...stageEnv, INVOICE_MAIL_ENABLED: "true" }, company),
    null,
  );
});

test("invoice email keeps one immutable PDF attachment, private capture and durable no-resend outcomes", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    foreign = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID();
  let uid: string = owner;
  let loseClaim = false,
    loseFinish = false,
    loseUpload = false,
    failUpload = false,
    deliveries = 0;
  const files = new Map<string, Uint8Array>();
  const as = async (id: string, role = "authenticated") => {
    uid = id;
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  };
  const service = {
    auth: {
      getUser: async () => ({
        data: { user: uid ? { id: uid } : null },
        error: null,
      }),
    },
    rpc: async (name: string, p: Record<string, unknown>) => {
      try {
        let data: unknown;
        if (name === "claim_invoice_email") {
          data = (
            await db.query<{ data: unknown }>(
              "select claim_invoice_email($1,$2,$3,$4,$5,$6,$7) data",
              [
                p.p_company,
                p.p_invoice,
                p.p_version,
                p.p_document,
                p.p_request,
                p.p_mode,
                p.p_expected_recipient,
              ],
            )
          ).rows[0].data;
          if (loseClaim) {
            loseClaim = false;
            throw new Error("lost claim response");
          }
        } else if (name === "finish_invoice_email") {
          data = (
            await db.query<{ data: unknown }>(
              "select to_jsonb(finish_invoice_email($1,$2,$3,$4,$5)) data",
              [p.p_company, p.p_attempt, p.p_status, p.p_sha256, p.p_bytes],
            )
          ).rows[0].data;
          if (loseFinish) {
            loseFinish = false;
            throw new Error("lost finish response");
          }
        } else throw new Error("unexpected_rpc");
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: String((e as Error).message) } };
      }
    },
    from(table: string) {
      assert.equal(table, "invoice_email_attempts");
      const conditions: string[] = [],
        values: unknown[] = [];
      const q = {
        select: () => q,
        eq(col: string, val: unknown) {
          assert(["company_id", "id", "status"].includes(col));
          values.push(val);
          conditions.push(`${col}=$${values.length}`);
          return q;
        },
        async maybeSingle() {
          try {
            const row = (
              await db.query<{ data: unknown }>(
                `select to_jsonb(a) data from invoice_email_attempts a where ${conditions.join(" and ")}`,
                values,
              )
            ).rows[0];
            return { data: row?.data ?? null, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
      return q;
    },
    storage: {
      from(bucket: string) {
        assert(["commercial-pdfs", "invoice-email-captures"].includes(bucket));
        return {
          async upload(
            path: string,
            bytes: Uint8Array,
            options: { contentType: string; upsert: boolean },
          ) {
            assert.equal(options.upsert, false);
            assert.equal(options.contentType, "message/rfc822");
            try {
              if (failUpload) throw new Error("offline");
              await db.query(
                "insert into storage.objects(bucket_id,name) values($1,$2)",
                [bucket, path],
              );
              files.set(`${bucket}:${path}`, bytes);
              if (loseUpload) {
                loseUpload = false;
                throw new Error("lost upload response");
              }
              return { error: null };
            } catch (error) {
              return { error };
            }
          },
          async download(path: string) {
            const rows = (
              await db.query(
                "select name from storage.objects where bucket_id=$1 and name=$2",
                [bucket, path],
              )
            ).rows;
            const bytes = files.get(`${bucket}:${path}`);
            return rows.length && bytes
              ? { data: new Blob([Buffer.from(bytes)]), error: null }
              : { data: null, error: new Error("unavailable") };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  const fingerprint = async () =>
    JSON.stringify(
      (
        await db.query(
          "select (select jsonb_agg(to_jsonb(i) order by id) from invoices i) invoices,(select jsonb_agg(to_jsonb(p) order by id) from payments p) payments,(select jsonb_agg(to_jsonb(p) order by id) from projects p) projects",
        )
      ).rows,
    );
  const prepare = async (invoice: string, version: number) => {
    const doc = storedCommercialDocument.parse(
      (
        await db.query<{ data: unknown }>(
          "select to_jsonb(prepare_commercial_document($1,'invoice',$2,$3)) data",
          [company, invoice, version],
        )
      ).rows[0].data,
    );
    const bytes = await renderCommercialPdf(doc, true),
      sha = createHash("sha256").update(bytes).digest("hex");
    if (doc.state === "pending") {
      await db.query(
        "insert into storage.objects(bucket_id,name) values('commercial-pdfs',$1)",
        [`${company}/${doc.id}.pdf`],
      );
      files.set(`commercial-pdfs:${company}/${doc.id}.pdf`, bytes);
      await db.query("select finish_commercial_document($1,$2,$3,$4)", [
        company,
        doc.id,
        sha,
        bytes.length,
      ]);
    }
    return storedCommercialDocument.parse(
      (
        await db.query<{ data: unknown }>(
          "select to_jsonb(d) data from commercial_documents d where id=$1",
          [doc.id],
        )
      ).rows[0].data,
    );
  };
  let invoice = "",
    doc: Awaited<ReturnType<typeof prepare>>,
    initialRequest = "",
    capturedId = "";
  const send = async () => {
    deliveries++;
    return "queued" as const;
  };
  const deliver = (
    request: string = randomUUID(),
    options = config,
    version = 2,
    document = doc.id,
    expectedRecipient: string | null = null,
  ) =>
    deliverInvoiceEmail(
      service,
      company,
      invoice,
      version,
      document,
      request,
      options,
      send,
      expectedRecipient,
    );
  const attempts = async () =>
    (
      await db.query<{ data: InvoiceEmailAttempt }>(
        "select to_jsonb(a) data from invoice_email_attempts a order by created_at,id",
      )
    ).rows.map((r) => r.data);
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select create_company($1,'Empresa sintética Peña'),create_company($2,'Another company')",
      [company, foreign],
    );
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "Cliente sintético Peña",
        email: "invoice-qa@saasalldecor.invalid",
        status: "active",
      }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
      company,
      estimate,
      JSON.stringify({
        customer_id: customer,
        estimate_date: "2026-10-02",
        valid_until: null,
        status: "PENDIENTE",
        notes: "Solo prueba sintética",
        discount: "0",
        taxes: "0",
        items: [
          {
            ...emptyItem,
            name: "Servicio sintético Peña",
            unit_price: "100.10",
          },
        ],
        commercial_terms: {
          percentages: ["10", "50", "30", "10"],
          delivery_date: null,
          conditions: "Condición de prueba",
        },
      }),
    ]);
    invoice = (
      await db.query<{ id: string }>(
        "select approve_estimate($1,$2,1,'2026-10-02','QA project','Synthetic approval') id",
        [company, estimate],
      )
    ).rows[0].id;
    await db.query("select record_payment($1,$2,$3,1,$4)", [
      company,
      randomUUID(),
      invoice,
      JSON.stringify({
        amount: "25.10",
        payment_date: "2026-10-02",
        method: "ZELLE",
        reference: "QA-EMAIL-Peña",
        notes: "Sin dinero real",
      }),
    ]);
    doc = await prepare(invoice, 2);
    await t.test(
      "capture and lost upload/finalization responses preserve the attached bytes and finance",
      async () => {
        initialRequest = randomUUID();
        const before = await fingerprint();
        loseUpload = true;
        loseFinish = true;
        const uncertain = await deliver(initialRequest);
        assert.equal(uncertain.status, "unknown");
        const result = await deliver(initialRequest);
        assert.equal(result.status, "captured");
        capturedId = result.attemptId!;
        assert.equal((await attempts()).length, 1);
        assert.equal(deliveries, 0);
        assert.equal(await fingerprint(), before);
        const response = await downloadInvoiceEmailCapture(
          service,
          company,
          capturedId,
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control")!, /no-store/);
        const message = Buffer.from(await response.arrayBuffer());
        assert.match(message.toString(), /Content-Type: multipart\/mixed/);
        assert.match(message.toString(), /Content-Type: application\/pdf/);
        assert.match(message.toString(), /Content-Disposition: attachment/);
        assert.doesNotMatch(
          message.toString(),
          /^Bcc:|access_token|token_hash/im,
        );
        await mkdir(".local/closure-invoice-email", { recursive: true });
        await writeFile(".local/closure-invoice-email/invoice.eml", message);
        await writeFile(
          ".local/closure-invoice-email/invoice.pdf",
          files.get(`commercial-pdfs:${company}/${doc.id}.pdf`)!,
        );
        const pages = await printedPages(
          files.get(`commercial-pdfs:${company}/${doc.id}.pdf`)!,
        );
        assert.ok(
          pages.length <= 2,
          "calendar uses at most one continuation page",
        );
        const schedulePages = [
          "Depósito al aceptar",
          "Al agendar inicio",
          "Al 80% de avance",
          "Al finalizar",
        ].map((label) =>
          pages.findIndex((p) => p.some((v) => v.text === label)),
        );
        assert.ok(
          schedulePages.every((n) => n >= 0 && n === schedulePages[0]),
          "all four payment stages stay together",
        );
        const ordinary = structuredClone(doc);
        delete ordinary.snapshot.record.commercial_terms;
        assert.equal(
          (await printedPages(await renderCommercialPdf(ordinary, true)))
            .length,
          1,
          "ordinary invoice fits on one page",
        );
        const text = pages
          .flat()
          .map((v) => v.text)
          .join("\n");
        assert.match(text, /Peña/);
        assert.match(text, /Total de pagos aplicados al generar: \$25.10/);
      },
    );
    await t.test(
      "PDF damage, envelope injection and mode mismatches fail before handoff",
      async () => {
        const a = (await attempts())[0],
          bytes = files.get(`commercial-pdfs:${company}/${doc.id}.pdf`)!;
        for (const recipient of [
          "-flag@example.test",
          "one@example.test,two@example.test",
          "safe@example.test\r\nBcc: stolen@example.test",
          "real@example.test",
        ])
          await assert.rejects(
            composeInvoiceMail(
              config,
              { ...a, status: "processing", finished_at: null, recipient },
              doc,
              bytes,
            ),
          );
        await assert.rejects(
          composeInvoiceMail(
            config,
            { ...a, status: "processing", finished_at: null, mode: "send" },
            doc,
            bytes,
          ),
        );
        await assert.rejects(
          sendInvoiceMail(config, {
            message: Buffer.from("test"),
            from: config.from,
            to: a.recipient,
          }),
          /external_email_disabled/,
        );
        files.set(
          `commercial-pdfs:${company}/${doc.id}.pdf`,
          new Uint8Array(bytes.length),
        );
        const result = await deliver();
        assert.equal(result.status, "failed");
        assert.equal(deliveries, 0);
        files.set(`commercial-pdfs:${company}/${doc.id}.pdf`, bytes);
      },
    );
    await t.test(
      "lost claim response cannot cause an automatic send or a second attempt",
      async () => {
        const request = randomUUID(),
          before = (await attempts()).length;
        loseClaim = true;
        assert.ok((await deliver(request)).error);
        const repeated = await deliver(request);
        assert.equal(repeated.status, "processing");
        assert.equal((await attempts()).length, before + 1);
        assert.equal(deliveries, 0);
      },
    );
    await t.test(
      "capture storage failure is recorded without a send or automatic retry",
      async () => {
        const request = randomUUID(),
          before = await fingerprint();
        failUpload = true;
        const result = await deliver(request);
        failUpload = false;
        assert.equal(result.status, "failed");
        assert.equal((await deliver(request)).status, "failed");
        assert.equal(deliveries, 0);
        assert.equal(await fingerprint(), before);
      },
    );
    await t.test(
      "accepted and uncertain real handoffs are never repeated by the same request",
      async () => {
        const options: InvoiceEmailConfig = {
            ...config,
            mode: "send",
            from: "notice@example.test",
          },
          request = randomUUID();
        assert.equal((await deliver(request, options)).status, "queued");
        assert.equal((await deliver(request, options)).status, "queued");
        assert.equal(deliveries, 1);
        const uncertainRequest = randomUUID();
        let called = 0;
        const uncertain = () =>
          deliverInvoiceEmail(
            service,
            company,
            invoice,
            2,
            doc.id,
            uncertainRequest,
            options,
            async () => {
              called++;
              throw new Error("MTA outcome uncertain");
            },
          );
        assert.equal((await uncertain()).status, "unknown");
        assert.equal((await uncertain()).status, "unknown");
        assert.equal(called, 1);
        const a = (await attempts()).find((v) => v.request_id === request)!;
        await assert.rejects(
          db.query("select finish_invoice_email($1,$2,'failed')", [
            company,
            a.id,
          ]),
          /immutable_mail_outcome/,
        );
      },
    );
    await t.test(
      "reader, revoked member, anonymous and other company cannot claim or download a capture",
      async () => {
        assert.equal(
          (await downloadInvoiceEmailCapture(service, foreign, capturedId))
            .status,
          404,
        );
        const before = (await attempts()).length;
        await assert.rejects(
          db.query("select claim_invoice_email($1,$2,1,$3,$4,'capture')", [
            foreign,
            invoice,
            doc.id,
            randomUUID(),
          ]),
          /invoice_unavailable/,
        );
        await db.query("select add_company_member($1,'staff@example.test')", [
          company,
        ]);
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          company,
          staff,
          JSON.stringify({ "fin-invoices": ["read"] }),
        ]);
        await as(staff);
        assert.ok((await deliver()).error);
        assert.equal(
          (await downloadInvoiceEmailCapture(service, company, capturedId))
            .status,
          200,
        );
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',false,'{}')", [
          company,
          staff,
        ]);
        await as(staff);
        assert.ok((await deliver()).error);
        assert.equal(
          (await downloadInvoiceEmailCapture(service, company, capturedId))
            .status,
          404,
        );
        await as("", "anon");
        assert.equal(
          (await downloadInvoiceEmailCapture(service, company, capturedId))
            .status,
          401,
        );
        assert.ok((await deliver()).error);
        await as(owner);
        assert.equal((await attempts()).length, before);
      },
    );
    await t.test(
      "annulled invoice keeps cached paid/balance, excludes associated payments and preserves earlier files",
      async () => {
        const old = files.get(`commercial-pdfs:${company}/${doc.id}.pdf`)!;
        await db.query(
          "select update_invoice($1,$2,2,'2026-10-02',null,'','QA annul')",
          [company, invoice],
        );
        const before = await fingerprint();
        const voidDoc = await prepare(invoice, 3);
        assert.equal(voidDoc.snapshot.record.paid_amount, 25.1);
        assert.equal(voidDoc.snapshot.record.balance_due, 75);
        assert.deepEqual(voidDoc.snapshot.record.payments, []);
        assert.equal(await fingerprint(), before);
        const result = await deliver(randomUUID(), config, 3, voidDoc.id);
        assert.equal(result.status, "captured");
        assert.equal(await fingerprint(), before);
        assert.deepEqual(
          files.get(`commercial-pdfs:${company}/${doc.id}.pdf`),
          old,
        );
        const text = (
          await printedPages(
            files.get(`commercial-pdfs:${company}/${voidDoc.id}.pdf`)!,
          )
        )
          .flat()
          .map((v) => v.text)
          .join("\n");
        assert.match(text, /Total de pagos aplicados al generar: \$0.00/);
        assert.doesNotMatch(text, /QA-EMAIL-Peña/);
        assert.match(text, /\$75.00/);
        await writeFile(
          ".local/closure-invoice-email/invoice-void.pdf",
          files.get(`commercial-pdfs:${company}/${voidDoc.id}.pdf`)!,
        );
        assert.equal(
          (await deliver(initialRequest, config)).status,
          "captured",
          "retry still returns old receipt after invoice changes",
        );
        assert.ok(
          (await deliver()).error,
          "a new request at a stale revision fails",
        );
      },
    );
    await t.test(
      "capture validates the current customer address and requires a synthetic recipient",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update customers set email='real@example.test' where id=$1",
          [customer],
        );
        await as(owner);
        const before = (await attempts()).length;
        assert.ok(
          (
            await deliver(
              randomUUID(),
              config,
              3,
              (await prepare(invoice, 3)).id,
            )
          ).error,
        );
        assert.equal((await attempts()).length, before);
        await db.exec("reset role");
        await db.query(
          "update customers set email=E'one@example.test\\nBcc: leak@example.test' where id=$1",
          [customer],
        );
        await as(owner);
        assert.ok(
          (
            await deliver(
              randomUUID(),
              { ...config, mode: "send" },
              3,
              (await prepare(invoice, 3)).id,
            )
          ).error,
        );
        assert.equal((await attempts()).length, before);
      },
    );
    await t.test(
      "private captures are immutable and corrupted bytes fail closed",
      async () => {
        const path = `invoice-email-captures:${company}/${capturedId}.eml`,
          original = files.get(path)!;
        files.set(path, new Uint8Array(original.length));
        assert.equal(
          (await downloadInvoiceEmailCapture(service, company, capturedId))
            .status,
          503,
        );
        files.set(path, original);
        await assert.rejects(
          db.query(
            "update invoice_email_attempts set recipient='evil@example.test' where id=$1",
            [capturedId],
          ),
          /permission denied/,
        );
        assert.equal(
          (
            await db.query(
              "update storage.objects set name='changed.eml' where bucket_id='invoice-email-captures' returning name",
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "delete from storage.objects where bucket_id='invoice-email-captures' returning name",
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "displayed recipient must still match the customer's current email",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update customers set email='new-invoice@saasalldecor.invalid' where id=$1",
          [customer],
        );
        await as(owner);
        const current = (
          await db.query<{ email: string }>(
            "select invoice_email_recipient($1,$2) email",
            [company, invoice],
          )
        ).rows[0].email;
        assert.equal(current, "new-invoice@saasalldecor.invalid");
        const currentDoc = await prepare(invoice, 3),
          before = (await attempts()).length;
        const stale = await deliver(
          randomUUID(),
          config,
          3,
          currentDoc.id,
          "invoice-qa@saasalldecor.invalid",
        );
        assert.match(stale.error!, /correo del cliente cambió/);
        assert.equal((await attempts()).length, before);
        const result = await deliver(
          randomUUID(),
          config,
          3,
          currentDoc.id,
          current,
        );
        assert.equal(result.status, "captured");
        assert.equal(
          (await attempts()).find((a) => a.id === result.attemptId)?.recipient,
          current,
        );
        assert.equal(
          (
            await db.query<{ email: string | null }>(
              "select invoice_email_recipient($1,$2) email",
              [foreign, invoice],
            )
          ).rows[0].email,
          null,
        );
      },
    );
  } finally {
    await db.close();
  }
});
