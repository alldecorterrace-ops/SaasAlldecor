import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("Workers and expenses: full editing, review, receipts and isolation", async (t) => {
  const db = new PGlite(),
    owner = randomUUID(),
    other = randomUUID(),
    staff = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    worker = randomUUID(),
    foreignWorker = randomUUID(),
    expense = randomUUID();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`,
  );
  for (const f of [
    "202609170001_foundation.sql",
    "202609170002_commercial.sql",
    "202609170004_estimates.sql",
    "202609170005_invoices_projects.sql",
    "202609170006_workers_expenses.sql",
    "202609170007_void_expense_receipts.sql",
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
  const workerInput = {
    name: "Trabajador de prueba",
    email: "worker@example.test",
    phone: "",
    job_title: "Instalación",
    team: "Equipo A",
    hourly_rate: "20.15",
    weekly_target: 40,
    active: true,
    notes: "Ficha original",
  };
  const input = {
    project_id: null,
    worker_id: worker,
    expense_date: "2026-09-17",
    category: "Materiales",
    description: "Compra de prueba",
    vendor: "Comercio sintético",
    document_number: "R-001",
    amount: "123.45",
    method: "TARJETA_EXTERNA",
    reimbursement_status: "PENDIENTE",
    status: "PENDIENTE",
    decision_note: "",
  };
  const save = (v: number, data: unknown = input, id = expense) =>
    db.query("select public.save_expense($1,$2,$3,$4)", [
      a,
      id,
      v,
      JSON.stringify(data),
    ]);
  const row = async () =>
    (
      await db.query<{
        version: number;
        status: string;
        amount: string;
        receipt_path: string;
        expense_date: string;
        reimbursement_status: string;
      }>("select * from public.expenses where id=$1", [expense])
    ).rows[0];
  try {
    await as(owner);
    await db.query("select public.create_company($1,$2)", [a, "Empresa A"]);
    await db.query("select public.save_worker($1,$2,0,$3)", [
      a,
      worker,
      JSON.stringify(workerInput),
    ]);
    await db.query("select public.add_company_member($1,$2)", [
      a,
      "staff@example.test",
    ]);
    await as(other);
    await db.query("select public.create_company($1,$2)", [b, "Empresa B"]);
    await db.query("select public.save_worker($1,$2,0,$3)", [
      b,
      foreignWorker,
      JSON.stringify(workerInput),
    ]);
    await as(owner);
    await t.test(
      "create preserves fields, validates worker tenant and duplicate document",
      async () => {
        await assert.rejects(
          save(0, { ...input, worker_id: foreignWorker }),
          /worker_unavailable/,
        );
        await save(0);
        assert.equal((await row()).amount, "123.45");
        await assert.rejects(save(0, input, randomUUID()), /duplicate/);
      },
    );
    await t.test(
      "approval followed by amount/date correction requires renewed review",
      async () => {
        await save(1, {
          ...input,
          status: "APROBADO",
          reimbursement_status: "REEMBOLSADO",
        });
        await save(2, {
          ...input,
          status: "APROBADO",
          reimbursement_status: "REEMBOLSADO",
          expense_date: "2026-09-15",
          amount: "150.20",
        });
        assert.equal((await row()).status, "PENDIENTE");
        assert.equal(
          new Date((await row()).expense_date).toISOString().slice(0, 10),
          "2026-09-15",
        );
        assert.equal((await row()).amount, "150.20");
        assert.equal((await row()).reimbursement_status, "PENDIENTE");
        await assert.rejects(save(2), /record_conflict/);
      },
    );
    const path = `${a}/${expense}/${randomUUID()}.pdf`,
      path2 = `${a}/${expense}/${randomUUID()}.jpg`;
    await t.test(
      "receipt is private, scoped to expense, append-only and invalidates approval",
      async () => {
        const corrected = {
          ...input,
          expense_date: "2026-09-15",
          amount: "150.20",
          status: "APROBADO",
        };
        await save(3, corrected);
        await assert.rejects(
          db.query("select public.set_expense_receipt($1,$2,4,$3)", [
            a,
            expense,
            path,
          ]),
          /invalid_receipt/,
        );
        await db.query(
          "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
          [path],
        );
        await db.query("select public.set_expense_receipt($1,$2,4,$3)", [
          a,
          expense,
          path,
        ]);
        assert.equal((await row()).status, "PENDIENTE");
        assert.equal((await row()).receipt_path, path);
        await db.query(
          "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
          [path2],
        );
        await db.query("select public.set_expense_receipt($1,$2,5,$3)", [
          a,
          expense,
          path2,
        ]);
        await db.exec("delete from storage.objects");
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          2,
        );
        await as(other);
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          0,
        );
        await assert.rejects(
          db.query(
            "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
            [`${a}/${expense}/${randomUUID()}.pdf`],
          ),
          /row-level security/,
        );
        await as(owner);
      },
    );
    await t.test(
      "expense editor can correct data but cannot approve or mark reimbursement paid",
      async () => {
        await db.query("select public.set_member_access($1,$2,$3,true,$4)", [
          a,
          staff,
          "member",
          JSON.stringify({ gastos: ["write"] }),
        ]);
        await as(staff);
        await assert.rejects(
          save(6, { ...input, status: "APROBADO" }),
          /manager_required/,
        );
        await assert.rejects(
          save(6, { ...input, reimbursement_status: "REEMBOLSADO" }),
          /manager_required/,
        );
        // Existing worker reference remains usable without exposing the workers module.
        await save(6, {
          ...input,
          description: "Fecha, descripción y precio editados",
          decision_note: "Recibo corregido; requiere nueva revisión.",
        });
        assert.equal((await row()).version, 7);
        assert.equal(
          (await db.query("select * from public.workers")).rows.length,
          0,
        );
        const history = (
          await db.query<{ after_data: Record<string, unknown> }>(
            "select * from public.record_history($1,$2,$3)",
            [a, "expenses", expense],
          )
        ).rows;
        assert.ok(history.length >= 7);
        assert.ok(history.some((h) => h.after_data.receipt_path === path));
        await assert.rejects(
          db.query("select * from public.record_history($1,$2,$3)", [
            a,
            "workers",
            worker,
          ]),
          /permission_denied/,
        );
        await as(owner);
      },
    );
    await t.test(
      "void requires reason, preserves row and historical attachments",
      async () => {
        await assert.rejects(
          save(7, { ...input, status: "ANULADO" }),
          /reason_required/,
        );
        await save(7, {
          ...input,
          status: "ANULADO",
          decision_note: "Duplicado corregido",
        });
        assert.equal((await row()).status, "ANULADO");
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          2,
        );
        await as(staff);
        await assert.rejects(
          save(8, { ...input, decision_note: "Duplicado corregido" }),
          /manager_required/,
        );
        await assert.rejects(
          db.query("select public.set_expense_receipt($1,$2,8,null)", [a, expense]),
          /manager_required/,
        );
        assert.equal((await row()).version, 8);
        await as(owner);
      },
    );
    await t.test(
      "worker edits preserve records and stale versions fail",
      async () => {
        await db.query("select public.save_worker($1,$2,1,$3)", [
          a,
          worker,
          JSON.stringify({
            ...workerInput,
            active: false,
            hourly_rate: "22.50",
          }),
        ]);
        await assert.rejects(
          db.query("select public.save_worker($1,$2,1,$3)", [
            a,
            worker,
            JSON.stringify(workerInput),
          ]),
          /record_conflict/,
        );
        const rows = (
          await db.query<{ active: boolean }>(
            "select * from public.workers where id=$1",
            [worker],
          )
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].active, false);
        await assert.rejects(
          db.query("update public.workers set hourly_rate=0"),
          /permission denied/,
        );
        await as(other);
        assert.equal(
          (await db.query("select * from public.expenses")).rows.length,
          0,
        );
        await assert.rejects(save(8), /permission_denied/);
        await as("", "anon");
        await assert.rejects(
          db.query("select * from public.expenses"),
          /permission denied/,
        );
        await assert.rejects(save(8), /permission denied/);
      },
    );
  } finally {
    await db.close();
  }
});
