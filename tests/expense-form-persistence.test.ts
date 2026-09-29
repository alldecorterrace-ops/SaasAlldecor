import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { parseExpenseForm } from "../src/lib/operations";

test("individual expense form persists worker associations through payer changes and enforces database boundaries", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
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
  const input = {
    payer: "EMPRESA",
    project_id: "",
    worker_id: worker as string,
    expense_date: "2026-09-29",
    category: "Materiales",
    description: "Synthetic form persistence",
    vendor: "QA form",
    document_number: "QA",
    amount: "1.23",
    method: "OTRO",
    reimbursement_status: "NO_APLICA",
    status: "PENDIENTE",
    decision_note: "",
  };
  const submit = async (
    id: string,
    version: number,
    changes: Partial<typeof input> = {},
  ) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      ...input,
      document_number: id,
      ...changes,
    }))
      form.set(key, value);
    const parsed = parseExpenseForm(form);
    assert(parsed.success, JSON.stringify(parsed.error));
    await db.query("select public.save_expense($1,$2,$3,$4)", [
      a,
      id,
      version,
      JSON.stringify(parsed.data),
    ]);
    return (
      await db.query<{
        worker_id: string | null;
        payer: string;
        reimbursement_status: string;
        amount: string;
        status: string;
        version: number;
        receipt_path: string | null;
      }>("select * from public.expenses where company_id=$1 and id=$2", [a, id])
    ).rows[0];
  };
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    for (const [company, id] of [
      [a, worker],
      [b, foreign],
    ]) {
      await db.query("select public.create_company($1,'QA form')", [company]);
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
          active: true,
          notes: "",
        }),
      ]);
    }
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [a],
    );
    await t.test(
      "company and office cash retain a worker on creation, no-op save and correction",
      async () => {
        for (const payer of ["EMPRESA", "EFECTIVO_EMPRESA"]) {
          const id = randomUUID();
          let row = await submit(id, 0, { payer, status: "APROBADO" });
          assert.equal(row.worker_id, worker);
          assert.equal(row.reimbursement_status, "NO_APLICA");
          row = await submit(id, row.version, { payer, status: "APROBADO" });
          assert.equal(row.worker_id, worker);
          assert.equal(
            row.status,
            "APROBADO",
            "unchanged relation must not spuriously reset review",
          );
          row = await submit(id, row.version, {
            payer,
            status: "APROBADO",
            description: "Synthetic correction",
          });
          assert.equal(row.worker_id, worker);
          assert.equal(row.status, "PENDIENTE");
          assert.equal(row.amount, "1.23");
          assert.equal(row.reimbursement_status, "NO_APLICA");
        }
      },
    );
    await t.test(
      "switching company and pocket payer preserves association but only pocket incurs reimbursement",
      async () => {
        const id = randomUUID();
        let row = await submit(id, 0);
        row = await submit(id, row.version, { payer: "TRABAJADOR" });
        assert.equal(row.worker_id, worker);
        assert.equal(row.reimbursement_status, "PENDIENTE");
        row = await submit(id, row.version, {
          payer: "EFECTIVO_EMPRESA",
          reimbursement_status: "PENDIENTE",
        });
        assert.equal(row.worker_id, worker);
        assert.equal(row.reimbursement_status, "NO_APLICA");
        row = await submit(id, row.version, { worker_id: "" });
        assert.equal(
          row.worker_id,
          null,
          "explicitly clearing an optional association is allowed",
        );
        await assert.rejects(
          submit(id, row.version, { payer: "TRABAJADOR", worker_id: "" }),
          /Selecciona el trabajador/,
        );
        await assert.rejects(
          submit(id, row.version, { worker_id: foreign }),
          /worker_unavailable/,
        );
        await assert.rejects(submit(id, 1), /record_conflict/);
      },
    );
    await t.test(
      "restricted editor retains existing identity and cannot select foreign or hidden workers or reverse payment",
      async () => {
        const id = randomUUID();
        let row = await submit(id, 0);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [a, staff, JSON.stringify({ gastos: ["read", "write"] })],
        );
        await as(staff);
        row = await submit(id, row.version, {
          description: "Allowed correction without worker lookup",
        });
        assert.equal(row.worker_id, worker);
        await assert.rejects(submit(randomUUID(), 0), /worker_unavailable/);
        await assert.rejects(
          submit(id, row.version, { worker_id: foreign }),
          /worker_unavailable/,
        );
        await as(owner);
        row = await submit(id, row.version, {
          payer: "TRABAJADOR",
          status: "APROBADO",
          reimbursement_status: "REEMBOLSADO",
        });
        await assert.rejects(
          submit(id, row.version, { payer: "EMPRESA" }),
          /reimbursed_expense_locked/,
        );
        const preserved = (
          await db.query<{ worker_id: string; reimbursement_status: string }>(
            "select worker_id,reimbursement_status from public.expenses where id=$1",
            [id],
          )
        ).rows[0];
        assert.equal(preserved.worker_id, worker);
        assert.equal(preserved.reimbursement_status, "REEMBOLSADO");
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [a, staff],
        );
        await as(staff);
        await assert.rejects(submit(id, row.version), /permission_denied/);
      },
    );
  } finally {
    await db.close();
  }
});
