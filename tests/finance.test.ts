import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { emptyItem } from "../src/lib/estimates";
test("Finance: atomic approval, payments, project gates and tenant isolation", async (t) => {
  const db = new PGlite(),
    owner = randomUUID(),
    other = randomUUID(),
    staff = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const f of [
    "202609170001_foundation.sql",
    "202609170002_commercial.sql",
    "202609170004_estimates.sql",
    "202609170005_invoices_projects.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + f, import.meta.url),
        "utf8",
      ),
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
  let invoice = "",
    project = "";
  const input = {
    customer_id: customer,
    estimate_date: "2026-09-17",
    valid_until: null,
    status: "BORRADOR",
    notes: "Original",
    discount: "0",
    taxes: "0",
    items: [{ ...emptyItem, name: "Producto", unit_price: "100.00" }],
  };
  const approval = () =>
    db.query<{ id: string }>(
      "select public.approve_estimate($1,$2,1,$3,$4,$5) as id",
      [
        a,
        estimate,
        "2026-09-17",
        "Obra sintética",
        "Autorización registrada en prueba",
      ],
    );
  const current = async () =>
    (
      await db.query<{
        version: number;
        balance_due: string;
        paid_amount: string;
        payment_status: string;
        status: string;
      }>("select * from public.invoices where id=$1", [invoice])
    ).rows[0];
  const projectSave = (
    v: number,
    status: string,
    start: string | null = null,
  ) =>
    db.query("select public.update_project($1,$2,$3,$4)", [
      a,
      project,
      v,
      JSON.stringify({
        name: "Obra sintética",
        status,
        start_date: start,
        end_date: null,
        notes: "",
      }),
    ]);
  const payment = (id: string, v: number, amount = "25.10", ref = "") =>
    db.query("select public.record_payment($1,$2,$3,$4,$5)", [
      a,
      id,
      invoice,
      v,
      JSON.stringify({
        amount,
        payment_date: "2026-09-17",
        method: "TRANSFERENCIA",
        reference: ref,
        notes: "",
      }),
    ]);
  const voidInvoice = (v: number) =>
    db.query("select public.update_invoice($1,$2,$3,$4,null,$5,$6)", [
      a,
      invoice,
      v,
      "2026-09-17",
      "",
      "Corrección administrativa",
    ]);
  try {
    await as(owner);
    await db.query("select public.create_company($1,$2)", [a, "Empresa A"]);
    await db.query("select public.save_customer($1,$2,0,$3)", [
      a,
      customer,
      JSON.stringify({ full_name: "Cliente sintético", status: "active" }),
    ]);
    await db.query("select public.save_estimate($1,$2,0,$3)", [
      a,
      estimate,
      JSON.stringify(input),
    ]);
    await db.query("select public.add_company_member($1,$2)", [
      a,
      "staff@example.test",
    ]);
    await as(other);
    await db.query("select public.create_company($1,$2)", [b, "Empresa B"]);
    await as(owner);
    await t.test(
      "approval requires all three module write permissions",
      async () => {
        await db.query("select public.set_member_access($1,$2,$3,true,$4)", [
          a,
          staff,
          "member",
          JSON.stringify({
            "fin-estimados": ["write"],
            "fin-invoices": ["write"],
          }),
        ]);
        await as(staff);
        await assert.rejects(approval(), /permission_denied/);
        await as(owner);
        assert.equal(
          (await db.query("select * from public.invoices")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "approval produces one invoice/project and no payment",
      async () => {
        invoice = (await approval()).rows[0].id;
        project = (
          await db.query<{ id: string }>("select id from public.projects")
        ).rows[0].id;
        assert.equal((await current()).balance_due, "100.00");
        assert.equal((await current()).paid_amount, "0.00");
        assert.equal(
          (await db.query("select * from public.payments")).rows.length,
          0,
        );
        assert.equal((await approval()).rows[0].id, invoice);
        assert.equal(
          (await db.query("select * from public.projects")).rows.length,
          1,
        );
        const e = (
          await db.query<{ status: string; version: number }>(
            "select status,version from public.estimates where id=$1",
            [estimate],
          )
        ).rows[0];
        assert.equal(e.status, "APROBADO");
        assert.equal(e.version, 2);
        await assert.rejects(
          db.query("select public.save_estimate($1,$2,2,$3)", [
            a,
            estimate,
            JSON.stringify(input),
          ]),
          /approved_estimate_locked/,
        );
      },
    );
    await t.test(
      "direct writes, anonymous and cross-company reads/mutations denied",
      async () => {
        await assert.rejects(
          db.query("update public.invoices set total=1"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("delete from public.payments"),
          /permission denied/,
        );
        await as("", "anon");
        await assert.rejects(approval(), /permission denied/);
        await as(other);
        for (const table of ["invoices", "payments", "projects"])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        await assert.rejects(payment(randomUUID(), 1), /permission_denied/);
        await assert.rejects(projectSave(1, "PRODUCCION"), /permission_denied/);
        await as(owner);
      },
    );
    await t.test(
      "no production or scheduling without an actual payment record",
      async () => {
        await assert.rejects(projectSave(1, "PRODUCCION"), /deposit_required/);
        await assert.rejects(
          projectSave(1, "NUEVO", "2026-10-01"),
          /deposit_required/,
        );
      },
    );
    const pid = randomUUID();
    await t.test(
      "payment exact amount, idempotency and stale/duplicate rejection",
      async () => {
        await payment(pid, 1, "25.10", "TX-1");
        assert.equal((await current()).balance_due, "74.90");
        assert.equal((await current()).version, 2);
        await payment(pid, 1, "25.10", "TX-1");
        assert.equal((await current()).version, 2);
        assert.equal(
          (await db.query("select * from public.payments")).rows.length,
          1,
        );
        await assert.rejects(
          payment(pid, 2, "25.11", "TX-1"),
          /payment_conflict/,
        );
        await assert.rejects(payment(randomUUID(), 1), /record_conflict/);
        await assert.rejects(payment(randomUUID(), 2, "75"), /overpayment/);
        await assert.rejects(
          payment(randomUUID(), 2, "25.10", "TX-1"),
          /duplicate/,
        );
        await assert.rejects(
          payment(randomUUID(), 2, "0.001"),
          /invalid_payment/,
        );
        await assert.rejects(voidInvoice(2), /reverse_payments_first/);
        await projectSave(1, "PRODUCCION", "2026-10-01");
      },
    );
    await t.test(
      "full payment and reversal preserve records and recalculate balance",
      async () => {
        const second = randomUUID();
        await payment(second, 2, "74.90", "TX-2");
        assert.equal((await current()).payment_status, "PAID");
        assert.equal((await current()).balance_due, "0.00");
        await db.query("select public.void_payment($1,$2,1,$3)", [
          a,
          second,
          "Corrección",
        ]);
        assert.equal((await current()).payment_status, "PARTIAL");
        assert.equal((await current()).balance_due, "74.90");
        await db.query("select public.void_payment($1,$2,1,$3)", [
          a,
          second,
          "Reintento",
        ]);
        assert.equal((await current()).version, 4);
        await db.query("select public.void_payment($1,$2,1,$3)", [
          a,
          pid,
          "Corrección",
        ]);
        assert.equal((await current()).payment_status, "UNPAID");
        assert.equal((await current()).balance_due, "100.00");
        assert.equal(
          (await db.query("select * from public.payments where status='VOID'"))
            .rows.length,
          2,
        );
        await assert.rejects(projectSave(2, "INSTALACION"), /deposit_required/);
      },
    );
    await t.test(
      "void preserves document, blocks payment and does not duplicate approval",
      async () => {
        await voidInvoice(5);
        assert.equal((await current()).status, "VOID");
        assert.equal((await current()).balance_due, "0.00");
        await assert.rejects(payment(randomUUID(), 6), /invoice_void/);
        assert.equal((await approval()).rows[0].id, invoice);
        assert.equal(
          (await db.query("select * from public.invoices")).rows.length,
          1,
        );
        const history = await db.query(
          "select * from public.audit_events where entity in ('payments','invoices','projects')",
        );
        assert.ok(history.rows.length >= 10);
      },
    );
    await t.test(
      "activity and read-only financial access do not leak other modules",
      async () => {
        await db.query("select public.set_member_access($1,$2,$3,true,$4)", [
          a,
          staff,
          "member",
          JSON.stringify({ "fin-invoices": ["read"], activity: ["read"] }),
        ]);
        await as(staff);
        assert.equal(
          (await db.query("select * from public.invoices")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from public.projects")).rows.length,
          0,
        );
        await assert.rejects(payment(randomUUID(), 6), /permission_denied/);
        const rows = (
          await db.query<{ entity: string }>(
            "select * from public.activity_feed($1)",
            [a],
          )
        ).rows;
        assert.ok(rows.length);
        assert.ok(
          rows.every((x) => ["invoices", "payments"].includes(x.entity)),
        );
      },
    );
  } finally {
    await db.close();
  }
});
