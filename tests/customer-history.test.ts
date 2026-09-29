import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { loadCustomerRecords } from "../src/lib/customer-records";
import {
  customerHistorySchema,
  historyCursor,
} from "../src/lib/customer-history";
import { CustomerRecords } from "../src/components/customer-records";
import type { Membership } from "../src/lib/modules";

test("history cursor retains bigint precision and rejects malformed links", () => {
  assert.equal(historyCursor("9007199254740993"), "9007199254740993");
  assert.equal(historyCursor("9223372036854775807"), "9223372036854775807");
  for (const value of [
    undefined,
    "0",
    "-1",
    "2.5",
    "3e4",
    "01",
    "9223372036854775808",
    "x",
  ])
    assert.equal(historyCursor(value), null);
});

test("customer history uses persisted revisions, stable cursors and current permissions", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    other = randomUUID();
  const client = randomUUID(),
    separate = randomUUID(),
    foreign = randomUUID();
  const member: Membership = {
    company_id: company,
    user_id: owner,
    email: "owner@example.test",
    role: "owner",
    active: true,
    permissions: {},
  };
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const api = {
    from() {
      throw new Error(
        "History must not query a whole business table through PostgREST",
      );
    },
    async rpc(
      name: string,
      p: { p_company: string; p_customer: string; p_before: string | null },
    ) {
      assert.equal(name, "customer_history");
      try {
        return {
          data: (
            await db.query<{ data: unknown }>(
              "select public.customer_history($1,$2,$3) data",
              [p.p_company, p.p_customer, p.p_before],
            )
          ).rows[0].data,
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    },
  } as unknown as Pick<SupabaseClient, "from" | "rpc">;
  const get = (before?: string, cust = client, who = member) =>
    loadCustomerRecords(
      api,
      who,
      company,
      cust,
      "historial",
      undefined,
      before,
    );
  const raw = (cid = company, cust = client, before: string | null = null) =>
    db.query("select public.customer_history($1,$2,$3)", [cid, cust, before]);
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
  const updateCustomer = async (cust: string, note: string) => {
    const c = (
      await db.query<{ version: number; full_name: string; email: string }>(
        "select version,full_name,email from public.customers where id=$1",
        [cust],
      )
    ).rows[0];
    await db.query("select public.save_customer($1,$2,$3,$4)", [
      company,
      cust,
      c.version,
      JSON.stringify({
        full_name: c.full_name,
        email: c.email,
        status: "active",
        notes: note,
      }),
    ]);
  };
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select public.create_company($1,'QA history A'),public.create_company($2,'QA history B')",
      [company, other],
    );
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    const estimates: string[] = [],
      projects: string[] = [],
      invoices: string[] = [];
    for (const [cid, cust] of [
      [company, client],
      [company, separate],
      [other, foreign],
    ]) {
      await db.query("select public.save_customer($1,$2,0,$3)", [
        cid,
        cust,
        JSON.stringify({
          full_name: "QA <separate>",
          email: "same@example.test",
          status: "active",
          notes: "PRIVATE_CONTACT_NOTE",
        }),
      ]);
      const eid = randomUUID();
      estimates.push(eid);
      await db.query("select public.save_estimate($1,$2,0,$3)", [
        cid,
        eid,
        JSON.stringify({
          customer_id: cust,
          estimate_date: "2026-09-28",
          valid_until: null,
          status: "BORRADOR",
          notes: "PRIVATE_ESTIMATE_NOTE",
          discount: "0",
          taxes: "0",
          items: [
            { ...emptyItem, name: "Synthetic item", unit_price: "100.25" },
          ],
        }),
      ]);
      await db.query(
        "select public.approve_estimate($1,$2,1,'2026-09-29','Proyecto QA <uno>','Aprobación <sintética>')",
        [cid, eid],
      );
      const row = (
        await db.query<{ id: string; project_id: string }>(
          "select id,project_id from public.invoices where estimate_id=$1",
          [eid],
        )
      ).rows[0];
      invoices.push(row.id);
      projects.push(row.project_id);
      await db.query("select public.record_payment($1,$2,$3,1,$4)", [
        cid,
        randomUUID(),
        row.id,
        JSON.stringify({
          amount: "25.10",
          payment_date: "2026-09-29",
          method: "OTRO",
          reference: "QA",
          notes: "PRIVATE_PAYMENT_NOTE",
        }),
      ]);
      await db.query("select public.save_expense($1,$2,0,$3)", [
        cid,
        randomUUID(),
        JSON.stringify({
          project_id: row.project_id,
          worker_id: null,
          expense_date: "2026-09-29",
          category: "QA <material>",
          description: "PRIVATE_EXPENSE_NOTE",
          vendor: "QA",
          document_number: cust,
          amount: "1.01",
          method: "OTRO",
          reimbursement_status: "NO_APLICA",
          status: "PENDIENTE",
          decision_note: "Revisión <sintética>",
        }),
      ]);
    }
    await t.test(
      "all six record kinds expose only whitelisted persisted revision metadata",
      async () => {
        const result = await get();
        const rows = result.history!.rows;
        assert.deepEqual(
          new Set(rows.map((e) => e.entity)),
          new Set([
            "customers",
            "estimates",
            "invoices",
            "projects",
            "payments",
            "expenses",
          ]),
        );
        assert.ok(rows.every((e) => e.actor_id === owner));
        assert.equal(rows.filter((e) => e.entity === "estimates").length, 2);
        assert.ok(
          rows.some(
            (e) =>
              e.entity === "estimates" &&
              e.status === "BORRADOR" &&
              e.revision === "1",
          ),
        );
        assert.ok(
          rows.some(
            (e) =>
              e.entity === "estimates" &&
              e.status === "APROBADO" &&
              e.revision === "2",
          ),
        );
        assert.ok(
          rows.some((e) => e.entity === "payments" && e.amount === "25.10"),
        );
        assert.ok(
          rows.some(
            (e) =>
              e.entity === "invoices" &&
              e.changed_fields.includes("paid_amount"),
          ),
        );
        assert.ok(
          rows.every(
            (e) =>
              !estimates.slice(1).includes(e.record_id) &&
              !projects.slice(1).includes(e.record_id) &&
              !invoices.slice(1).includes(e.record_id),
          ),
        );
        const encoded = JSON.stringify(rows);
        for (const secret of [
          "PRIVATE_",
          "before_data",
          "after_data",
          "token_hash",
          "customer_snapshot",
        ])
          assert.ok(!encoded.includes(secret));
        const html = renderToStaticMarkup(
          createElement(CustomerRecords, {
            companyId: company,
            customerId: client,
            records: result,
            timezone: "America/New_York",
          }),
        );
        assert.match(html, /&lt;sintética&gt;/);
        assert.ok(!html.includes("<sintética>"));
        assert.match(html, /America\/New_York/);
        assert.match(html, /\$25\.10/);
        assert.match(html, /historial\/payments\//);
      },
    );
    await t.test(
      "module restriction filters events, including amounts and association labels",
      async () => {
        const who = await grant({ clientes: ["read"] });
        const r = await get(undefined, client, who);
        assert.deepEqual(
          r.sections.map((s) => s.id),
          ["historial"],
        );
        assert.ok(
          r.history!.rows.every(
            (e) => e.entity === "customers" && e.amount === null,
          ),
        );
        await grant({ clientes: ["read"], "fin-invoices": ["read"] });
        assert.ok(
          (await get()).history!.rows.every((e) =>
            ["customers", "invoices", "payments"].includes(e.entity),
          ),
        );
        await grant({ clientes: ["read"], gastos: ["read"] });
        assert.ok(
          (await get()).history!.rows.every((e) => e.entity === "customers"),
        );
        await grant({
          clientes: ["read"],
          gastos: ["read"],
          "fin-proyectos": ["read"],
        });
        assert.ok(
          (await get()).history!.rows.some((e) => e.entity === "expenses"),
        );
        assert.ok(
          (await get()).history!.rows.every((e) =>
            ["customers", "projects", "expenses"].includes(e.entity),
          ),
        );
      },
    );
    await t.test(
      "foreign tenant, missing customer, revoked membership and anonymous access fail closed",
      async () => {
        await assert.rejects(raw(other, foreign), /permission_denied/);
        await assert.rejects(raw(company, foreign), /permission_denied/);
        await grant({ "fin-invoices": ["read"] });
        await assert.rejects(get(), /No se pudo cargar/);
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,$3)",
          [company, staff, JSON.stringify({ clientes: ["read"] })],
        );
        await as(staff);
        await assert.rejects(raw(), /permission_denied/);
        await db.exec("reset role;set role anon");
        await assert.rejects(raw(), /permission denied/);
        await as(owner);
        await assert.rejects(
          raw(company, client, "0"),
          /invalid_history_cursor/,
        );
      },
    );
    await t.test(
      "reassigned estimate never brings the previous customer's audit to the new dossier",
      async () => {
        const eid = randomUUID();
        const data = {
          customer_id: client,
          estimate_date: "2026-09-29",
          valid_until: null,
          status: "BORRADOR",
          notes: "OLD_CUSTOMER_SECRET",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "QA", unit_price: "50.10" }],
        };
        await db.query("select public.save_estimate($1,$2,0,$3)", [
          company,
          eid,
          JSON.stringify(data),
        ]);
        await db.query("select public.save_estimate($1,$2,1,$3)", [
          company,
          eid,
          JSON.stringify({
            ...data,
            customer_id: separate,
            notes: "New owner of record",
          }),
        ]);
        assert.ok(
          !(await get()).history!.rows.some((e) => e.record_id === eid),
        );
        assert.ok(
          !(await get(undefined, separate)).history!.rows.some(
            (e) => e.record_id === eid,
          ),
        );
        await db.query("select public.save_estimate($1,$2,2,$3)", [
          company,
          eid,
          JSON.stringify({
            ...data,
            customer_id: separate,
            notes: "Second change",
          }),
        ]);
        const rows = (await get(undefined, separate)).history!.rows.filter(
          (e) => e.record_id === eid,
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].revision, "3");
      },
    );
    await t.test(
      "pagination keeps bigint precision and avoids duplicates when a later change arrives",
      async () => {
        await db.exec(
          "reset role;alter sequence public.audit_events_id_seq restart with 9007199254741000",
        );
        await as(owner);
        for (let n = 0; n < 35; n++)
          await updateCustomer(client, `QA revision ${n}`);
        const first = (await get()).history!;
        assert.equal(first.rows.length, 30);
        assert.ok(first.next_before);
        assert.ok(BigInt(first.rows[0].id) > BigInt(Number.MAX_SAFE_INTEGER));
        await updateCustomer(client, "QA concurrent event");
        const second = (await get(first.next_before!)).history!;
        assert.ok(second.rows.length > 5);
        assert.ok(
          second.rows.every((e) => BigInt(e.id) < BigInt(first.next_before!)),
        );
        const firstIds = new Set(first.rows.map((e) => e.id));
        assert.ok(second.rows.every((e) => !firstIds.has(e.id)));
        assert.ok(
          BigInt((await get()).history!.rows[0].id) > BigInt(first.rows[0].id),
        );
        assert.equal((await get("wrong")).before, null);
      },
    );
    await t.test(
      "reads and repeatable additive schema leave audit/business data unchanged",
      async () => {
        const fingerprint = async () =>
          (
            await db.query(
              "select (select md5(jsonb_agg(to_jsonb(a) order by id)::text) from public.audit_events a) audit,(select md5(jsonb_agg(to_jsonb(c) order by id)::text) from public.customers c) customers",
            )
          ).rows[0];
        const before = await fingerprint();
        await get();
        await get(undefined, separate);
        assert.deepEqual(await fingerprint(), before);
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL(
              "../supabase/migrations/202609290036_customer_history.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        await as(owner);
        assert.deepEqual(await fingerprint(), before);
      },
    );
    await t.test(
      "malformed and unavailable history is never rendered as empty",
      async () => {
        for (const data of [null, {}, { rows: [], next_before: "bad" }]) {
          const bad = {
            ...api,
            rpc: async () => ({ data, error: null }),
          } as unknown as typeof api;
          await assert.rejects(
            loadCustomerRecords(bad, member, company, client, "historial"),
            /No se pudo cargar/,
          );
        }
        assert.equal(
          customerHistorySchema.safeParse({ rows: [], next_before: null })
            .success,
          true,
        );
      },
    );
  } finally {
    await db.close();
  }
});
