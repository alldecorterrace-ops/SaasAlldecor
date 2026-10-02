import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RelatedCosts } from "../src/components/related-costs";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { receiptReviewFixture } from "./helpers/receipt-review-fixture";
import {
  costContextSchema,
  projectCostRegister,
} from "../src/lib/cost-register";
import { expenseFiltersSchema, expenseCsv } from "../src/lib/expense-register";
test("unified costs preserve original expense and add only reconciled daily supplement", async (t) => {
  const { db } = await fullDatabase();
  try {
    const f = await receiptReviewFixture(db);
    await f.as(f.owner);
    const dates = (
      await db.query<{ from: string; start: string; end: string }>(
        "select (now()-interval '2 hours')::text start,(now()-interval '1 hour')::text as end,((now()-interval '2 hours') at time zone timezone)::date::text as from from companies where id=$1",
        [f.a],
      )
    ).rows[0];
    const save = async (kind: string, id: string, data: unknown) =>
      db.query(
        "select save_labor_config($1,$2,$3,0,$4,$5,'Synthetic cost projection')",
        [f.a, randomUUID(), id, kind, JSON.stringify(data)],
      );
    await save("RATE", randomUUID(), {
      worker: f.worker.id,
      from: dates.from,
      to: "",
      amount: "250.00",
      active: true,
    });
    await save("PROJECT", f.project, { mode: "day", active: true });
    await db.query("select save_time_entry($1,$2,0,$3)", [
      f.a,
      randomUUID(),
      JSON.stringify({
        worker_id: f.worker.id,
        project_id: f.project,
        starts_at: dates.start,
        ends_at: dates.end,
        break_minutes: 0,
        status: "APROBADO",
        notes: "Synthetic",
        reason: "Synthetic reviewed shift",
      }),
    ]);
    const customer = (
      await db.query<{ id: string }>(
        "select customer_id id from projects where id=$1",
        [f.project],
      )
    ).rows[0].id;
    const expense = randomUUID(),
      original = randomUUID();
    const body = (amount: string, category: string) => ({
      project_id: f.project,
      worker_id: f.worker.id,
      expense_date: dates.from,
      category,
      description: "Synthetic recorded cost",
      amount,
      vendor: "QA",
      document_number: "",
      payer: "EMPRESA",
      status: "APROBADO",
      method: "OTRO",
      reimbursement_status: "NO_APLICA",
      notes: "Synthetic",
    });
    await db.query("select save_expense($1,$2,0,$3)", [
      f.a,
      expense,
      JSON.stringify(body("20.00", "Materiales")),
    ]);
    const read = async (
      input: Record<string, string> = {},
      page = 1,
      all = true,
    ) => {
      const filters = expenseFiltersSchema.parse(input),
        raw = costContextSchema.parse(
          (
            await db.query<{ data: unknown }>(
              "select cost_register_context($1,$2) data",
              [f.a, JSON.stringify(filters)],
            )
          ).rows[0].data,
        );
      return { raw, result: projectCostRegister(raw, filters, page, all) };
    };
    await t.test(
      "same saved projection in project/customer/CSV, no paid Labor or extra expense",
      async () => {
        const { result } = await read({ project: f.project, customer });
        assert.equal(result.total, "270.00");
        assert.equal(result.rows.length, 2);
        assert.equal(
          result.rows.find((r) => r.source === "LABOR")?.amount,
          "250.00",
        );
        assert.equal(
          result.rows.find((r) => r.source === "LABOR")?.method,
          "COSTO_CALCULADO",
        );
        assert.equal(result.reimbursements, "0.00");
        assert.equal(result.labor_complete, true);
        assert.deepEqual(
          (await read({ project: f.project, customer })).result,
          result,
        );
        assert.match(expenseCsv(result), /Labor calculada/);
        const html = renderToStaticMarkup(
          createElement(RelatedCosts, {
            companyId: f.a,
            project: f.project,
            result,
          }),
        );
        assert.match(html, /270.00/);
        assert.match(html, /Labor calculada/);
        assert.match(html, /no acredita nómina, pago ni reembolso/);
        assert.match(html, /\/horas\/labor/);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from expenses where company_id=$1",
              [f.a],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from payments where company_id=$1",
              [f.a],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "dates, source, state, worker, payer and literal search filter derived cost consistently",
      async () => {
        assert.equal(
          (
            await read({
              source: "LABOR",
              status: "CALCULADO",
              worker: f.worker.id,
              from: dates.from,
              to: dates.from,
            })
          ).result.total,
          "250.00",
        );
        assert.equal(
          (await read({ source: "ADMINISTRATIVE" })).result.total,
          "20.00",
        );
        assert.equal(
          (await read({ status: "APROBADO" })).result.total,
          "20.00",
        );
        assert.equal((await read({ payer: "EMPRESA" })).result.total, "20.00");
        assert.equal(
          (await read({ q: "Synthetic receipt project" })).result.total,
          "270.00",
        );
        assert.equal((await read({ from: "2099-01-01" })).result.total, "0.00");
        await assert.rejects(
          read({ project: f.foreignProject }),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "unmapped Labor remains visible and prevents a duplicate; correspondence restores exact supplement",
      async () => {
        await db.query("select save_expense($1,$2,0,$3)", [
          f.a,
          original,
          JSON.stringify(body("100.00", "Labor")),
        ]);
        const before = (
          await db.query<{ h: string }>(
            "select md5(to_jsonb(e)::text) h from expenses e where id=$1",
            [original],
          )
        ).rows[0].h;
        const pending = (await read()).result;
        assert.equal(pending.total, "120.00");
        assert.equal(
          pending.rows.filter((r) => r.source === "LABOR").length,
          0,
        );
        assert.equal(pending.labor_complete, false);
        assert.equal(pending.labor_pending?.length, 1);
        assert.match(expenseCsv(pending), /INCIDENCIA/);
        assert.match(expenseCsv(pending), /PENDIENTE DE CONCILIACION/);
        await save("HISTORICAL", original, {
          expense_version: 1,
          allocations: [
            { worker: f.worker.id, date: dates.from, cents: 10000 },
          ],
          active: true,
        });
        const mapped = (await read()).result;
        assert.equal(mapped.total, "270.00");
        assert.equal(
          mapped.rows.find((r) => r.source === "LABOR")?.amount,
          "150.00",
        );
        assert.equal(mapped.labor_complete, true);
        assert.equal(
          (
            await db.query<{ h: string }>(
              "select md5(to_jsonb(e)::text) h from expenses e where id=$1",
              [original],
            )
          ).rows[0].h,
          before,
        );
        assert.equal((await read({ source: "LABOR" })).result.total, "150.00");
      },
    );
    await t.test(
      "limited company member sees original permitted ledger without tariffs; Labor-specific request denies",
      async () => {
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          f.a,
          f.office.user,
          JSON.stringify({
            gastos: ["read"],
            "fin-proyectos": ["read"],
            trabajadores: ["read"],
            horasfix: ["read"],
          }),
        ]);
        await f.as(f.office.user);
        const { raw, result } = await read();
        assert.equal(raw.labor, null);
        assert.deepEqual(raw.projects, {});
        assert.equal(result.total, "120.00");
        assert.equal(result.rows.filter((r) => r.source === "LABOR").length, 0);
        await assert.rejects(read({ source: "LABOR" }), /permission_denied/);
        await f.as(f.owner);
      },
    );
    await t.test(
      "partial snapshots and missing derived relation fail closed; CSV escapes names",
      async () => {
        const { raw } = await read();
        assert.throws(
          () =>
            projectCostRegister(
              { ...raw, ledger: { ...raw.ledger, count: 999 } },
              expenseFiltersSchema.parse({}),
            ),
          /Incomplete/,
        );
        assert.throws(
          () =>
            projectCostRegister(
              { ...raw, projects: {} },
              expenseFiltersSchema.parse({}),
            ),
          /Unresolved/,
        );
        raw.labor!.names.workers[f.worker.id] = "=DANGEROUS";
        const result = projectCostRegister(raw, expenseFiltersSchema.parse({}));
        assert.match(expenseCsv(result), /"'=DANGEROUS"/);
      },
    );
  } finally {
    await db.close();
  }
});
