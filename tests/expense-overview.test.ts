import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  expenseFiltersSchema,
  expenseRegisterSchema,
  expenseCsv,
} from "../src/lib/expense-register";
test("payer filters and CSV retain complete totals while overview follows company month and tenant boundaries", async () => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    other = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const read = async (f: Record<string, string> = {}, co = company) =>
    expenseRegisterSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select public.expense_register($1,$2,1,true) data",
          [co, JSON.stringify(f)],
        )
      ).rows[0].data,
    );
  try {
    for (const id of [owner, other])
      await db.query("insert into auth.users values($1,$2,now())", [
        id,
        `${id}@test.invalid`,
      ]);
    await as(other);
    await db.query("select public.create_company($1,'Foreign overview')", [
      foreign,
    ]);
    await as(owner);
    await db.query("select public.create_company($1,'Overview QA')", [company]);
    await db.exec("reset role");
    await db.query(
      "update public.companies set timezone='Pacific/Kiritimati' where id=$1",
      [company],
    );
    const dates = (
      await db.query<{
        month: string;
        last: string;
        next: string;
        label: string;
      }>(
        "select date_trunc('month',now() at time zone 'Pacific/Kiritimati')::date::text as month,(date_trunc('month',now() at time zone 'Pacific/Kiritimati')-interval '1 day')::date::text as last,(date_trunc('month',now() at time zone 'Pacific/Kiritimati')+interval '1 month')::date::text as next,to_char(now() at time zone 'Pacific/Kiritimati','YYYY-MM') label",
      )
    ).rows[0];
    // Fixtures are direct test-only SQL so unknown historical payer remains unknown.
    for (const [co, payer, date, amount, status] of [
      [company, "EMPRESA", dates.month, "1.01", "APROBADO"],
      [company, "EFECTIVO_EMPRESA", dates.month, "2.02", "PENDIENTE"],
      [company, null, dates.month, "3.03", "RECHAZADO"],
      [company, "EMPRESA", dates.last, "4.04", "APROBADO"],
      [company, "EMPRESA", dates.next, "5.05", "APROBADO"],
      [company, "EMPRESA", dates.month, "90.90", "ANULADO"],
      [foreign, "EMPRESA", dates.month, "999.99", "APROBADO"],
    ]) {
      await db.query(
        "insert into public.expenses(id,company_id,expense_date,category,vendor,document_number,amount,method,payer,status,created_by,updated_by) values($1,$2,$3,'QA','Synthetic',$1::uuid::text,$4,'EFECTIVO',$5,$6,$7,$7)",
        [randomUUID(), co, date, amount, payer, status, owner],
      );
    }
    await as(owner);
    const all = await read();
    assert.equal(all.total, "15.15");
    assert.deepEqual(all.overview, {
      month: dates.label,
      monthly: "6.06",
      active: "15.15",
      reimbursements: "0.00",
    });
    const cash = await read({ payer: "EFECTIVO_EMPRESA" });
    assert.equal(cash.count, 1);
    assert.equal(cash.total, "2.02");
    assert.deepEqual(cash.overview, all.overview);
    assert(expenseCsv(cash).includes('"EFECTIVO_EMPRESA"'));
    assert.equal((await read({ payer: "SIN_REGISTRAR" })).total, "3.03");
    assert.equal(
      (await read({ payer: "EMPRESA", from: dates.month, to: dates.month }))
        .total,
      "1.01",
    );
    const voided = await read({ status: "ANULADO" });
    assert.equal(voided.total, "90.90");
    assert.deepEqual(voided.overview, all.overview);
    const empty = await read({ q: "not found" });
    assert.equal(empty.count, 0);
    assert.deepEqual(empty.overview, all.overview);
    assert(!expenseFiltersSchema.safeParse({ payer: "invented" }).success);
    await assert.rejects(
      read({ payer: "invented" }),
      /invalid_expense_filters/,
    );
    await assert.rejects(read({}, foreign), /permission_denied/);
    await db.exec("reset role");
    await db.query(
      "update public.memberships set active=false where company_id=$1 and user_id=$2",
      [company, owner],
    );
    await as(owner);
    await assert.rejects(read(), /permission_denied/);
  } finally {
    await db.close();
  }
});
