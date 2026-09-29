import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  expenseBatchSchema,
  expenseBatchError,
} from "../src/lib/expense-batch";
import { expenseRegisterSchema } from "../src/lib/expense-register";

test("atomic expense batches preserve payer semantics and are replay safe", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    other = randomUUID(),
    staff = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    worker = randomUUID(),
    foreign = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const row = (payer = "EMPRESA") => ({
    id: randomUUID(),
    project_id: null,
    worker_id: null as string | null,
    expense_date: "2026-09-29",
    category: "Materiales",
    description: "Synthetic local expense",
    vendor: "QA batch",
    document_number: randomUUID(),
    amount: "10.01",
    method: "ZELLE",
    payer,
  });
  const save = async (rows: unknown, batch = randomUUID(), company = a) =>
    (
      await db.query<{ ids: string[] }>(
        "select public.save_expense_batch($1,$2,$3) ids",
        [company, batch, JSON.stringify(rows)],
      )
    ).rows[0].ids;
  const count = async () =>
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.expenses where company_id=$1",
        [a],
      )
    ).rows[0].n;
  const footprint = async () =>
    JSON.stringify(
      (
        await db.query(
          "select 'expenses' as kind,md5(string_agg(to_jsonb(e)::text,'' order by id)) as hash from public.expenses e where company_id=$1 union all select 'batches',md5(string_agg(to_jsonb(b)::text,'' order by id)) from public.expense_batches b where company_id=$1 union all select 'audit',md5(string_agg(to_jsonb(a)::text,'' order by id)) from public.audit_events a where company_id=$1",
          [a],
        )
      ).rows,
    );
  try {
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [other, "other@example.test"],
      [staff, "staff@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    for (const [actor, company, w] of [
      [owner, a, worker],
      [other, b, foreign],
    ]) {
      await as(actor);
      await db.query("select public.create_company($1,'Synthetic batch QA')", [
        company,
      ]);
      await db.query("select public.save_worker($1,$2,0,$3)", [
        company,
        w,
        JSON.stringify({
          name: "QA worker",
          email: "worker@example.test",
          phone: "",
          job_title: "",
          team: "",
          hourly_rate: "0",
          weekly_target: 40,
          active: true,
          notes: "",
        }),
      ]);
    }
    await as(owner);
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [a],
    );
    const rows = [
        row(),
        { ...row("EFECTIVO_EMPRESA"), method: "EFECTIVO" },
        { ...row("TRABAJADOR"), worker_id: worker },
      ],
      batch = randomUUID();
    await t.test(
      "company, office cash and worker payer create approved expenses in one transaction",
      async () => {
        assert.deepEqual(
          await save(rows, batch),
          rows.map((r) => r.id),
        );
        assert.equal(await count(), 3);
        const expenses = (
          await db.query<{
            id: string;
            payer: string;
            worker_id: string | null;
            reimbursement_status: string;
            status: string;
            method: string;
            amount: string;
          }>("select * from public.expenses where company_id=$1", [a])
        ).rows;
        assert(
          expenses.every(
            (r) => r.status === "APROBADO" && r.amount === "10.01",
          ),
        );
        assert.equal(
          expenses.find((r) => r.id === rows[0].id)?.worker_id,
          null,
        );
        assert.equal(
          expenses.find((r) => r.id === rows[1].id)?.reimbursement_status,
          "NO_APLICA",
        );
        assert.equal(
          expenses.find((r) => r.id === rows[2].id)?.reimbursement_status,
          "PENDIENTE",
        );
        assert.equal(
          expenses.find((r) => r.id === rows[2].id)?.worker_id,
          worker,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from public.audit_events where company_id=$1 and entity='expenses'",
              [a],
            )
          ).rows[0].n,
          3,
        );
        const register = expenseRegisterSchema.parse(
          (
            await db.query<{ r: unknown }>(
              "select public.expense_register($1,'{}',1,true) r",
              [a],
            )
          ).rows[0].r,
        );
        assert.equal(register.reimbursements, "10.01");
        assert(
          register.rows.some(
            (r) => r.payer === "TRABAJADOR" && r.worker_name === "QA worker",
          ),
        );
        assert(register.rows.some((r) => r.method === "ZELLE"));
      },
    );
    await t.test(
      "lost-response retry and reopening receipt never repeat writes or audit events",
      async () => {
        const before = await footprint();
        assert.deepEqual(
          await save(rows, batch),
          rows.map((r) => r.id),
        );
        assert.equal(await footprint(), before);
        await assert.rejects(
          save([{ ...rows[0], amount: "11.01" }, ...rows.slice(1)], batch),
          /expense_batch_conflict/,
        );
        assert.equal(await footprint(), before);
        assert.deepEqual(
          (
            await db.query<{ expense_ids: string[] }>(
              "select expense_ids from public.expense_batches where company_id=$1 and id=$2",
              [a, batch],
            )
          ).rows[0].expense_ids,
          rows.map((r) => r.id),
        );
      },
    );
    await t.test(
      "late duplicate, invalid worker or foreign project rolls back earlier rows and their audit",
      async () => {
        const before = await footprint();
        const first = row();
        await assert.rejects(
          save([first, { ...row(), document_number: first.document_number }]),
          /expense_batch_row_2:duplicate_expense_document/,
        );
        await assert.rejects(
          save([row(), row("TRABAJADOR")]),
          /expense_batch_row_2:worker_required/,
        );
        await assert.rejects(
          save([row(), { ...row("TRABAJADOR"), worker_id: foreign }]),
          /expense_batch_row_2:worker_unavailable/,
        );
        await assert.rejects(
          save([row(), { ...row(), project_id: randomUUID() }]),
          /expense_batch_row_2:project_unavailable/,
        );
        assert.equal(await footprint(), before);
      },
    );
    await t.test(
      "RPC denies payload bypass, duplicate row IDs, malformed dates and oversized batch",
      async () => {
        for (const payload of [
          [],
          Array.from({ length: 101 }, () => row()),
          [{ ...row(), status: "REEMBOLSADO" }],
          [{ ...row(), amount: "10000000.01" }],
          [{ ...row(), expense_date: "2026-02-30" }],
          [{ ...row(), payer: "OTHER" }],
          [{ ...row(), receipt_path: "foreign" }],
        ])
          await assert.rejects(
            save(payload),
            /invalid_expense_batch|expense_batch_row/,
          );
        const one = row();
        await assert.rejects(
          save([one, { ...one, document_number: randomUUID() }]),
          /expense_batch_row_2/,
        );
        assert.equal(await count(), 3);
      },
    );
    await t.test(
      "non-manager, foreign company, direct table writes and revoked roles cannot submit",
      async () => {
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [
            a,
            staff,
            JSON.stringify({
              gastos: ["read", "write"],
              trabajadores: ["read"],
            }),
          ],
        );
        await as(staff);
        await assert.rejects(save([row()]), /permission_denied/);
        assert.equal(
          (await db.query("select * from public.expense_batches")).rows.length,
          0,
        );
        await assert.rejects(
          db.query(
            "insert into public.expense_batches(company_id,id,actor_id,request_hash,expense_ids) values($1,$2,$3,repeat('a',64),$4)",
            [a, randomUUID(), staff, [rows[0].id]],
          ),
          /permission denied/,
        );
        await as(other);
        await assert.rejects(save(rows, batch, a), /permission_denied/);
        assert.equal(
          (
            await db.query(
              "select * from public.expense_batches where company_id=$1",
              [a],
            )
          ).rows.length,
          0,
        );
        await db.exec("set role anon");
        await assert.rejects(save([row()]), /permission denied/);
        await as(owner);
      },
    );
    await t.test(
      "single-record edits preserve or validate payer and protect already reimbursed money",
      async () => {
        const id = rows[2].id;
        await db.query("select public.save_expense($1,$2,1,$3)", [
          a,
          id,
          JSON.stringify({
            ...rows[2],
            status: "APROBADO",
            reimbursement_status: "REEMBOLSADO",
            decision_note: "Synthetic review",
          }),
        ]);
        for (const change of [
          { amount: "20.01" },
          { worker_id: foreign },
          { payer: "EMPRESA" },
          { status: "ANULADO", decision_note: "Synthetic cancellation" },
          { reimbursement_status: "PENDIENTE" },
        ])
          await assert.rejects(
            db.query("select public.save_expense($1,$2,2,$3)", [
              a,
              id,
              JSON.stringify({
                ...rows[2],
                status: "APROBADO",
                reimbursement_status: "REEMBOLSADO",
                decision_note: "Synthetic review",
                ...change,
              }),
            ]),
            /reimbursed_expense_locked|worker_unavailable/,
          );
        await assert.rejects(
          db.query("select public.save_expense($1,$2,1,$3)", [
            a,
            rows[0].id,
            JSON.stringify({
              ...rows[0],
              payer: "",
              status: "APROBADO",
              reimbursement_status: "NO_APLICA",
              decision_note: "",
            }),
          ]),
          /invalid_payer/,
        );
        assert.equal(
          (
            await db.query<{ amount: string }>(
              "select amount from public.expenses where id=$1",
              [id],
            )
          ).rows[0].amount,
          "10.01",
        );
        // Older clients omitting the additive payer field preserve the stored payer.
        const { payer: _, ...legacy } = rows[0];
        void _;
        await db.query("select public.save_expense($1,$2,1,$3)", [
          a,
          rows[0].id,
          JSON.stringify({
            ...legacy,
            worker_id: null,
            status: "APROBADO",
            reimbursement_status: "NO_APLICA",
            decision_note: "Legacy-compatible",
          }),
        ]);
        assert.equal(
          (
            await db.query<{ payer: string }>(
              "select payer from public.expenses where id=$1",
              [rows[0].id],
            )
          ).rows[0].payer,
          "EMPRESA",
        );
        assert.deepEqual(
          await save(rows, batch),
          rows.map((r) => r.id),
        );
        assert.equal(await count(), 3);
      },
    );
    await t.test(
      "company-paid expenses preserve optional worker without a reimbursement and reject foreign or unavailable workers",
      async () => {
        await as(owner);
        const optionalRows = [
            { ...row(), worker_id: worker },
            { ...row("EFECTIVO_EMPRESA"), worker_id: worker },
          ],
          optionalBatch = randomUUID();
        await save(optionalRows, optionalBatch);
        const selected = await db.query<{
          worker_id: string;
          reimbursement_status: string;
        }>(
          "select worker_id,reimbursement_status from public.expenses where id=any($1::uuid[]) order by id",
          [optionalRows.map((r) => r.id)],
        );
        assert.equal(selected.rows.length, 2);
        for (const saved of selected.rows)
          assert.deepEqual(saved, {
            worker_id: worker,
            reimbursement_status: "NO_APLICA",
          });
        const beforeReplay = await footprint();
        await save(optionalRows, optionalBatch);
        assert.equal(await footprint(), beforeReplay);
        await assert.rejects(
          save([row(), { ...row(), worker_id: foreign }]),
          /worker_unavailable/,
        );
        assert.equal(
          await footprint(),
          beforeReplay,
          "invalid second row must not persist the first row",
        );
        const single = optionalRows[0];
        await db.query("select public.save_expense($1,$2,1,$3)", [
          a,
          single.id,
          JSON.stringify({
            ...single,
            payer: "TRABAJADOR",
            status: "APROBADO",
            reimbursement_status: "NO_APLICA",
            decision_note: "",
          }),
        ]);
        assert.deepEqual(
          (
            await db.query(
              "select worker_id,payer,reimbursement_status,status,amount::text from public.expenses where id=$1",
              [single.id],
            )
          ).rows[0],
          {
            worker_id: worker,
            payer: "TRABAJADOR",
            reimbursement_status: "PENDIENTE",
            status: "PENDIENTE",
            amount: "10.01",
          },
        );
        await db.query("select public.save_expense($1,$2,2,$3)", [
          a,
          single.id,
          JSON.stringify({
            ...single,
            status: "PENDIENTE",
            reimbursement_status: "PENDIENTE",
            decision_note: "",
          }),
        ]);
        assert.deepEqual(
          (
            await db.query(
              "select worker_id,payer,reimbursement_status,amount::text from public.expenses where id=$1",
              [single.id],
            )
          ).rows[0],
          {
            worker_id: worker,
            payer: "EMPRESA",
            reimbursement_status: "NO_APLICA",
            amount: "10.01",
          },
        );
        await db.exec("reset role");
        await db.query("update public.workers set active=false where id=$1", [
          worker,
        ]);
        await as(owner);
        await assert.rejects(
          save([{ ...row("EFECTIVO_EMPRESA"), worker_id: worker }]),
          /worker_unavailable/,
        );
        await db.exec("reset role");
        await db.query("update public.workers set active=true where id=$1", [
          worker,
        ]);
        await db.query(
          "update public.memberships set permissions=$1 where company_id=$2 and user_id=$3",
          [JSON.stringify({ gastos: ["read", "write"] }), a, staff],
        );
        await as(staff);
        const denied = {
          ...row(),
          worker_id: worker,
          status: "PENDIENTE",
          reimbursement_status: "NO_APLICA",
          decision_note: "",
        };
        await assert.rejects(
          db.query("select public.save_expense($1,$2,0,$3)", [
            a,
            denied.id,
            JSON.stringify(denied),
          ]),
          /worker_unavailable/,
        );
        await as(owner);
      },
    );
  } finally {
    await db.close();
  }
});
test("batch form validates source limits and explains failures without leaking SQL details", () => {
  const row = {
    id: randomUUID(),
    project_id: null,
    worker_id: null,
    expense_date: "2026-09-29",
    category: "Materiales",
    description: "",
    vendor: "QA",
    document_number: "1",
    amount: "10.01",
    method: "ZELLE",
    payer: "EMPRESA",
  };
  assert(expenseBatchSchema.safeParse([row]).success);
  assert(
    !expenseBatchSchema.safeParse([{ ...row, payer: "TRABAJADOR" }]).success,
  );
  assert(
    !expenseBatchSchema.safeParse([{ ...row, amount: "10000000.01" }]).success,
  );
  assert(!expenseBatchSchema.safeParse([row, row]).success);
  assert.match(
    expenseBatchError("expense_batch_row_2:duplicate_expense_document"),
    /Fila 2.*No se guardó ninguna/,
  );
  assert.match(
    expenseBatchError("SQL detail with private data"),
    /No se pudo confirmar/,
  );
  assert(
    !expenseBatchError("SQL detail with private data").includes("private data"),
  );
});
