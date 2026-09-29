import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { loadCustomerRecords } from "../src/lib/customer-records";
import { CustomerRecords } from "../src/components/customer-records";
import {
  customerDocument,
  type CustomerDocumentClient,
} from "../src/lib/customer-document";
import type { Membership } from "../src/lib/modules";

test("customer permits and private files use current relationships and module RLS", async (t) => {
  const { db } = await fullDatabase();
  const owner = id(),
    staff = id(),
    company = id(),
    foreign = id(),
    client = id(),
    separate = id(),
    other = id();
  const member: Membership = {
    company_id: company,
    user_id: owner,
    email: "owner@example.test",
    role: "owner",
    active: true,
    permissions: {},
  };
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const api = {
    from() {
      throw new Error("No broad table query");
    },
    async rpc(name: string, p: Record<string, unknown>) {
      assert.equal(name, "customer_permits");
      try {
        return {
          data: (
            await db.query<{ data: unknown }>(
              "select public.customer_permits($1,$2,$3,$4) data",
              [p.p_company, p.p_customer, p.p_section, p.p_page],
            )
          ).rows[0].data,
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    },
  } as unknown as Pick<SupabaseClient, "from" | "rpc">;
  const get = (
    section = "permisos",
    page = "1",
    customer = client,
    m = member,
  ) => loadCustomerRecords(api, m, company, customer, section, page);
  const raw = (customer = client, cid = company) =>
    db.query("select public.customer_permits($1,$2,'documentos',1)", [
      cid,
      customer,
    ]);
  const file = (attachment: string, customer = client, cid = company) =>
    db.query("select * from public.customer_permit_file($1,$2,$3)", [
      cid,
      customer,
      attachment,
    ]);
  const record = async (rid: string) =>
    (
      await db.query<{
        version: number;
        name: string;
        status: string;
        project_id: string;
        data: Record<string, string>;
      }>("select * from public.work_records where id=$1", [rid])
    ).rows[0];
  const save = async (
    cid: string,
    rid: string,
    project: string,
    version = 0,
    status = "PENDIENTE",
  ) =>
    db.query("select public.save_work_record($1,$2,$3,'permits',$4)", [
      cid,
      rid,
      version,
      JSON.stringify({
        name: "Permiso <QA>",
        status,
        project_id: project,
        worker_id: null,
        data: {
          authority: "Ciudad <QA>",
          permit_number: "QA-2026",
          fee: "12.34",
          submitted_date: "2026-09-29",
          approved_date: "",
          expiration_date: "",
          notes: "PRIVATE_PERMIT_NOTE",
        },
      }),
    ]);
  const grant = async (permissions: Record<string, string[]>) => {
    await as(owner);
    await db.query("select public.set_member_access($1,$2,'member',true,$3)", [
      company,
      staff,
      JSON.stringify(permissions),
    ]);
    await as(staff);
    return { ...member, user_id: staff, role: "member" as const, permissions };
  };
  const permissions = {
    clientes: ["read"],
    "fin-proyectos": ["read"],
    permisos: ["read"],
  };
  const projects: string[] = [],
    permits: string[] = [],
    files: string[] = [];
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select public.create_company($1,'QA operations A'),public.create_company($2,'QA operations B')",
      [company, foreign],
    );
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    for (const [cid, cust] of [
      [company, client],
      [company, separate],
      [foreign, other],
    ]) {
      await db.query("select public.save_customer($1,$2,0,$3)", [
        cid,
        cust,
        JSON.stringify({
          full_name: "Separate client",
          email: "same@example.test",
          status: "active",
        }),
      ]);
      const estimate = id();
      await db.query("select public.save_estimate($1,$2,0,$3)", [
        cid,
        estimate,
        JSON.stringify({
          customer_id: cust,
          estimate_date: "2026-09-29",
          valid_until: null,
          status: "BORRADOR",
          notes: "QA",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "QA", unit_price: "100" }],
        }),
      ]);
      await db.query(
        "select public.approve_estimate($1,$2,1,'2026-09-29','QA Project','Synthetic only')",
        [cid, estimate],
      );
      projects.push(
        (
          await db.query<{ project_id: string }>(
            "select project_id from public.invoices where estimate_id=$1",
            [estimate],
          )
        ).rows[0].project_id,
      );
    }
    for (let n = 0; n < 25; n++) {
      const rid = id(),
        fid = id(),
        cid = n === 24 ? foreign : company,
        project = projects[n === 24 ? 2 : n === 23 ? 1 : 0];
      permits.push(rid);
      files.push(fid);
      await save(cid, rid, project);
      const path = `${cid}/${rid}/${fid}.pdf`;
      await db.query(
        "insert into storage.objects(bucket_id,name) values('work-files',$1)",
        [path],
      );
      await db.query(
        "select public.set_work_attachment($1,$2,1,$3,$4,'QA <archivo>.pdf',true)",
        [cid, rid, fid, path],
      );
    }
    await t.test(
      "paged dossier excludes other identities and exposes only permitted metadata",
      async () => {
        const result = await get(),
          docs = await get("documentos");
        assert.equal(result.count, 23);
        assert.equal(result.permits!.rows.length, 20);
        assert.equal(docs.count, 23);
        assert.ok(
          result.permits!.rows.every(
            (r) => r.kind === "permit" && r.documents === 1,
          ),
        );
        assert.ok(
          docs.permits!.rows.every(
            (r) => r.kind === "document" && r.project_id === projects[0],
          ),
        );
        assert.doesNotMatch(
          JSON.stringify(result.permits),
          /PRIVATE_PERMIT_NOTE|"(?:fee|receipt|path|token)"\s*:/,
        );
        const next = await get("documentos", "2");
        assert.equal(next.permits!.rows.length, 3);
        assert.ok(
          next.permits!.rows.every(
            (r) => !docs.permits!.rows.some((a) => a.id === r.id),
          ),
        );
        assert.equal((await get("permisos", "999")).page, 2);
        const html = renderToStaticMarkup(
          createElement(CustomerRecords, {
            companyId: company,
            customerId: client,
            records: docs,
          }),
        );
        assert.match(html, /QA &lt;archivo&gt;.pdf/);
        assert.match(html, /Abrir documento/);
        assert.match(html, /\/api\/customers\//);
        assert.doesNotMatch(html, /storage\/|signedUrl|<archivo>/);
      },
    );
    await t.test(
      "file resolution rechecks archived, voided and reassigned records",
      async () => {
        assert.equal((await file(files[0])).rows.length, 1);
        assert.equal((await file(files[23])).rows.length, 0);
        assert.equal((await file(files[24])).rows.length, 0);
        const a = await record(permits[0]);
        await db.query(
          "select public.set_work_attachment($1,$2,$3,$4,$5,'QA <archivo>.pdf',false)",
          [
            company,
            permits[0],
            a.version,
            files[0],
            `${company}/${permits[0]}/${files[0]}.pdf`,
          ],
        );
        assert.equal((await file(files[0])).rows.length, 0);
        assert.equal((await get("documentos")).count, 22);
        const b = await record(permits[1]);
        await save(company, permits[1], projects[0], b.version, "ANULADO");
        assert.equal((await file(files[1])).rows.length, 0);
        assert.equal((await get()).count, 22);
        const c = await record(permits[2]);
        await save(company, permits[2], projects[1], c.version);
        assert.equal((await file(files[2])).rows.length, 0);
        assert.equal((await file(files[2], separate)).rows.length, 1);
        assert.equal((await get()).count, 21);
      },
    );
    await t.test(
      "each permission, membership and tenant boundary fail closed",
      async () => {
        for (const omitted of ["clientes", "fin-proyectos", "permisos"]) {
          await grant(
            Object.fromEntries(
              Object.entries(permissions).filter(([k]) => k !== omitted),
            ),
          );
          await assert.rejects(raw(), /permission_denied/);
          await assert.rejects(file(files[3]), /permission_denied/);
        }
        const m = await grant(permissions);
        assert.equal((await get("permisos", "1", client, m)).count, 21);
        await assert.rejects(raw(other, foreign), /permission_denied/);
        await assert.rejects(raw(other), /permission_denied/);
        const stale = m;
        await grant({ clientes: ["read"], "fin-proyectos": ["read"] });
        await assert.rejects(
          get("documentos", "1", client, stale),
          /No se pudieron/,
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,$3)",
          [company, staff, JSON.stringify(permissions)],
        );
        await as(staff);
        await assert.rejects(file(files[3]), /permission_denied/);
        await db.exec("reset role;set role anon");
        await assert.rejects(raw(), /permission denied/);
        await assert.rejects(file(files[3]), /permission denied/);
        await as(owner);
      },
    );
    await t.test(
      "read and reapplied additive schema preserve audit and attachments",
      async () => {
        const fingerprint = async () =>
          (
            await db.query(
              "select (select md5(jsonb_agg(to_jsonb(a) order by id)::text) from public.audit_events a) audit,(select md5(jsonb_agg(to_jsonb(f) order by id)::text) from public.work_attachments f) files",
            )
          ).rows[0];
        const before = await fingerprint();
        await get();
        await get("documentos");
        await file(files[3]);
        assert.deepEqual(await fingerprint(), before);
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL(
              "../supabase/migrations/202609290037_customer_permits.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        await as(owner);
        assert.deepEqual(await fingerprint(), before);
        const info = (
          await db.query(
            "select prosecdef,provolatile from pg_proc where proname='customer_permits'",
          )
        ).rows[0];
        assert.deepEqual(info, { prosecdef: false, provolatile: "s" });
      },
    );
    await t.test(
      "bad responses cannot masquerade as an empty list",
      async () => {
        for (const data of [null, {}, { count: 1, page: 1, rows: [{}] }]) {
          const bad = {
            ...api,
            rpc: async () => ({ data, error: null }),
          } as unknown as typeof api;
          await assert.rejects(
            loadCustomerRecords(bad, member, company, client, "permisos"),
            /No se pudieron/,
          );
        }
      },
    );
  } finally {
    await db.close();
  }
});

