import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID as id, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { initialDesign, rateLabels } from "../src/lib/designs";
test("Design pricing, client links and assistant enforce server boundaries", async (t) => {
  const db = new PGlite(),
    owner = id(),
    staff = id(),
    other = id(),
    company = id(),
    foreign = id(),
    customer = id(),
    secondCustomer = id(),
    foreignCustomer = id(),
    design = id(),
    estimate = id();
  const rates = Object.fromEntries(
    Object.keys(rateLabels).map((k) => [k, "10"]),
  );
  rates.permit_threshold = "200";
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`,
  );
  for (const file of [
    "001_foundation",
    "002_commercial",
    "004_estimates",
    "005_invoices_projects",
    "006_workers_expenses",
    "007_void_expense_receipts",
    "008_operations_workspaces",
    "009_time_tracking",
    "010_design_pricing",
    "011_client_sharing",
    "012_assistant",
    "013_audit_completion",
    "014_web_requests",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/202609170${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  }
  for (const [uid, email] of [
    [owner, "owner@example.test"],
    [staff, "staff@example.test"],
    [other, "other@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,now())", [uid, email]);
  async function as(uid: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec(`set role ${role}`);
  }
  const save = (
    version: number,
    spec = initialDesign,
    refresh = false,
    cid = customer,
    kind = "nuevo3d",
  ) =>
    db.query("select public.save_design($1,$2,$3,$4,$5,$6)", [
      company,
      design,
      version,
      kind,
      JSON.stringify({ name: "Patio de prueba", customer_id: cid, spec }),
      refresh,
    ]);
  async function designRow() {
    return (
      await db.query<{
        version: number;
        total: string;
        price_version: number;
        estimate_id: string;
      }>("select * from public.designs where id=$1", [design])
    ).rows[0];
  }
  const token = () => randomBytes(32).toString("hex");
  const share = async (
    kind: string,
    target: string,
    version: number,
    key: string,
    shareId = id(),
  ) => {
    await db.query("select public.create_client_share($1,$2,$3,$4,$5,$6,7)", [
      company,
      shareId,
      kind,
      target,
      version,
      key,
    ]);
    return shareId;
  };
  const view = async (key: string) =>
    (
      await db.query<{ v: Record<string, unknown> | null }>(
        "select public.read_client_share($1) v",
        [key],
      )
    ).rows[0].v;
  let shareId = "",
    shareToken = "";
  try {
    await as(owner);
    await db.query("select public.create_company($1,'Empresa A')", [company]);
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    for (const cid of [customer, secondCustomer])
      await db.query("select public.save_customer($1,$2,0,$3)", [
        company,
        cid,
        JSON.stringify({
          full_name: "Cliente sintético",
          status: "active",
          notes: "Nota interna privada",
        }),
      ]);
    await as(other);
    await db.query("select public.create_company($1,'Empresa B')", [foreign]);
    await db.query("select public.save_customer($1,$2,0,$3)", [
      foreign,
      foreignCustomer,
      JSON.stringify({ full_name: "Otra empresa", status: "active" }),
    ]);
    await as(owner);
    await t.test(
      "prices require positive roof rates and optimistic version",
      async () => {
        await assert.rejects(save(0), /prices_required/);
        await assert.rejects(
          db.query("select public.save_price_book($1,0,$2)", [
            company,
            JSON.stringify({ ...rates, roof_white: "0" }),
          ]),
          /positive_roof/,
        );
        await db.query("select public.save_price_book($1,0,$2)", [
          company,
          JSON.stringify(rates),
        ]);
        await assert.rejects(
          db.query("select public.save_price_book($1,0,$2)", [
            company,
            JSON.stringify(rates),
          ]),
          /record_conflict/,
        );
      },
    );
    await t.test(
      "design totals are derived, dimensions bounded and references isolated",
      async () => {
        await assert.rejects(
          save(0, initialDesign, false, foreignCustomer),
          /customer_unavailable/,
        );
        await assert.rejects(
          save(0, { ...initialDesign, length: "201" }),
          /invalid_dimension/,
        );
        await assert.rejects(
          save(0, {
            ...initialDesign,
            wall: "panel",
            wall_length: "10",
            wall_height: "20",
          }),
          /invalid_wall/,
        );
        await save(0, {
          ...initialDesign,
          wall: "panel",
          wall_length: "10",
          wall_height: "8",
          kitchen_length: "5",
          heavy_count: "2",
          permit: true,
        });
        assert.equal((await designRow()).total, "5670.00");
        await assert.rejects(save(0), /record_conflict/);
        await assert.rejects(
          save(1, initialDesign, false, customer, "pergolamotor"),
          /record_conflict/,
        );
      },
    );
    await t.test(
      "existing designs retain rate snapshots until explicit refresh",
      async () => {
        await db.query("select public.save_price_book($1,1,$2)", [
          company,
          JSON.stringify({ ...rates, roof_white: "20" }),
        ]);
        await save(1);
        assert.equal((await designRow()).total, "2400.00");
        assert.equal((await designRow()).price_version, 1);
        await save(2, initialDesign, true);
        assert.equal((await designRow()).total, "4800.00");
        assert.equal((await designRow()).price_version, 2);
      },
    );
    await t.test(
      "design conversion is atomic and retry does not duplicate estimates",
      async () => {
        await db.query("select public.design_to_estimate($1,$2,3,$3)", [
          company,
          design,
          estimate,
        ]);
        const retry = await db.query<{ v: string }>(
          "select public.design_to_estimate($1,$2,3,$3) v",
          [company, design, id()],
        );
        assert.equal(retry.rows[0].v, estimate);
        const result = await db.query<{ total: string; n: number }>(
          "select total,(select count(*)::int from public.estimates) n from public.estimates where id=$1",
          [estimate],
        );
        assert.equal(result.rows[0].total, "4800.00");
        assert.equal(result.rows[0].n, 1);
      },
    );
    await t.test(
      "unprivileged users cannot read or mutate prices, designs or links",
      async () => {
        await as(staff);
        assert.equal(
          (await db.query("select * from public.designs")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.price_books")).rows.length,
          0,
        );
        await assert.rejects(save(3), /permission_denied/);
        await assert.rejects(
          share("estimate", estimate, 1, token()),
          /permission_denied/,
        );
        await as(other);
        assert.equal(
          (
            await db.query("select * from public.designs where company_id=$1", [
              company,
            ])
          ).rows.length,
          0,
        );
        await assert.rejects(save(3), /permission_denied/);
        await as(owner);
      },
    );
    await t.test(
      "web snapshots omit internal notes and enforce a secret capability",
      async () => {
        shareToken = token();
        shareId = await share("estimate", estimate, 1, shareToken);
        await as("", "anon");
        const data = await view(shareToken);
        assert.equal(data?.kind, "estimate");
        assert.equal(data?.can_respond, true);
        assert.equal((data?.document as Record<string, unknown>).total, 4800);
        assert.equal(JSON.stringify(data).includes("notes"), false);
        assert.equal(await view(token()), null);
        await assert.rejects(
          db.query("select * from public.client_shares"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "client acceptance is immutable, idempotent and never invoices automatically",
      async () => {
        await db.query(
          "select public.respond_client_share($1,'ACCEPTED','Cliente de prueba','Confirmado')",
          [shareToken],
        );
        await db.query(
          "select public.respond_client_share($1,'ACCEPTED','Cliente de prueba','Confirmado')",
          [shareToken],
        );
        await assert.rejects(
          db.query(
            "select public.respond_client_share($1,'CHANGES','Cliente de prueba','Cambiar')",
            [shareToken],
          ),
          /response_already_recorded/,
        );
        assert.equal((await view(shareToken))?.can_respond, false);
        await as(owner);
        assert.equal(
          (await db.query("select * from public.invoices")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "revocation is immediate and expired links are inaccessible",
      async () => {
        await db.query("select public.revoke_client_share($1,$2)", [
          company,
          shareId,
        ]);
        await as("", "anon");
        assert.equal(await view(shareToken), null);
        await as(owner);
        const key = token(),
          expired = await share("estimate", estimate, 1, key);
        await db.exec("reset role");
        await db.query(
          "update public.client_shares set expires_at=now()-interval '1 second' where id=$1",
          [expired],
        );
        await as("", "anon");
        assert.equal(await view(key), null);
        await as(owner);
      },
    );
    await t.test(
      "revised proposals cannot be accepted from stale published snapshots",
      async () => {
        const key = token();
        await share("estimate", estimate, 1, key);
        await db.exec("reset role");
        const e = (
          await db.query<{ v: Record<string, unknown> }>(
            "select to_jsonb(e) v from public.estimates e where id=$1",
            [estimate],
          )
        ).rows[0].v;
        await as(owner);
        await db.query("select public.save_estimate($1,$2,1,$3)", [
          company,
          estimate,
          JSON.stringify({
            ...e,
            notes: "Ajuste interno",
            discount: "0",
            taxes: "0",
          }),
        ]);
        await as("", "anon");
        assert.equal((await view(key))?.can_respond, false);
        await assert.rejects(
          db.query(
            "select public.respond_client_share($1,'ACCEPTED','Cliente','')",
            [key],
          ),
          /estimate_changed_or_expired/,
        );
        await as(owner);
      },
    );
    await t.test(
      "portal scopes invoices and project summaries to one customer only",
      async () => {
        await db.query(
          "select public.approve_estimate($1,$2,2,current_date,'Obra de prueba','Confirmación administrativa')",
          [company, estimate],
        );
        const key = token(),
          empty = token();
        await share("portal", customer, 0, key);
        await share("portal", secondCustomer, 0, empty);
        await assert.rejects(
          share("portal", foreignCustomer, 0, token()),
          /customer_unavailable/,
        );
        await as("", "anon");
        const data = await view(key);
        assert.equal((data?.invoices as unknown[]).length, 1);
        assert.equal((data?.projects as unknown[]).length, 1);
        assert.equal((await view(empty))?.kind, "portal");
        assert.deepEqual((await view(empty))?.invoices, []);
        assert.equal(JSON.stringify(data).includes("notes"), false);
        await as(owner);
      },
    );
    await t.test(
      "revoking an issuer's source permissions invalidates their outstanding links",
      async () => {
        await db.exec("reset role");
        await db.query(
          `update public.memberships set permissions='{"estimadosweb":["write"],"fin-estimados":["read"]}' where company_id=$1 and user_id=$2`,
          [company, staff],
        );
        await as(staff);
        const key = token();
        await share("estimate", estimate, 3, key);
        await as("", "anon");
        assert.equal((await view(key))?.kind, "estimate");
        await db.exec("reset role");
        await db.query(
          `update public.memberships set permissions='{"estimadosweb":["write"]}' where company_id=$1 and user_id=$2`,
          [company, staff],
        );
        await as("", "anon");
        assert.equal(await view(key), null);
        await as(owner);
      },
    );
    await t.test(
      "public web inquiries are isolated, bounded and convert once to a lead",
      async () => {
        const form = id(),
          request = id(),
          payload = {
            name: "Solicitante de prueba",
            email: "inquiry@example.test",
            phone: "",
            message: "Proyecto de prueba",
            service: "Pérgola",
            length: "20",
            width: "12",
            height: "9",
          };
        await db.query("select public.manage_web_form($1,$2,true)", [
          company,
          form,
        ]);
        await as("", "anon");
        await assert.rejects(
          db.query("select * from public.web_requests"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select public.submit_web_request($1,$2,$3)", [
            form,
            id(),
            JSON.stringify({ ...payload, email: "invalid" }),
          ]),
          /invalid_contact/,
        );
        await db.query("select public.submit_web_request($1,$2,$3)", [
          form,
          request,
          JSON.stringify(payload),
        ]);
        await db.query("select public.submit_web_request($1,$2,$3)", [
          form,
          request,
          JSON.stringify(payload),
        ]);
        await assert.rejects(
          db.query("select public.submit_web_request($1,$2,$3)", [
            form,
            request,
            JSON.stringify({ ...payload, name: "Changed" }),
          ]),
          /request_conflict/,
        );
        await as(other);
        assert.equal(
          (await db.query("select * from public.web_requests")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select public.review_web_request($1,$2,true)", [
            company,
            request,
          ]),
          /permission_denied/,
        );
        await as(owner);
        const lead = (
          await db.query<{ v: string }>(
            "select public.review_web_request($1,$2,true) v",
            [company, request],
          )
        ).rows[0].v;
        assert.equal(
          (
            await db.query<{ v: string }>(
              "select public.review_web_request($1,$2,true) v",
              [company, request],
            )
          ).rows[0].v,
          lead,
        );
        assert.equal(
          (await db.query("select * from public.leads")).rows.length,
          1,
        );
        await db.query("select public.manage_web_form($1,$2,false)", [
          company,
          form,
        ]);
        await as("", "anon");
        await assert.rejects(
          db.query("select public.submit_web_request($1,$2,$3)", [
            form,
            id(),
            JSON.stringify(payload),
          ]),
          /form_unavailable/,
        );
        await as(owner);
      },
    );
    await t.test(
      "assistant is disabled by default and quotas are atomic and idempotent",
      async () => {
        await assert.rejects(
          db.query("select public.reserve_assistant_request($1,$2)", [
            company,
            id(),
          ]),
          /assistant_disabled/,
        );
        await db.query("select public.configure_assistant($1,true,2)", [
          company,
        ]);
        const request = id();
        assert.equal(
          (
            await db.query<{ v: boolean }>(
              "select public.reserve_assistant_request($1,$2) v",
              [company, request],
            )
          ).rows[0].v,
          true,
        );
        assert.equal(
          (
            await db.query<{ v: boolean }>(
              "select public.reserve_assistant_request($1,$2) v",
              [company, request],
            )
          ).rows[0].v,
          false,
        );
        await db.query("select public.reserve_assistant_request($1,$2)", [
          company,
          id(),
        ]);
        await assert.rejects(
          db.query("select public.reserve_assistant_request($1,$2)", [
            company,
            id(),
          ]),
          /assistant_rate_limit/,
        );
      },
    );
    await t.test(
      "assistant context never expands a member's module permissions",
      async () => {
        await db.exec("reset role");
        await db.query(
          `update public.memberships set permissions='{"ia":["write"],"clientes":["read"]}' where company_id=$1 and user_id=$2`,
          [company, staff],
        );
        await as(staff);
        const c = (
          await db.query<{ v: Record<string, unknown> }>(
            "select public.assistant_context($1) v",
            [company],
          )
        ).rows[0].v;
        assert.deepEqual(Object.keys(c), ["clientes"]);
        assert.deepEqual(c.clientes, { active: 2, archived: 0 });
        await assert.rejects(
          db.query("select public.assistant_context($1)", [foreign]),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select public.configure_assistant($1,true,100)", [company]),
          /permission_denied/,
        );
        await as("", "anon");
        await assert.rejects(
          db.query("select public.assistant_context($1)", [company]),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
