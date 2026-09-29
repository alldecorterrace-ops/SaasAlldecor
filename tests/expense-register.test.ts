import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import {
  expenseCsv,
  expenseFiltersSchema,
  expenseRegisterSchema,
  exportExpenses,
  type ExpenseExportClient,
} from "../src/lib/expense-register";

test("expense register: complete filtered totals, export, tenant isolation and revocation", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const read = async (
    filters: Record<string, unknown> = {},
    page = 1,
    exp = false,
    company = a,
  ) =>
    expenseRegisterSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select public.expense_register($1,$2,$3,$4) data",
          [company, JSON.stringify(filters), page, exp],
        )
      ).rows[0].data,
    );
  const grant = async (p: Record<string, string[]>) => {
    await as(owner);
    await db.query("select public.set_member_access($1,$2,'member',true,$3)", [
      a,
      staff,
      JSON.stringify(p),
    ]);
    await as(staff);
  };
  const customers: string[] = [],
    projects: string[] = [];
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select public.create_company($1,'QA A'),public.create_company($2,'QA B')",
      [a, b],
    );
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [a],
    );
    for (const cid of [a, a, b]) {
      const customer = randomUUID(),
        estimate = randomUUID();
      customers.push(customer);
      await db.query("select public.save_customer($1,$2,0,$3)", [
        cid,
        customer,
        JSON.stringify({
          full_name: 'Peña, "QA"',
          email: "shared@example.test",
          phone: "5550100",
          status: "active",
        }),
      ]);
      await db.query("select public.save_estimate($1,$2,0,$3)", [
        cid,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: "2026-09-29",
          valid_until: null,
          status: "BORRADOR",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "QA", unit_price: "10000.00" }],
        }),
      ]);
      await db.query(
        "select public.approve_estimate($1,$2,1,'2026-09-29','Proyecto QA','Prueba local')",
        [cid, estimate],
      );
      projects.push(
        (
          await db.query<{ id: string }>(
            "select id from public.projects where company_id=$1 and estimate_id=$2",
            [cid, estimate],
          )
        ).rows[0].id,
      );
    }
    for (let n = 0; n < 25; n++) {
      await db.query("select public.save_expense($1,$2,0,$3)", [
        n === 24 ? b : a,
        randomUUID(),
        JSON.stringify({
          project_id:
            n === 23 ? null : projects[n === 24 ? 2 : n === 22 ? 1 : 0],
          worker_id: null,
          expense_date: n === 21 ? "2026-09-30" : "2026-09-29",
          category: n === 22 ? "Oficina" : "Materiales",
          description: n === 0 ? "línea 1\nlínea 2" : "Ejemplo sintético",
          vendor: n === 0 ? "=SUM(1,2)" : "QA Peña",
          document_number: n === 0 ? "100%_\\literal" : `QA-${n}`,
          amount: "1.01",
          method: "OTRO",
          reimbursement_status: "NO_APLICA",
          status: n === 20 ? "ANULADO" : n === 1 ? "RECHAZADO" : "APROBADO",
          decision_note: "Prueba local",
        }),
      ]);
    }
    const worker = randomUUID();
    await db.query("select public.save_worker($1,$2,0,$3)", [
      a,
      worker,
      JSON.stringify({
        name: "QA worker",
        email: "worker@example.test",
        phone: "",
        job_title: "",
        team: "",
        hourly_rate: "20.00",
        weekly_target: 40,
        active: true,
        notes: "",
      }),
    ]);
    await db.exec("reset role");
    await db.query(
      "update public.expenses set worker_id=$1,reimbursement_status='PENDIENTE' where company_id=$2 and document_number in ('QA-19','QA-20')",
      [worker, a],
    );
    await as(owner);
    const sameName = randomUUID(),
      foreignWorker = randomUUID();
    for (const [company, id] of [
      [a, sameName],
      [b, foreignWorker],
    ]) {
      await db.query("select public.save_worker($1,$2,0,$3)", [
        company,
        id,
        JSON.stringify({
          name: "QA worker",
          email: "",
          phone: "",
          job_title: "",
          team: "",
          hourly_rate: "0",
          weekly_target: 40,
          active: false,
          notes: "Synthetic inactive history",
        }),
      ]);
    }
    const fingerprint = async () =>
      (
        await db.query(
          "select md5(string_agg(to_jsonb(e)::text,'' order by id)) hash from public.expenses e",
        )
      ).rows[0];
    const before = await fingerprint();
    await t.test(
      "total includes all filtered pages, stable pagination and void distinction",
      async () => {
        const first = await read();
        assert.equal(first.count, 23);
        assert.equal(first.rows.length, 20);
        assert.equal(first.total, "23.23");
        assert.equal(first.active, "23.23");
        assert.equal(first.reimbursements, "1.01");
        const second = await read({}, 100000);
        assert.equal(second.page, 2);
        assert.equal(second.rows.length, 3);
        assert(!second.rows.some((x) => first.rows.some((y) => y.id === x.id)));
        const all = await read({ status: "TODOS" });
        assert.equal(all.count, 24);
        assert.equal(all.total, "24.24");
        assert.equal(all.active, "23.23");
        const voided = await read({ status: "ANULADO" });
        assert.equal(voided.count, 1);
        assert.equal(voided.total, "1.01");
        assert.equal(voided.active, "0.00");
        assert.equal(voided.reimbursements, "0.00");
      },
    );
    await t.test(
      "inclusive dates, literal search, customer IDs and general expenses",
      async () => {
        assert.equal(
          (await read({ from: "2026-09-29", to: "2026-09-29" })).count,
          22,
        );
        assert.equal(
          (await read({ from: "2026-09-30", to: "2026-09-30" })).count,
          1,
        );
        assert.equal((await read({ q: "%_\\" })).count, 1);
        assert.equal((await read({ q: "LÍNEA" })).count, 1);
        assert.equal((await read({ q: "no match" })).total, "0.00");
        assert.equal((await read({ customer: customers[0] })).count, 21);
        assert.equal(
          (await read({ customer: customers[1], category: "Oficina" })).count,
          1,
        );
        assert.equal(
          (await read({ customer: customers[1], project: projects[0] })).count,
          0,
        );
        assert.equal(
          (await read({}, 1, true)).rows.filter((r) => r.project_id === null)
            .length,
          1,
        );
        await assert.rejects(
          read({ customer: customers[2] }),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "ADT search covers date/category and permission-scoped related names without changing overview",
      async () => {
        const overview = (await read()).overview;
        for (const [q, count] of [
          ["2026-09-30", 1],
          ["2026-09-29 Materiales", 21],
          ["Oficina", 1],
          ['Peña, "QA"', 22],
          ["Proyecto QA", 22],
          ["QA WORKER", 1],
        ] as const) {
          const result = await read({ q }, 1, true);
          assert.equal(result.count, count, q);
          assert.equal(result.rows.length, count, q);
          assert.deepEqual(result.overview, overview);
          assert.equal(
            (expenseCsv(result).match(/"1.01"/g) || []).length,
            count,
          );
        }
        assert.equal(
          (await read({ q: "QA worker", status: "TODOS" })).count,
          2,
        );
        assert.equal(
          (await read({ q: "QA worker", category: "Oficina" })).count,
          0,
        );
        await grant({ gastos: ["read"] });
        for (const q of ['Peña, "QA"', "Proyecto QA", "QA worker"])
          assert.equal(
            (await read({ q }, 1, true)).count,
            0,
            "hidden identity must not be searchable: " + q,
          );
        assert.equal((await read({ q: "Oficina" })).count, 1);
        await grant({ gastos: ["read"], "fin-proyectos": ["read"] });
        assert.equal((await read({ q: "Proyecto QA" })).count, 22);
        assert.equal((await read({ q: 'Peña, "QA"' })).count, 0);
        await grant({
          gastos: ["read"],
          "fin-proyectos": ["read"],
          clientes: ["read"],
          trabajadores: ["read"],
        });
        assert.equal((await read({ q: 'Peña, "QA"' })).count, 22);
        assert.equal((await read({ q: "QA worker" })).count, 1);
        await grant({ gastos: ["read"] });
        assert.equal(
          (await read({ q: "QA worker" }, 1, true)).count,
          0,
          "revocation must immediately apply to export",
        );
        await assert.rejects(
          read({ q: "Proyecto QA" }, 1, true, b),
          /permission_denied/,
        );
        await as(owner);
        assert.deepEqual(await fingerprint(), before);
      },
    );
    await t.test(
      "worker selection keeps identity, totals, history, export and revocation scoped",
      async () => {
        const selected = await read({ worker, status: "TODOS" }, 1, true);
        assert.equal(selected.count, 2);
        assert.equal(selected.total, "2.02");
        assert.equal(selected.active, "1.01");
        assert.equal(selected.reimbursements, "1.01");
        assert(selected.rows.every((r) => r.worker_id === worker));
        assert.equal((expenseCsv(selected).match(/"1.01"/g) || []).length, 2);
        assert.deepEqual(selected.overview, (await read()).overview);
        assert.equal((await read({ worker, status: "ANULADO" })).count, 1);
        assert.equal((await read({ worker, category: "Oficina" })).count, 0);
        assert.equal(
          (await read({ worker: sameName, status: "TODOS" })).count,
          0,
          "same name never merges identities; inactive history is addressable",
        );
        for (const denied of [foreignWorker, randomUUID()])
          await assert.rejects(
            read({ worker: denied }, 1, true),
            /permission_denied/,
          );
        await assert.rejects(
          read({ worker: "invalid" }),
          /invalid_expense_filters/,
        );
        await grant({ gastos: ["read"], trabajadores: ["read"] });
        assert.equal((await read({ worker })).count, 1);
        await grant({ gastos: ["read"] });
        await assert.rejects(read({ worker }), /permission_denied/);
        await assert.rejects(read({ worker }, 1, true), /permission_denied/);
        await grant({ trabajadores: ["read"] });
        await assert.rejects(read({ worker }), /permission_denied/);
        await as(owner);
        assert.deepEqual(await fingerprint(), before);
      },
    );
    await t.test(
      "CSV exports whole selection with cents, Unicode, quotes, line breaks and formula defense",
      async () => {
        const result = await read({}, 1, true);
        assert.equal(result.rows.length, 23);
        const csv = expenseCsv(result);
        assert(csv.startsWith("\uFEFF"));
        assert(csv.includes('"Peña, ""QA"""'));
        assert(csv.includes('"\'=SUM(1,2)"'));
        assert(csv.includes('"línea 1\nlínea 2"'));
        assert.equal((csv.match(/"1.01"/g) || []).length, 23);
        assert.throws(
          () => expenseCsv({ ...result, rows: result.rows.slice(0, 20) }),
          /Incomplete/,
        );
        for (const prefix of ["+", "-", "@", "\t=", "\r+", "\u0000="])
          assert(
            expenseCsv({
              ...result,
              count: 1,
              rows: [{ ...result.rows[0], vendor: prefix + "unsafe" }],
            }).includes("\"'" + prefix + 'unsafe"'),
          );
      },
    );
    await t.test(
      "direct RPC validates malformed filters and dates without broadening results",
      async () => {
        for (const filters of [
          { status: "bad" },
          { from: "2026-02-30" },
          { from: "2026-09-30", to: "2026-09-29" },
          { from: "tomorrow" },
          { q: "x".repeat(101) },
          { project: "bad" },
          { q: null },
          { unknown: "x" },
        ])
          await assert.rejects(read(filters), /invalid_expense_filters/);
        await assert.rejects(read({}, 0), /invalid_expense_filters/);
      },
    );
    await t.test(
      "module permissions hide related identity and forbid bypass via filters/export",
      async () => {
        await grant({ gastos: ["read"] });
        const scoped = await read();
        assert.equal(scoped.count, 23);
        assert(
          scoped.rows.every(
            (r) => r.customer_id === null && r.project_id === null,
          ),
        );
        await assert.rejects(
          read({ customer: customers[0] }),
          /permission_denied/,
        );
        await assert.rejects(
          read({ project: projects[0] }),
          /permission_denied/,
        );
        await assert.rejects(read({}, 1, true, b), /permission_denied/);
        await grant({ gastos: ["read"], "fin-proyectos": ["read"] });
        assert((await read()).rows.some((r) => r.project_id));
        assert((await read()).rows.every((r) => !r.customer_id));
        await grant({
          gastos: ["read"],
          "fin-proyectos": ["read"],
          clientes: ["read"],
        });
        assert.equal((await read({ customer: customers[1] })).count, 1);
        await grant({ clientes: ["read"] });
        await assert.rejects(read(), /permission_denied/);
        await assert.rejects(read({}, 1, true), /permission_denied/);
        await db.exec("set role anon");
        await assert.rejects(read(), /permission denied/);
        await as(owner);
        assert.deepEqual(await fingerprint(), before);
      },
    );
    await t.test(
      "export refuses over 5000 results instead of truncating",
      async () => {
        await db.exec("reset role");
        await db.query(
          `insert into public.expenses(id,company_id,expense_date,category,amount,method,created_by,updated_by) select gen_random_uuid(),$1,'2026-09-01','Capacity',1.01,'OTRO',$2,$2 from generate_series(1,5001)`,
          [a, owner],
        );
        await as(owner);
        await assert.rejects(
          read({ category: "Capacity" }, 1, true),
          /expense_export_limit/,
        );
        assert.equal((await read({ category: "Oficina" }, 1, true)).count, 1);
      },
    );
  } finally {
    await db.close();
  }
});

