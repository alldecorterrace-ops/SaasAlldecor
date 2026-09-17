import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { imageFormat } from "../src/lib/image-validation";
import {
  leadSchema,
  productSchema,
  emptyLead,
  emptyProduct,
} from "../src/lib/commercial";

test("Commercial validation preserves details and rejects malformed prices and dates", () => {
  assert.equal(
    imageFormat(new TextEncoder().encode("<svg><script/></svg>")),
    null,
  );
  assert.equal(
    imageFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]))
      ?.contentType,
    "image/png",
  );
  assert.equal(
    leadSchema.safeParse({
      ...emptyLead("America/New_York"),
      full_name: "María",
      appointment_date: "2026-02-30",
    }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...emptyProduct,
      name: "Pérgola",
      unit_price: "12.345",
    }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...emptyProduct,
      name: "Pérgola",
      unit_price: "-1",
    }).success,
    false,
  );
  const p = {
    ...emptyProduct,
    name: "Pérgola",
    unit_price: "12.30",
    specs: [{ label: "Altura", unit: "ft" }],
    options: [
      {
        label: "Acabado",
        choices: [{ label: "Descuento", add: "-2.50", addType: "flat" }],
      },
    ],
  };
  assert.deepEqual(productSchema.parse(p), p);
});

test("Commercial PostgreSQL: tenant isolation, conversion and product rule persistence", async (t) => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222",
    staff = "33333333-3333-4333-8333-333333333333";
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    lead = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    product = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const filename of [
    "202609170001_foundation.sql",
    "202609170002_commercial.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + filename, import.meta.url),
        "utf8",
      ),
    );
  // Emulate the Storage catalog for policy tests, without calling a live service.
  await db.exec(
    `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609170003_product_images.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    (
      await db.query<{ public: boolean }>(
        "select public from storage.buckets where id='product-images'",
      )
    ).rows[0].public,
    false,
  );
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [other, "other@example.test"],
    [staff, "staff@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
  async function as(id: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  }
  const input = {
    ...emptyLead("America/New_York"),
    full_name: "Prospecto de prueba",
    email: "lead@example.test",
    message: "Primera línea\nSegunda línea",
    source: "web",
    contact_preference: "Teléfono",
    appointment_date: "2026-10-01",
  };
  const p = {
    ...emptyProduct,
    name: "Pérgola de prueba",
    unit_price: "12.35",
    specs: [{ label: "Altura", unit: "ft" }],
    options: [
      {
        label: "Acabado",
        choices: [
          { label: "Liso", add: "2.50", addType: "base" },
          { label: "Especial", add: "150.00", addType: "flat" },
        ],
      },
    ],
  };
  const saveLead = (
    company = a,
    version = 0,
    data: unknown = input,
    id = lead,
  ) =>
    db.query("select public.save_lead($1,$2,$3,$4)", [
      company,
      id,
      version,
      JSON.stringify(data),
    ]);
  const saveProduct = (
    company = a,
    version = 0,
    data: unknown = p,
    id = product,
  ) =>
    db.query("select public.save_product($1,$2,$3,$4)", [
      company,
      id,
      version,
      JSON.stringify(data),
    ]);
  const grant = async (permissions: unknown) => {
    await as(owner);
    await db.query("select public.set_member_access($1,$2,$3,true,$4)", [
      a,
      staff,
      "member",
      JSON.stringify(permissions),
    ]);
    await as(staff);
  };
  try {
    await as(owner);
    await db.query("select public.create_company($1,$2)", [a, "Empresa A"]);
    await as(other);
    await db.query("select public.create_company($1,$2)", [b, "Empresa B"]);
    await as(owner);
    await t.test(
      "anonymous cannot read or invoke commercial mutations",
      async () => {
        await as("", "anon");
        for (const table of ["leads", "products"])
          await assert.rejects(
            db.query(`select * from public.${table}`),
            /permission denied/,
          );
        await assert.rejects(saveLead(), /permission denied/);
        await assert.rejects(saveProduct(), /permission denied/);
        await assert.rejects(
          db.query("select * from public.activity_feed($1)", [a]),
          /permission denied/,
        );
        await as(owner);
      },
    );
    await t.test(
      "lead and product persist details and ignore spoofed system fields",
      async () => {
        await saveLead(a, 0, {
          ...input,
          company_id: b,
          created_by: other,
          version: 900,
        });
        await saveProduct(a, 0, {
          ...p,
          company_id: b,
          created_by: other,
          version: 900,
        });
        const l = (
          await db.query<{
            company_id: string;
            created_by: string;
            version: number;
            message: string;
          }>("select * from public.leads")
        ).rows[0];
        assert.equal(l.company_id, a);
        assert.equal(l.created_by, owner);
        assert.equal(l.version, 1);
        assert.equal(l.message, input.message);
        const r = (
          await db.query<{
            unit_price: string;
            specs: unknown;
            options: unknown;
          }>("select * from public.products")
        ).rows[0];
        assert.equal(r.unit_price, "12.35");
        assert.deepEqual(r.specs, p.specs);
        assert.deepEqual(r.options, p.options);
      },
    );
    await t.test(
      "duplicate request identifiers cannot insert duplicates",
      async () => {
        await assert.rejects(saveLead(), /duplicate/);
        await assert.rejects(saveProduct(), /duplicate/);
      },
    );
    await t.test(
      "another tenant cannot enumerate or mutate records",
      async () => {
        await as(other);
        assert.equal(
          (await db.query("select * from public.leads")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.products")).rows.length,
          0,
        );
        await assert.rejects(saveLead(a, 1), /permission_denied/);
        await assert.rejects(saveProduct(a, 1), /permission_denied/);
        await assert.rejects(
          db.query("select public.convert_lead($1,$2,1)", [a, lead]),
          /permission_denied/,
        );
        await as(owner);
      },
    );
    await t.test("direct table mutation is denied", async () => {
      await assert.rejects(
        db.query("update public.leads set status='GANADO'"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("delete from public.products"),
        /permission denied/,
      );
    });
    await t.test(
      "edit keeps optimistic version and rejects stale update",
      async () => {
        await saveLead(a, 1, { ...input, status: "CONTACTADO" });
        await assert.rejects(saveLead(a, 1), /record_conflict/);
        await saveProduct(a, 1, { ...p, unit_price: "13.00" });
        await assert.rejects(saveProduct(a, 1), /record_conflict/);
      },
    );
    await t.test(
      "SQL rejects invalid status, details, and excess precision",
      async () => {
        await assert.rejects(
          saveLead(a, 2, { ...input, status: "INVENTADO" }),
          /check constraint/,
        );
        await assert.rejects(
          saveLead(a, 2, { ...input, status: "CLIENTE" }),
          /use_lead_conversion/,
        );
        await assert.rejects(
          saveProduct(a, 2, { ...p, unit_price: "2.999" }),
          /invalid_price/,
        );
        await assert.rejects(
          saveProduct(a, 2, { ...p, unit_price: "NaN" }),
          /invalid_price/,
        );
        await assert.rejects(
          saveProduct(a, 2, { ...p, specs: [{}] }),
          /check constraint/,
        );
        await assert.rejects(
          saveProduct(a, 2, {
            ...p,
            options: [
              {
                label: "Bad",
                choices: [{ label: "x", add: "0.10", addType: "script" }],
              },
            ],
          }),
          /check constraint/,
        );
      },
    );
    await t.test(
      "read-only users can view but cannot convert or edit",
      async () => {
        await db.query("select public.add_company_member($1,$2)", [
          a,
          "staff@example.test",
        ]);
        await grant({ crm: ["read"], productos: ["read"] });
        assert.equal(
          (await db.query("select * from public.leads")).rows.length,
          1,
        );
        await assert.rejects(saveLead(a, 2), /permission_denied/);
        await assert.rejects(saveProduct(a, 2), /permission_denied/);
        await assert.rejects(
          db.query("select public.convert_lead($1,$2,2)", [a, lead]),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "conversion requires both lead and customer write",
      async () => {
        await grant({ crm: ["write"] });
        await assert.rejects(
          db.query("select public.convert_lead($1,$2,2)", [a, lead]),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "archived leads must be restored before conversion",
      async () => {
        await as(owner);
        await saveLead(a, 2, { ...input, archived: true });
        await assert.rejects(
          db.query("select public.convert_lead($1,$2,3)", [a, lead]),
          /lead_archived/,
        );
        await saveLead(a, 3, input);
      },
    );
    let cid: string;
    await t.test(
      "conversion is atomic, copies fields, uses correct company and is retry safe",
      async () => {
        await grant({ crm: ["write"], clientes: ["write"] });
        await assert.rejects(
          db.query("select public.convert_lead($1,$2,3)", [a, lead]),
          /record_conflict/,
        );
        cid = (
          await db.query<{ convert_lead: string }>(
            "select public.convert_lead($1,$2,4)",
            [a, lead],
          )
        ).rows[0].convert_lead;
        assert.equal(
          (
            await db.query<{ convert_lead: string }>(
              "select public.convert_lead($1,$2,4)",
              [a, lead],
            )
          ).rows[0].convert_lead,
          cid,
        );
        const c = (
          await db.query<{
            id: string;
            company_id: string;
            notes: string;
            email: string;
          }>("select * from public.customers")
        ).rows;
        assert.equal(c.length, 1);
        assert.equal(c[0].id, cid);
        assert.equal(c[0].company_id, a);
        assert.equal(c[0].notes, input.message);
        assert.equal(c[0].email, input.email);
        const r = (
          await db.query<{ status: string; customer_id: string }>(
            "select * from public.leads",
          )
        ).rows[0];
        assert.equal(r.status, "CLIENTE");
        assert.equal(r.customer_id, cid);
      },
    );
    await t.test(
      "converted link cannot be overwritten or reset through lead editor",
      async () => {
        await assert.rejects(
          saveLead(a, 5, { ...input, status: "GANADO" }),
          /use_lead_conversion/,
        );
        await saveLead(a, 5, {
          ...input,
          status: "CLIENTE",
          customer_id: product,
        });
        assert.equal(
          (
            await db.query<{ customer_id: string }>(
              "select customer_id from public.leads",
            )
          ).rows[0].customer_id,
          cid,
        );
      },
    );
    await t.test(
      "archive and restore products preserve details and audit",
      async () => {
        await as(owner);
        await saveProduct(a, 2, { ...p, active: false });
        assert.equal(
          (
            await db.query<{ active: boolean }>(
              "select active from public.products",
            )
          ).rows[0].active,
          false,
        );
        await saveProduct(a, 3, { ...p, active: true });
        assert.equal(
          (await db.query("select * from public.products")).rows.length,
          1,
        );
        assert.ok(
          (
            await db.query(
              "select * from public.audit_events where entity='products'",
            )
          ).rows.length >= 4,
        );
      },
    );
    await t.test(
      "activity reveals only permitted module metadata and no raw snapshots",
      async () => {
        await grant({ activity: ["read"], crm: ["read"] });
        const events = (
          await db.query<Record<string, unknown>>(
            "select * from public.activity_feed($1)",
            [a],
          )
        ).rows;
        assert.ok(events.length);
        assert.ok(
          events.every(
            (e) =>
              e.entity === "leads" &&
              !("before_data" in e) &&
              !("after_data" in e),
          ),
        );
        assert.equal(
          (await db.query("select * from public.audit_events")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select * from public.activity_feed($1)", [b]),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "private images enforce tenant, product, version and append-only access",
      async () => {
        const path = `${a}/${product}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png`;
        await as(owner);
        await db.query(
          "insert into storage.objects(bucket_id,name) values('product-images',$1)",
          [path],
        );
        await db.query("select public.set_product_image($1,$2,4,$3)", [
          a,
          product,
          path,
        ]);
        assert.equal(
          (
            await db.query<{ image_path: string }>(
              "select image_path from public.products",
            )
          ).rows[0].image_path,
          path,
        );
        await assert.rejects(
          db.query("select public.set_product_image($1,$2,4,$3)", [
            a,
            product,
            path,
          ]),
          /record_conflict/,
        );
        await assert.rejects(
          db.query("select public.set_product_image($1,$2,5,$3)", [
            a,
            product,
            path.replace(product, lead),
          ]),
          /invalid_image/,
        );
        await as(other);
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          0,
        );
        await assert.rejects(
          db.query(
            "insert into storage.objects(bucket_id,name) values('product-images',$1)",
            [path.replace("eeeeeeee", "ffffffff")],
          ),
          /row-level security/,
        );
        await assert.rejects(
          db.query("select public.set_product_image($1,$2,5,$3)", [
            a,
            product,
            path,
          ]),
          /permission_denied/,
        );
        await grant({ productos: ["read"] });
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          1,
        );
        await assert.rejects(
          db.query(
            "insert into storage.objects(bucket_id,name) values('product-images',$1)",
            [path.replace("eeeeeeee", "ffffffff")],
          ),
          /row-level security/,
        );
        await as(owner);
        await db.query("select public.set_product_image($1,$2,5,null)", [
          a,
          product,
        ]);
        assert.equal(
          (
            await db.query<{ image_path: string | null }>(
              "select image_path from public.products",
            )
          ).rows[0].image_path,
          null,
        );
        await db.exec("delete from storage.objects");
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          1,
        );
        await db.exec("reset role");
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "revoked member immediately loses commercial and activity access",
      async () => {
        await as(owner);
        await db.query("select public.set_member_access($1,$2,$3,false,$4)", [
          a,
          staff,
          "member",
          "{}",
        ]);
        await as(staff);
        assert.equal(
          (await db.query("select * from public.leads")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select * from public.activity_feed($1)", [a]),
          /permission_denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
