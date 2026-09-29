import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerRecords } from "../src/components/customer-records";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import {
  loadCustomerRecords,
  customerRecordSections,
} from "../src/lib/customer-records";
import { emptyItem } from "../src/lib/estimates";
import {
  modules,
  workspaceModules,
  companyHomeHref,
  type Membership,
} from "../src/lib/modules";

test("active workspace excludes configurators without deleting the legacy catalog", () => {
  assert.equal(workspaceModules.length, 21);
  assert.equal(modules.length, 23);
  assert.ok(
    !workspaceModules.some((m) => ["nuevo3d", "pergolamotor"].includes(m.id)),
  );
  for (const id of [
    "clientes",
    "adm-precios",
    "productos",
    "fin-estimados",
    "manualfab",
  ])
    assert.ok(workspaceModules.some((m) => m.id === id));
  const legacy: Membership = {
    company_id: "a",
    user_id: "u",
    email: "qa@example.test",
    role: "member",
    active: true,
    permissions: { nuevo3d: ["write"] },
  };
  assert.equal(companyHomeHref("a", legacy), "/app/a/sin-acceso");
  assert.equal(
    companyHomeHref("a", {
      ...legacy,
      permissions: { ...legacy.permissions, clientes: ["read"] },
    }),
    "/app/a/clientes",
  );
});

