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
import { customerLedgerSchema } from "../src/lib/customer-ledger";
import { CustomerRecords } from "../src/components/customer-records";
import type { Membership } from "../src/lib/modules";

test("customer ledger preserves financial totals, identity and permissions", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    other = randomUUID();
  const client = randomUUID(),
    separate = randomUUID(),
    foreign = randomUUID();
  const calls: string[] = [];
  const api = {
    from() {
      throw new Error("Unexpected related table query");
    },
    async rpc(
      name: string,
      p: {
        p_company: string;
        p_customer: string;
        p_section: string;
        p_page: number;
      },
    ) {
      assert.equal(name, "customer_ledger");
      calls.push(p.p_section);
      try {
        const r = await db.query<{ data: unknown }>(
          "select public.customer_ledger($1,$2,$3,$4) data",
          [p.p_company, p.p_customer, p.p_section, p.p_page],
        );
        return { data: r.rows[0].data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  } as unknown as Pick<SupabaseClient, "from" | "rpc">;
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const member: Membership = {
    company_id: company,
    user_id: owner,
    email: "owner@example.test",
    role: "owner",
    active: true,
    permissions: {},
  };
  const get = (kind: string, page = "1", cust = client, who = member) =>
    loadCustomerRecords(api, who, company, cust, kind, page);
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
  const raw = (kind: string, cid = company, cust = client, page = 1) =>
    db.query("select public.customer_ledger($1,$2,$3,$4)", [
      cid,
      cust,
      kind,
      page,
    ]);
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select public.create_company($1,'QA ledger A'),public.create_company($2,'QA ledger B')",
      [company, other],
    );
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    const invoices: string[] = [],
      projects: string[] = [];
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
          email: "shared@example.test",
          phone: "5550100",
          status: "active",
        }),
      ]);
      const estimate = randomUUID();
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
          items: [{ ...emptyItem, name: "QA", unit_price: "10000.00" }],
        }),
      ]);
      await db.query(
        "select public.approve_estimate($1,$2,1,'2026-09-29','Proyecto QA <separado>','Aprobación sintética local')",
        [cid, estimate],
      );
      const invoice = (
        await db.query<{ id: string; project_id: string }>(
          "select id,project_id from public.invoices where company_id=$1 and estimate_id=$2",
          [cid, estimate],
        )
      ).rows[0];
      invoices.push(invoice.id);
      projects.push(invoice.project_id);
    }
    const ids: string[] = [];
    for (let n = 0; n < 24; n++) {
      const id = randomUUID();
      ids.push(id);
      const cid = n === 23 ? other : company,
        invoice = n === 23 ? invoices[2] : n === 22 ? invoices[1] : invoices[0];
      const version = (
        await db.query<{ version: number }>(
          "select version from public.invoices where id=$1",
          [invoice],
        )
      ).rows[0].version;
      await db.query("select public.record_payment($1,$2,$3,$4,$5)", [
        cid,
        id,
        invoice,
        version,
        JSON.stringify({
          payment_date: "2026-09-29",
          amount: "10.01",
          method: "OTRO",
          reference: `QA-${n}`,
          notes: "<QA> sin dinero real",
        }),
      ]);
    }
    await db.query(
      "select public.void_payment($1,$2,1,'Corrección sintética')",
      [company, ids[0]],
    );
    for (let n = 0; n < 26; n++) {
      const cid = n === 24 ? other : company,
        project =
          n === 25
            ? null
            : n === 24
              ? projects[2]
              : n === 23
                ? projects[1]
                : projects[0];
      const status =
        n === 22
          ? "ANULADO"
          : n === 1
            ? "PENDIENTE"
            : n === 2
              ? "RECHAZADO"
              : "APROBADO";
      await db.query("select public.save_expense($1,$2,0,$3)", [
        cid,
        randomUUID(),
        JSON.stringify({
          project_id: project,
          worker_id: null,
          expense_date: "2026-09-29",
          category: "Material <QA>",
          description: "Ejemplo sintético",
          vendor: "QA",
          document_number: `QA-${n}`,
          amount: "1.01",
          method: "OTRO",
          reimbursement_status: "NO_APLICA",
          status,
          decision_note: "Solo prueba",
        }),
      ]);
    }
    await t.test(
      "full totals remain exact across pages and exclude reversed payments",
      async () => {
        const a = await get("pagos"),
          b = await get("pagos", "2"),
          last = await get("pagos", "999999");
        assert.equal(a.count, 22);
        assert.equal(a.ledger!.total, "210.21");
        assert.equal(b.ledger!.total, "210.21");
        assert.equal(a.ledger!.rows.length, 20);
        assert.equal(b.ledger!.rows.length, 2);
        assert.equal(last.page, 2);
        const rows = [...a.ledger!.rows, ...b.ledger!.rows];
        assert.equal(new Set(rows.map((r) => r.id)).size, 22);
        assert.equal(rows.filter((r) => r.status === "ANULADO").length, 1);
        assert.ok(rows.every((r) => r.parent_id === invoices[0]));
        assert.equal(
          (await get("pagos", "1", separate)).ledger!.total,
          "10.01",
        );
        await assert.rejects(get("pagos", "1", foreign), /No se pudo cargar/);
        const html = renderToStaticMarkup(
          createElement(CustomerRecords, {
            companyId: company,
            customerId: client,
            records: a,
          }),
        );
        assert.match(html, /Total pagado.*210\.21/);
        assert.match(html, /facturas\//);
        assert.match(html, /&lt;QA&gt;/);
        assert.ok(!html.includes("<QA>"));
      },
    );
    await t.test(
      "project expenses separate registered, approved, pending and rejected amounts",
      async () => {
        const a = await get("gastos"),
          b = await get("gastos", "2");
        assert.equal(a.count, 22);
        assert.equal(a.ledger!.total, "22.22");
        assert.equal(a.ledger!.approved, "20.20");
        assert.equal(a.ledger!.pending, "1.01");
        assert.equal(a.ledger!.rejected, "1.01");
        assert.equal(
          new Set([...a.ledger!.rows, ...b.ledger!.rows].map((r) => r.id)).size,
          22,
        );
        assert.ok(
          [...a.ledger!.rows, ...b.ledger!.rows].every(
            (r) => r.parent_id === projects[0] && r.status !== "ANULADO",
          ),
        );
        assert.equal((await get("gastos", "1", separate)).count, 1);
        const html = renderToStaticMarkup(
          createElement(CustomerRecords, {
            companyId: company,
            customerId: client,
            records: a,
          }),
        );
        assert.match(html, /no acredita pago ni reembolso/);
        assert.match(html, /gastos\//);
        assert.match(html, /proyectos\//);
        assert.match(html, /Material &lt;QA&gt;/);
        assert.ok(!html.includes("receipt_path"));
      },
    );
    await t.test(
      "payment access does not require or expose project/expense permissions",
      async () => {
        const who = await grant({
          clientes: ["read"],
          "fin-invoices": ["read"],
        });
        const result = await get("pagos", "1", client, who);
        assert.equal(result.ledger!.total, "210.21");
        assert.deepEqual(
          result.sections.map((s) => s.id),
          ["facturas", "pagos"],
        );
        await assert.rejects(raw("gastos"), /permission_denied/);
        await assert.rejects(raw("pagos", other, foreign), /permission_denied/);
      },
    );
    await t.test(
      "expenses require both their module and visible project association",
      async () => {
        const who = await grant({ clientes: ["read"], gastos: ["read"] });
        calls.length = 0;
        assert.equal(
          (await get("gastos", "1", client, who)).section,
          undefined,
        );
        assert.equal(calls.length, 0);
        await assert.rejects(raw("gastos"), /permission_denied/);
        await grant({
          clientes: ["read"],
          gastos: ["read"],
          "fin-proyectos": ["read"],
        });
        assert.equal(
          customerLedgerSchema.parse(
            (
              await api.rpc("customer_ledger", {
                p_company: company,
                p_customer: client,
                p_section: "gastos",
                p_page: 1,
              })
            ).data,
          ).total,
          "22.22",
        );
        await assert.rejects(raw("pagos"), /permission_denied/);
      },
    );
    await t.test(
      "revocation and missing customer permission reject rather than report zero",
      async () => {
        await grant({ "fin-invoices": ["read"] });
        await assert.rejects(raw("pagos"), /permission_denied/);
        await grant({ clientes: ["read"] });
        await assert.rejects(get("pagos"), /No se pudo cargar/);
        await assert.rejects(raw("gastos"), /permission_denied/);
        await as(owner);
        await assert.rejects(raw("bad"), /invalid_customer_ledger/);
        await assert.rejects(
          raw("pagos", company, client, 0),
          /invalid_customer_ledger/,
        );
        await db.exec("reset role; set role anon");
        await assert.rejects(raw("pagos"), /permission denied/);
        await as(owner);
      },
    );
    await t.test(
      "read-only calls and idempotent schema application preserve business rows",
      async () => {
        const snapshot = async () =>
          (
            await db.query(
              "select (select jsonb_agg(to_jsonb(p) order by id) from public.payments p) payments,(select jsonb_agg(to_jsonb(e) order by id) from public.expenses e) expenses",
            )
          ).rows[0];
        const before = await snapshot();
        await get("pagos");
        await get("gastos");
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL(
              "../supabase/migrations/202609290035_customer_ledger.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        await as(owner);
        assert.deepEqual(await snapshot(), before);
        const security = (
          await db.query<{ prosecdef: boolean; provolatile: string }>(
            "select prosecdef,provolatile from pg_proc where oid='public.customer_ledger(uuid,uuid,text,integer)'::regprocedure",
          )
        ).rows[0];
        assert.equal(security.prosecdef, false);
        assert.equal(security.provolatile, "s");
      },
    );
    await t.test(
      "malformed and failed responses never render a false zero balance",
      async () => {
        for (const data of [
          null,
          {},
          { rows: [], count: 0, page: 1, total: "wrong" },
        ]) {
          const bad = {
            ...api,
            rpc: async () => ({ data, error: null }),
          } as unknown as typeof api;
          await assert.rejects(
            loadCustomerRecords(bad, member, company, client, "pagos"),
            /No se pudo cargar/,
          );
        }
      },
    );
  } finally {
    await db.close();
  }
});