test("expense export authenticates, fails closed and never caches private data", async () => {
  const company = randomUUID();
  let calls = 0;
  const fake = (
    user: unknown,
    error: { code?: string } | null = null,
    data: unknown = null,
  ): ExpenseExportClient => ({
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
    },
    async rpc() {
      calls++;
      return { data, error };
    },
  });
  assert.equal(
    (await exportExpenses(company, {}, async () => fake(null))).status,
    401,
  );
  assert.equal(calls, 0);
  assert.equal(
    (
      await exportExpenses(company, { from: "2026-02-30" }, async () =>
        fake({}),
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
  for (const [code, status] of [
    ["42501", 403],
    ["54000", 422],
    ["22023", 400],
    ["08006", 503],
  ] as const) {
    const response = await exportExpenses(company, {}, async () =>
      fake({}, { code }),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(
    (await exportExpenses(company, {}, async () => fake({}, null, {}))).status,
    503,
  );
  const empty = {
    count: 0,
    page: 1,
    total: "0.00",
    active: "0.00",
    reimbursements: "0.00",
    rows: [],
  };
  const response = await exportExpenses(company, {}, async () =>
    fake({}, null, empty),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
  assert.equal(
    expenseFiltersSchema.safeParse({ from: "2026-09-30", to: "2026-09-29" })
      .success,
    false,
  );
});