test("customer dossier reads persisted, paged records under company and module RLS", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    otherCompany = randomUUID();
  const client = randomUUID(),
    sameContact = randomUUID(),
    otherClient = randomUUID();
  const calls: {
    table: string;
    filters: Record<string, string>;
    fields: string;
  }[] = [];
  // Minimal read-only PostgREST adapter: execute the loader's actual projections,
  // filters and ordering against PostgreSQL with authenticated RLS enabled.
  const api = {
    async rpc(
      name: string,
      p: { p_company: string; p_customer: string; p_before: string | null },
    ) {
      assert.equal(name, "customer_history");
      return {
        data: (
          await db.query<{ data: unknown }>(
            "select public.customer_history($1,$2,$3) data",
            [p.p_company, p.p_customer, p.p_before],
          )
        ).rows[0].data,
        error: null,
      };
    },
    from(table: string) {
      assert.ok(["estimates", "invoices", "projects"].includes(table));
      const call = { table, filters: {} as Record<string, string>, fields: "" };
      calls.push(call);
      const filters: string[] = [],
        params: unknown[] = [],
        orders: string[] = [];
      const query = {
        select(fields: string) {
          assert.match(fields, /^[a-z_,]+$/);
          call.fields = fields;
          return query;
        },
        eq(key: string, value: string) {
          assert.ok(["company_id", "customer_id"].includes(key));
          call.filters[key] = value;
          params.push(value);
          filters.push(`${key}=$${params.length}`);
          return query;
        },
        order(key: string, options?: { ascending?: boolean }) {
          assert.match(key, /^[a-z_]+$/);
          orders.push(key + (options?.ascending === false ? " desc" : " asc"));
          return query;
        },
        async range(from: number, to: number) {
          const where = filters.join(" and ");
          const count = (
            await db.query<{ n: number }>(
              `select count(*)::int n from public.${table} where ${where}`,
              params,
            )
          ).rows[0].n;
          const data = (
            await db.query(
              `select ${call.fields} from public.${table} where ${where} order by ${orders.join(",")} limit $${params.length + 1} offset $${params.length + 2}`,
              [...params, to - from + 1, from],
            )
          ).rows;
          return { data, count, error: null };
        },
      };
      return query;
    },
  } as unknown as Pick<SupabaseClient, "from" | "rpc">;
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const ownerMember: Membership = {
    company_id: company,
    user_id: owner,
    email: "owner@example.test",
    role: "owner",
    active: true,
    permissions: {},
  };
  const grant = async (permissions: Record<string, string[]>) => {
    await as(owner);
    await db.query("select public.set_member_access($1,$2,'member',true,$3)", [
      company,
      staff,
      JSON.stringify(permissions),
    ]);
    await as(staff);
    return {
      ...ownerMember,
      user_id: staff,
      role: "member" as const,
      permissions,
    };
  };
  try {
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [staff, "staff@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'QA dossier A')", [
      company,
    ]);
    await db.query("select public.create_company($1,'QA dossier B')", [
      otherCompany,
    ]);
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    for (const [cid, cust, name] of [
      [company, client, "Cliente A"],
      [company, sameContact, "Cliente separado"],
      [otherCompany, otherClient, "Cliente B"],
    ]) {
      await db.query("select public.save_customer($1,$2,0,$3)", [
        cid,
        cust,
        JSON.stringify({
          full_name: name,
          email: "shared@example.test",
          phone: "5550100",
          status: "active",
        }),
      ]);
    }
    let first = "";
    for (let i = 0; i < 24; i++) {
      const id = randomUUID(),
        cid = i === 23 ? otherCompany : company,
        cust = i === 23 ? otherClient : i === 22 ? sameContact : client;
      if (i === 0) first = id;
      await db.query("select public.save_estimate($1,$2,0,$3)", [
        cid,
        id,
        JSON.stringify({
          customer_id: cust,
          estimate_date: "2026-09-29",
          valid_until: null,
          status: "BORRADOR",
          notes: "QA",
          discount: "0",
          taxes: "0",
          items: [
            { ...emptyItem, name: "Servicio sintético", unit_price: "100.25" },
          ],
        }),
      ]);
    }
    await db.query(
      "select public.approve_estimate($1,$2,1,'2026-09-29','Proyecto QA','Aprobación sintética local')",
      [company, first],
    );
    await t.test(
      "stable pagination returns only this customer, including historical states",
      async () => {
        const a = await loadCustomerRecords(
          api,
          ownerMember,
          company,
          client,
          "estimados",
          "1",
        );
        const b = await loadCustomerRecords(
          api,
          ownerMember,
          company,
          client,
          "estimados",
          "2",
        );
        assert.equal(a.count, 22);
        assert.equal(a.rows.length, 20);
        assert.equal(b.rows.length, 2);
        assert.equal(new Set([...a.rows, ...b.rows].map((r) => r.id)).size, 22);
        assert.ok(
          [...a.rows, ...b.rows].every((r) => Number(r.total) === 100.25),
        );
        assert.equal(
          [...a.rows, ...b.rows].filter((r) => r.status === "APROBADO").length,
          1,
        );
        assert.ok(
          calls.every(
            (c) =>
              c.filters.company_id === company &&
              c.filters.customer_id === client,
          ),
        );
        assert.equal(
          (
            await loadCustomerRecords(
              api,
              ownerMember,
              company,
              client,
              "estimados",
              "999999",
            )
          ).page,
          2,
        );
        assert.equal(
          (
            await loadCustomerRecords(
              api,
              ownerMember,
              company,
              client,
              "estimados",
              "2oops",
            )
          ).page,
          1,
        );
      },
    );
    await t.test(
      "matching contact fields never merge customers or cross company",
      async () => {
        assert.equal(
          (await loadCustomerRecords(api, ownerMember, company, sameContact))
            .count,
          1,
        );
        assert.equal(
          (await loadCustomerRecords(api, ownerMember, company, otherClient))
            .count,
          0,
        );
      },
    );
    await t.test(
      "invoice cents and project links come from their own saved records",
      async () => {
        const invoices = await loadCustomerRecords(
          api,
          ownerMember,
          company,
          client,
          "facturas",
        );
        assert.equal(invoices.count, 1);
        assert.equal(Number(invoices.rows[0].total), 100.25);
        assert.equal(Number(invoices.rows[0].balance_due), 100.25);
        const projects = await loadCustomerRecords(
          api,
          ownerMember,
          company,
          client,
          "proyectos",
        );
        assert.equal(projects.count, 1);
        assert.equal(projects.rows[0].name, "Proyecto QA");
        assert.equal(projects.rows[0].total, undefined);
      },
    );
    await t.test(
      "customer-only access makes no related-table query or count",
      async () => {
        const member = await grant({ clientes: ["read"] });
        calls.length = 0;
        const r = await loadCustomerRecords(
          api,
          member,
          company,
          client,
          "facturas",
        );
        assert.equal(r.section?.id, "historial");
        assert.deepEqual(
          r.sections.map((s) => s.id),
          ["historial"],
        );
        assert.ok(r.history!.rows.every((e) => e.entity === "customers"));
        assert.equal(calls.length, 0);
      },
    );
    await t.test(
      "project-only permission never queries financial projections",
      async () => {
        const member = await grant({
          clientes: ["read"],
          "fin-proyectos": ["read"],
        });
        calls.length = 0;
        const r = await loadCustomerRecords(
          api,
          member,
          company,
          client,
          "facturas",
        );
        assert.equal(r.section?.id, "proyectos");
        assert.equal(r.rows.length, 1);
        assert.ok(
          calls.every(
            (c) => c.table === "projects" && !c.fields.includes("total"),
          ),
        );
      },
    );
    await t.test(
      "database RLS still rejects revoked financial access with stale application context",
      async () => {
        const current = await grant({ clientes: ["read"] });
        const stale = {
          ...current,
          permissions: { clientes: ["read"], "fin-invoices": ["read"] },
        };
        assert.equal(
          (await loadCustomerRecords(api, stale, company, client, "facturas"))
            .count,
          0,
        );
        await assert.rejects(
          loadCustomerRecords(
            api,
            { ...current, active: false },
            company,
            client,
          ),
          /No tienes acceso/,
        );
        await assert.rejects(
          loadCustomerRecords(api, current, otherCompany, otherClient),
          /No tienes acceso/,
        );
      },
    );
    await t.test(
      "query failures are not presented as an empty customer history",
      async () => {
        const failing = {
          from() {
            const q = {
              select: () => q,
              eq: () => q,
              order: () => q,
              range: async () => ({
                data: null,
                count: null,
                error: { message: "unavailable" },
              }),
            };
            return q;
          },
        } as unknown as Pick<SupabaseClient, "from" | "rpc">;
        await assert.rejects(
          loadCustomerRecords(failing, ownerMember, company, client),
          /No se pudieron cargar/,
        );
      },
    );
  } finally {
    await db.close();
  }
});

test("customer dossier renders authorized links, exact cents and escaped labels", () => {
  const section = customerRecordSections[1];
  const records = {
    sections: [section],
    section,
    page: 1,
    count: 21,
    rows: [
      {
        id: "invoice-1",
        number: "<QA>",
        invoice_date: "2026-09-29",
        payment_status: "VOID",
        total: "100.25",
        balance_due: "0.00",
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(CustomerRecords, {
      companyId: "company-a",
      customerId: "customer-a",
      records,
    }),
  );
  assert.match(html, /&lt;QA&gt;/);
  assert.match(html, /\$100\.25/);
  assert.match(html, /\$0\.00/);
  assert.match(html, /href="\/app\/company-a\/facturas\/invoice-1"/);
  assert.match(html, /section=facturas&amp;page=2/);
  assert.match(html, /aria-current="page"/);
  assert.doesNotMatch(html, /section=(estimados|proyectos)/);
  assert.doesNotMatch(html, /<QA>/);
  assert.equal(
    renderToStaticMarkup(
      createElement(CustomerRecords, {
        companyId: "company-a",
        customerId: "customer-a",
        records: {
          sections: [],
          section: undefined,
          count: 0,
          page: 1,
          rows: [],
        },
      }),
    ),
    "",
  );
});
