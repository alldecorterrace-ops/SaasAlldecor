import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { storedCommercialDocument } from "../src/lib/commercial-documents";
import { renderCommercialPdf } from "../src/lib/commercial-pdf";
import { generateCommercialDocument } from "../src/lib/commercial-document-service";
import { downloadCommercialDocument } from "../src/lib/commercial-document-download";
import { loadCustomerRecords } from "../src/lib/customer-records";
import type { Membership } from "../src/lib/modules";

test("commercial PDF generation preserves finance and isolates immutable revisions", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID(),
    customer = randomUUID(),
    separate = randomUUID(),
    est = randomUUID(),
    draft = randomUUID();
  let invoice = "",
    lostUpload = false,
    lostFinish = false,
    failUpload = false,
    uid: string = owner,
    renders = 0,
    uploads = 0;
  const files = new Map<string, Uint8Array>();
  const as = async (id: string) => {
    uid = id;
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
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
        if (name === "prepare_commercial_document")
          data = (
            await db.query<{ data: unknown }>(
              "select to_jsonb(public.prepare_commercial_document($1,$2,$3,$4)) data",
              [p.p_company, p.p_kind, p.p_record, p.p_version],
            )
          ).rows[0].data;
        else if (name === "finish_commercial_document") {
          data = (
            await db.query<{ data: unknown }>(
              "select public.finish_commercial_document($1,$2,$3,$4) data",
              [p.p_company, p.p_document, p.p_sha256, p.p_bytes],
            )
          ).rows[0].data;
          if (lostFinish) {
            lostFinish = false;
            throw new Error("response lost");
          }
        } else if (name === "customer_commercial_documents")
          data = (
            await db.query<{ data: unknown }>(
              "select public.customer_commercial_documents($1,$2,$3) data",
              [p.p_company, p.p_customer, p.p_page],
            )
          ).rows[0].data;
        else throw new Error(name);
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    from(table: string) {
      assert.ok(
        ["commercial_documents", "customers", "estimates", "invoices"].includes(
          table,
        ),
      );
      const conditions: string[] = [],
        values: unknown[] = [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          assert.ok(["company_id", "id", "state"].includes(col));
          values.push(val);
          conditions.push(`${col}=$${values.length}`);
          return q;
        },
        async maybeSingle() {
          try {
            const result = await db.query(
              `select * from public.${table} where ${conditions.join(" and ")}`,
              values,
            );
            return {
              data: result.rows[0]
                ? JSON.parse(JSON.stringify(result.rows[0]))
                : null,
              error: null,
            };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
      return q;
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "commercial-pdfs");
        return {
          upload: async (
            path: string,
            bytes: Uint8Array,
            opts: { upsert: boolean; contentType: string },
          ) => {
            uploads++;
            assert.equal(opts.upsert, false);
            assert.equal(opts.contentType, "application/pdf");
            try {
              if (failUpload) throw new Error("offline");
              await db.query(
                "insert into storage.objects(bucket_id,name) values($1,$2)",
                [bucket, path],
              );
              files.set(path, bytes);
              if (lostUpload) {
                lostUpload = false;
                throw new Error("response lost");
              }
              return { error: null };
            } catch (error) {
              return { error };
            }
          },
          download: async (path: string) => {
            const row = await db.query(
              "select name from storage.objects where bucket_id=$1 and name=$2",
              [bucket, path],
            );
            return row.rows.length && files.has(path)
              ? {
                  data: new Blob([Buffer.from(files.get(path)!)], {
                    type: "application/pdf",
                  }),
                  error: null,
                }
              : { data: null, error: new Error("missing") };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  const render = async (d: Parameters<typeof renderCommercialPdf>[0]) => {
    renders++;
    return renderCommercialPdf(d, true);
  };
  const generate = (
    kind: "estimate" | "invoice",
    record: string,
    version: number,
  ) =>
    generateCommercialDocument(service, company, kind, record, version, render);
  const list = async (cid = customer) =>
    (
      await db.query<{
        data: {
          count: number;
          rows: Array<{ id: string; kind: string; record_version: number }>;
        };
      }>("select public.customer_commercial_documents($1,$2,1) data", [
        company,
        cid,
      ])
    ).rows[0].data;
  const fingerprint = async () =>
    JSON.stringify(
      (
        await db.query(
          "select 'estimates' entity,md5(string_agg(to_jsonb(t)::text,'' order by id)) hash from public.estimates t union all select 'invoices',md5(string_agg(to_jsonb(t)::text,'' order by id)) from public.invoices t union all select 'payments',md5(string_agg(to_jsonb(t)::text,'' order by id)) from public.payments t union all select 'projects',md5(string_agg(to_jsonb(t)::text,'' order by id)) from public.projects t",
        )
      ).rows,
    );
  const input = {
    customer_id: customer,
    estimate_date: "2026-09-29",
    valid_until: null,
    status: "PENDIENTE",
    notes:
      "Notas con acentos: Peña, instalación y garantía. Sin envío externo.",
    discount: "0",
    taxes: "0",
    items: [
      {
        ...emptyItem,
        name: "Pérgola QA comercial",
        description: "Descripción sintética",
        unit_price: "100.25",
        qty: "2",
      },
    ],
  };
  try {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select public.create_company($1,'Empresa sintética Peña'),public.create_company($2,'Empresa B')",
      [company, foreign],
    );
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    for (const id of [customer, separate])
      await db.query("select public.save_customer($1,$2,0,$3)", [
        company,
        id,
        JSON.stringify({
          full_name: "Cliente Peña",
          email: "same@example.test",
          status: "active",
        }),
      ]);
    await db.query("select public.save_estimate($1,$2,0,$3)", [
      company,
      est,
      JSON.stringify(input),
    ]);
    await db.query("select public.save_estimate($1,$2,0,$3)", [
      company,
      draft,
      JSON.stringify({ ...input, status: "BORRADOR" }),
    ]);
    let first = "",
      latest = "";
    await t.test(
      "captured source, deterministic PDF, retry and financial fingerprints",
      async () => {
        const before = await fingerprint();
        first = await generate("estimate", est, 1);
        assert.equal(await fingerprint(), before);
        assert.equal(await generate("estimate", est, 1), first);
        assert.equal(renders, 1);
        assert.equal(uploads, 1);
        const raw = (
          await db.query(
            "select * from public.commercial_documents where id=$1",
            [first],
          )
        ).rows[0];
        const doc = storedCommercialDocument.parse(
            JSON.parse(JSON.stringify(raw)),
          ),
          bytes = files.get(`${company}/${first}.pdf`)!;
        assert.equal(doc.snapshot.record.total, 200.5);
        assert.equal(
          doc.snapshot.record.customer_snapshot.full_name,
          "Cliente Peña",
        );
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          doc.sha256,
        );
        assert.deepEqual(await renderCommercialPdf(doc, true), bytes);
        const pdf = await PDFDocument.load(bytes);
        assert.ok(pdf.getPageCount() >= 1);
        assert.match(pdf.getTitle() ?? "", /Estimado.*Revisión 1/);
        await mkdir(".local/closure-20260929", { recursive: true });
        await writeFile(
          ".local/closure-20260929/commercial-pdf-synthetic.pdf",
          bytes,
        );
        assert.equal((await list()).count, 1);
        assert.equal((await list(separate)).count, 0);
        await assert.rejects(() => generate("estimate", draft, 1));
      },
    );
    await t.test(
      "later revisions retain old bytes; lost upload and finalize replies recover once",
      async () => {
        const original = files.get(`${company}/${first}.pdf`);
        await db.query("select public.save_estimate($1,$2,1,$3)", [
          company,
          est,
          JSON.stringify({ ...input, notes: "Nueva revisión QA" }),
        ]);
        await assert.rejects(() => generate("estimate", est, 1));
        lostUpload = true;
        lostFinish = true;
        const before = await fingerprint();
        await assert.rejects(() => generate("estimate", est, 2));
        latest = await generate("estimate", est, 2);
        assert.equal(await fingerprint(), before);
        assert.equal(renders, 2);
        assert.equal(uploads, 2);
        assert.equal((await list()).rows[0].id, latest);
        assert.notEqual(first, latest);
        assert.deepEqual(files.get(`${company}/${first}.pdf`), original);
        await assert.rejects(() =>
          db.query(
            "update public.commercial_documents set number=$1 where id=$2",
            ["FORGED", first],
          ),
        );
        await assert.rejects(() =>
          db.query("delete from public.commercial_documents where id=$1", [
            first,
          ]),
        );
        assert.equal(
          (
            await db.query(
              "update storage.objects set name=$1 where name=$2 returning id",
              ["changed", `${company}/${first}.pdf`],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(() =>
          db.query("select public.finish_commercial_document($1,$2,$3,10)", [
            company,
            first,
            "0".repeat(64),
          ]),
        );
      },
    );
    await t.test(
      "invoice snapshot and authenticated download are byte exact; damage fails closed",
      async () => {
        await db.query(
          "select public.approve_estimate($1,$2,2,'2026-09-29','Proyecto QA','Aprobación sintética')",
          [company, est],
        );
        invoice = String(
          (
            await db.query<{ id: string }>(
              "select id from public.invoices where estimate_id=$1",
              [est],
            )
          ).rows[0].id,
        );
        const before = await fingerprint();
        const inv = await generate("invoice", invoice, 1);
        assert.equal(await fingerprint(), before);
        assert.equal((await list()).count, 2);
        const response = await downloadCommercialDocument(
          service,
          company,
          inv,
          customer,
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control") ?? "", /no-store/);
        assert.deepEqual(
          Buffer.from(await response.arrayBuffer()),
          Buffer.from(files.get(`${company}/${inv}.pdf`)!),
        );
        assert.equal(
          (await downloadCommercialDocument(service, company, inv, separate))
            .status,
          404,
        );
        assert.equal(
          (await downloadCommercialDocument(service, foreign, inv)).status,
          404,
        );
        const saved = files.get(`${company}/${inv}.pdf`)!;
        files.set(`${company}/${inv}.pdf`, new Uint8Array(saved.length));
        assert.equal(
          (await downloadCommercialDocument(service, company, inv)).status,
          503,
        );
        files.set(`${company}/${inv}.pdf`, saved);
        await writeFile(
          ".local/closure-20260929/commercial-invoice-synthetic.pdf",
          saved,
        );
        await db.query(
          "select public.update_invoice($1,$2,1,'2026-09-29',null,'QA','Anulación de prueba')",
          [company, invoice],
        );
        assert.equal((await list()).count, 1);
        assert.equal(
          (await downloadCommercialDocument(service, company, inv, customer))
            .status,
          404,
        );
        assert.equal(
          (await downloadCommercialDocument(service, company, inv)).status,
          200,
        );
        const voidBefore = await fingerprint();
        const voidPdf = await generate("invoice", invoice, 2);
        assert.notEqual(voidPdf, inv);
        assert.equal(await fingerprint(), voidBefore);
        assert.deepEqual(files.get(`${company}/${inv}.pdf`), saved);
      },
    );
    await t.test(
      "module revocation, restricted dossier, no membership and anonymous rejection",
      async () => {
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [
            company,
            staff,
            JSON.stringify({ clientes: ["read"], "fin-estimados": ["read"] }),
          ],
        );
        await as(staff);
        assert.equal((await list()).count, 1);
        assert.equal(
          (await downloadCommercialDocument(service, company, first, customer))
            .status,
          200,
        );
        await assert.rejects(() => generate("estimate", est, 3));
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [company, staff, JSON.stringify({ clientes: ["read"] })],
        );
        await as(staff);
        assert.equal(
          (await downloadCommercialDocument(service, company, first)).status,
          404,
        );
        await assert.rejects(() => list());
        const member: Membership = {
          company_id: company,
          user_id: staff,
          email: "staff@example.test",
          role: "member",
          active: true,
          permissions: { clientes: ["read"], "fin-estimados": ["read"] },
        };
        await assert.rejects(() =>
          loadCustomerRecords(
            service,
            member,
            company,
            customer,
            "comerciales",
          ),
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [company, staff],
        );
        await as(staff);
        await assert.rejects(() => list());
        uid = "";
        assert.equal(
          (await downloadCommercialDocument(service, company, first)).status,
          401,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(() =>
          db.query("select * from public.commercial_documents"),
        );
        await as(owner);
      },
    );
    await t.test(
      "failed upload stays pending and retries without duplicate document or financial effect",
      async () => {
        const eid = randomUUID();
        await db.query("select public.save_estimate($1,$2,0,$3)", [
          company,
          eid,
          JSON.stringify(input),
        ]);
        const before = await fingerprint();
        failUpload = true;
        await assert.rejects(() => generate("estimate", eid, 1));
        const pending = (
          await db.query<{ id: string; state: string }>(
            "select id,state from public.commercial_documents where record_id=$1",
            [eid],
          )
        ).rows[0];
        assert.equal(pending.state, "pending");
        failUpload = false;
        assert.equal(await generate("estimate", eid, 1), pending.id);
        assert.equal(await fingerprint(), before);
      },
    );
    await t.test(
      "long PDF wraps and paginates; missing glyphs cannot produce silent substitutions",
      async () => {
        const raw = (
          await db.query(
            "select * from public.commercial_documents where id=$1",
            [first],
          )
        ).rows[0];
        const d = storedCommercialDocument.parse(
          JSON.parse(JSON.stringify(raw)),
        );
        d.snapshot.record.items = Array.from({ length: 50 }, (_, i) => ({
          ...d.snapshot.record.items[0],
          name: `Partida ${i + 1} ${"Descripción larga ".repeat(9)}`,
          description: "Nota extensa con acentos y cifras 200.50. ".repeat(20),
        }));
        const bytes = await renderCommercialPdf(d, true);
        const parsed = await PDFDocument.load(bytes);
        assert.ok(parsed.getPageCount() > 5);
        assert.ok(parsed.getPageCount() < 100);
        await writeFile(
          ".local/closure-20260929/commercial-long-synthetic.pdf",
          bytes,
        );
        d.snapshot.record.notes = "No sustituir: 🦄";
        await assert.rejects(
          () => renderCommercialPdf(d, true),
          /unsupported_document_character/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