test("private document response preserves bytes and never issues bearer links", async () => {
  const company = id(),
    customer = id(),
    attachment = id(),
    record = id(),
    path = `${company}/${record}/${attachment}.pdf`,
    bytes = Buffer.from("%PDF-1.4\nQA synthetic file\n%%EOF");
  let storageCalls = 0;
  const db: CustomerDocumentClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: id() } }, error: null }),
    },
    rpc: async () => ({
      data: [{ path, name: "QA Peña 'archivo'.pdf", record_id: record }],
      error: null,
    }),
    storage: {
      from: () => ({
        download: async () => {
          storageCalls++;
          return {
            data: new Blob([bytes], { type: "application/pdf" }),
            error: null,
          };
        },
      }),
    },
  };
  const response = await customerDocument(
    company,
    customer,
    attachment,
    async () => db,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition")!, /Pe%C3%B1a/);
  assert.match(response.headers.get("content-disposition")!, /%27archivo%27/);
  assert.equal(response.headers.get("location"), null);
  assert.equal(storageCalls, 1);
  for (const [fixture, status] of [
    [
      {
        ...db,
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      },
      401,
    ],
    [
      { ...db, rpc: async () => ({ data: null, error: { code: "42501" } }) },
      403,
    ],
    [{ ...db, rpc: async () => ({ data: [], error: null }) }, 404],
    [{ ...db, rpc: async () => ({ data: null, error: null }) }, 503],
    [
      {
        ...db,
        rpc: async () => ({
          data: [
            {
              path: `${id()}/${record}/${attachment}.pdf`,
              name: "a",
              record_id: record,
            },
          ],
          error: null,
        }),
      },
      503,
    ],
  ] as const) {
    const callsBefore: number = storageCalls;
    assert.equal(
      (
        await customerDocument(
          company,
          customer,
          attachment,
          async () => fixture,
        )
      ).status,
      status,
    );
    assert.equal(storageCalls, callsBefore);
  }
  for (const blob of [
    new Blob(["<script>"], { type: "text/html" }),
    new Blob([], { type: "application/pdf" }),
    new Blob([new Uint8Array(5000001)], { type: "application/pdf" }),
  ]) {
    const bad = {
      ...db,
      storage: {
        from: () => ({ download: async () => ({ data: blob, error: null }) }),
      },
    };
    assert.equal(
      (await customerDocument(company, customer, attachment, async () => bad))
        .status,
      503,
    );
  }
  assert.equal(
    (
      await customerDocument("bad", customer, attachment, async () => {
        throw new Error("must not connect");
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await customerDocument(company, customer, attachment, async () => {
        throw new Error("connection");
      })
    ).status,
    503,
  );
});
