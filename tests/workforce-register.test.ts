import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { expenseRegisterSchema, expenseCsv } from "../src/lib/expense-register";

test("Unified expense register preserves source, costs, archive, scopes and read-only semantics", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  const worker = { user: randomUUID(), id: randomUUID() },
    office = { user: randomUUID(), id: randomUUID() },
    foreman = { user: randomUUID(), id: randomUUID() };
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const act = (
    id: string,
    version: number,
    restore = false,
    request = randomUUID(),
    reason = "Synthetic recoverable archive",
    company = a,
  ) =>
    db.query<{ data: Record<string, unknown> }>(
      "select archive_workforce_expense($1,$2,$3,$4,$5,$6) data",
      [company, request, id, version, restore, reason],
    );
  let project: string;
  const create = async (status = "SUBMITTED") => {
    const id: string = randomUUID();
    await as(worker.user);
    const receipt = (
      await db.query<{ id: string }>(
        "select (prepare_workforce_receipt($1,$2,$3,500,'png','Synthetic.png')).id",
        [a, id, "a".repeat(64)],
      )
    ).rows[0].id;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('workforce-receipts',$1)",
      [`${a}/${id}/${receipt}.png`],
    );
    await db.query(
      "select submit_workforce_expense($1,$2,$3,$4,now(),12.34,'MATERIALS','Synthetic archive fixture',$5,'propio')",
      [a, randomUUID(), id, project, receipt],
    );
    if (status !== "SUBMITTED") {
      await db.exec("reset role");
      await db.query(
        "update workforce_expenses set status=$2,correction_note=case when $2='NEEDS_CORRECTION' then 'Synthetic returned fixture' end,returned_at=case when $2='NEEDS_CORRECTION' then now() end where id=$1",
        [id, status],
      );
    }
    return { id, receipt };
  };
  try {
    for (const u of [owner, worker.user, office.user, foreman.user])
      await db.query("insert into auth.users values($1,$2,now())", [
        u,
        `${u}@example.test`,
      ]);
    await as(owner);
    await db.query(
      "select create_company($1,'Archive A'),create_company($2,'Archive B')",
      [a, b],
    );
    for (const who of [worker, office, foreman]) {
      await db.query("select add_company_member($1,$2)", [
        a,
        `${who.user}@example.test`,
      ]);
      await db.query("select set_member_access($1,$2,'member',true,$3)", [
        a,
        who.user,
        JSON.stringify({ horasfix: ["write"] }),
      ]);
      await db.query("select save_worker($1,$2,0,$3)", [
        a,
        who.id,
        JSON.stringify({
          name: "Synthetic",
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
      await db.query("select link_worker_login($1,$2,1,$3)", [
        a,
        who.id,
        `${who.user}@example.test`,
      ]);
      await db.query(
        "select configure_workforce($1,$2,$3,0,$4,null,true,'Synthetic archive test')",
        [
          a,
          randomUUID(),
          who.id,
          who === worker ? "WORKER" : who === office ? "OFFICE" : "FOREMAN",
        ],
      );
    }
    const customer = randomUUID(),
      estimate = randomUUID();
    await db.query("select save_customer($1,$2,0,$3)", [
      a,
      customer,
      JSON.stringify({ full_name: "Synthetic", email: "", status: "active" }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
      a,
      estimate,
      JSON.stringify({
        customer_id: customer,
        estimate_date: "2026-09-30",
        valid_until: null,
        status: "BORRADOR",
        notes: "",
        discount: "0",
        taxes: "0",
        items: [{ ...emptyItem, name: "QA", unit_price: "100" }],
      }),
    ]);
    await db.query(
      "select approve_estimate($1,$2,1,'2026-09-30','Synthetic project','Test')",
      [a, estimate],
    );
    project = (
      await db.query<{ id: string }>(
        "select id from projects where company_id=$1 and estimate_id=$2",
        [a, estimate],
      )
    ).rows[0].id;
    await db.query(
      "select save_workforce_assignment($1,$2,$3,0,$4,$5,now()-interval '1 day',null,true,'Synthetic test')",
      [a, randomUUID(), randomUUID(), worker.id, project],
    );

    const read = async (filters = {}, company = a, exp = false, page = 1) =>
      expenseRegisterSchema.parse(
        (
          await db.query<{ data: unknown }>(
            "select expense_register($1,$2,$3,$4) data",
            [company, JSON.stringify(filters), page, exp],
          )
        ).rows[0].data,
      );
    await as(owner);
    const pending = await create(),
      rejected = await create("REJECTED"),
      first = await create("FOREMAN_APPROVED");
    const approved = await create("OFFICE_APPROVED"),
      companyPaid = await create("OFFICE_APPROVED");
    await db.exec("reset role");
    await db.query(
      "update workforce_expenses set pay_method='empresa' where id=$1",
      [companyPaid.id],
    );
    await as(owner);
    const admin = randomUUID();
    const save = (id: string) =>
      db.query("select save_expense($1,$2,0,$3)", [
        a,
        id,
        JSON.stringify({
          project_id: project,
          worker_id: worker.id,
          expense_date: "2026-09-30",
          category: "Materiales",
          description: "Administrative cost",
          vendor: "Synthetic vendor",
          document_number: "",
          amount: "20.00",
          method: "EFECTIVO",
          reimbursement_status: "PENDIENTE",
          status: "APROBADO",
          decision_note: "",
          payer: "TRABAJADOR",
        }),
      ]);
    await save(admin);
    await t.test(
      "approved worker costs appear once alongside administrative costs without inventing reimbursements",
      async () => {
        const result = await read();
        assert.equal(result.count, 3);
        assert.equal(result.total, "44.68");
        assert.equal(result.active, "44.68");
        assert.equal(result.reimbursements, "32.34");
        assert.equal(result.workforce_unconfirmed, "12.34");
        assert.deepEqual(
          result.rows
            .filter((r) => r.source === "WORKFORCE")
            .map((r) => r.id)
            .sort(),
          [approved.id, companyPaid.id].sort(),
        );
        assert(
          !result.rows.some((r) =>
            [pending.id, rejected.id, first.id].includes(r.id),
          ),
        );
        assert.equal((await read({ source: "WORKFORCE" })).total, "24.68");
        assert.equal((await read({ source: "ADMINISTRATIVE" })).total, "20.00");
        assert.equal(
          (await read({ payer: "TRABAJADOR", source: "WORKFORCE" })).total,
          "12.34",
        );
        assert.equal(
          (await read({ category: "Materiales", source: "WORKFORCE" })).count,
          2,
        );
        assert.equal((await read({ q: "Synthetic archive fixture" })).count, 2);
        const csv = expenseCsv(await read({}, a, true));
        assert(csv.includes('"Origen"'));
        assert(csv.includes("Trabajador · Workforce"));
        assert(csv.includes("PENDIENTE"));
        await assert.rejects(
          read({ source: "labor" }),
          /invalid_expense_filters/,
        );
      },
    );
    await t.test(
      "archive removes active cost and preserves a void projection only for managers; restore and general allocation stay linked",
      async () => {
        await act(approved.id, 1);
        assert.equal((await read()).active, "32.34");
        const all = await read({ status: "TODOS", source: "WORKFORCE" });
        assert.equal(all.count, 2);
        assert.equal(all.total, "24.68");
        assert.equal(all.active, "12.34");
        assert.equal(
          all.rows.find((r) => r.id === approved.id)?.status,
          "ANULADO",
        );
        assert.equal(
          (await read({ status: "ANULADO", source: "WORKFORCE" })).count,
          1,
        );
        await as(worker.user);
        await db.exec("reset role");
        await db.query(
          "update memberships set permissions=$3 where company_id=$1 and user_id=$2",
          [
            a,
            worker.user,
            JSON.stringify({
              horasfix: ["read"],
              gastos: ["read"],
              trabajadores: ["read"],
              "fin-proyectos": ["read"],
              clientes: ["read"],
            }),
          ],
        );
        await as(worker.user);
        assert.equal(
          (await read({ status: "TODOS", source: "WORKFORCE" })).count,
          1,
        );
        await as(owner);
        await act(approved.id, 2, true);
        assert.equal((await read()).active, "44.68");
        await db.query(
          "select decide_workforce_expense($1,$2,$3,3,'RECLASSIFY_GENERAL','Synthetic general cost')",
          [a, randomUUID(), approved.id],
        );
        const general = (await read({ source: "WORKFORCE" })).rows.find(
          (r) => r.id === approved.id,
        )!;
        assert.equal(general.project_id, null);
        assert.equal(general.customer_id, null);
        assert.equal((await read({ project })).total, "32.34");
      },
    );
    await t.test(
      "existing module and worker scope still limit register and export; hidden names cannot match",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update memberships set permissions=$3 where company_id=$1 and user_id=$2",
          [
            a,
            worker.user,
            JSON.stringify({ gastos: ["read"], horasfix: ["read"] }),
          ],
        );
        await as(worker.user);
        const result = await read();
        assert.equal(result.count, 3);
        assert(
          result.rows.every(
            (r) =>
              r.worker_name === null &&
              r.project_name === null &&
              r.customer_name === null,
          ),
        );
        assert.equal((await read({ q: "Synthetic project" })).count, 0);
        await assert.rejects(read({ worker: worker.id }), /permission_denied/);
        await assert.rejects(read({}, b), /permission_denied/);
        await db.exec("reset role");
        await db.query(
          "update memberships set permissions=$3 where company_id=$1 and user_id=$2",
          [a, worker.user, JSON.stringify({ gastos: ["read"] })],
        );
        await as(worker.user);
        assert.equal((await read()).count, 1);
        assert.equal((await read({ source: "WORKFORCE" }, a, true)).count, 0);
        await db.exec("reset role");
        await db.query(
          "update memberships set permissions='{}' where company_id=$1 and user_id=$2",
          [a, worker.user],
        );
        await as(worker.user);
        await assert.rejects(read(), /permission_denied/);
      },
    );
    await t.test(
      "company-local dates and stable source identity handle pages without treating cost as payment",
      async () => {
        await as(owner);
        await db.exec("reset role");
        await db.query(
          "update companies set timezone='America/New_York' where id=$1",
          [a],
        );
        await db.query(
          "update workforce_expenses set expense_at='2026-09-01T02:00:00Z' where id=$1",
          [companyPaid.id],
        );
        await as(owner);
        const dated = await read({
          source: "WORKFORCE",
          from: "2026-08-31",
          to: "2026-08-31",
        });
        assert.equal(dated.count, 1);
        assert.equal(dated.rows[0].date, "2026-08-31");
        await save(approved.id); // Same UUID is valid in two different origin namespaces.
        const result = await read({}, a, true);
        assert.equal(result.count, 4);
        assert.equal(result.rows.filter((r) => r.id === approved.id).length, 2);
        await db.exec("reset role");
        const before = await db.query(
          "select (select count(*) from expenses)::int as costs,(select count(*) from payments)::int as payments,(select count(*) from workforce_expenses)::int as wf,(select count(*) from app_private.workforce_expense_requests)::int as requests",
        );
        await as(owner);
        for (let n = 0; n < 3; n++) await read({}, a, true, 999);
        await db.exec("reset role");
        const after = await db.query(
          "select (select count(*) from expenses)::int as costs,(select count(*) from payments)::int as payments,(select count(*) from workforce_expenses)::int as wf,(select count(*) from app_private.workforce_expense_requests)::int as requests",
        );
        assert.deepEqual(after.rows, before.rows);
      },
    );
  } finally {
    await db.close();
  }
});
