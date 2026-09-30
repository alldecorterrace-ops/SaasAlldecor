import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { workforceCorrectionSchema } from "../src/lib/workforce-expenses";

test("Manual correction validates the reason, amount and payer", () => {
  const valid = {
    id: randomUUID(),
    request: randomUUID(),
    version: 1,
    project_id: "GENERAL",
    expense_date: "2026-09-30",
    amount: "20000",
    category: "MATERIALS",
    description: "QA",
    pay_method: "empresa",
    receipt_id: randomUUID(),
    reason: "Visual review of synthetic receipt",
  };
  assert(workforceCorrectionSchema.safeParse(valid).success);
  for (const change of [
    { amount: "20000.01" },
    { amount: "NaN" },
    { amount: "0" },
    { reason: "    " },
    { expense_date: "2026-02-31" },
    { pay_method: "" },
    { project_id: "" },
  ])
    assert(
      !workforceCorrectionSchema.safeParse({ ...valid, ...change }).success,
    );
});

test("Manual correction preserves evidence, resets decisions and has no payment effect", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  const worker = { user: randomUUID(), id: randomUUID() },
    foreman = { user: randomUUID(), id: randomUUID() },
    office = { user: randomUUID(), id: randomUUID() };
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const row = async (id: string) => {
    await db.exec("reset role");
    return (
      await db.query<Record<string, unknown>>(
        "select * from workforce_expenses where id=$1",
        [id],
      )
    ).rows[0];
  };
  let project: string, foreignProject: string, day: string;
  const projectFor = async (company: string) => {
    const customer = randomUUID(),
      estimate = randomUUID();
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({ full_name: "Synthetic", email: "", status: "active" }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
      company,
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
      "select approve_estimate($1,$2,1,'2026-09-30','Synthetic project','Local test')",
      [company, estimate],
    );
    return (
      await db.query<{ id: string }>(
        "select id from projects where company_id=$1 and estimate_id=$2",
        [company, estimate],
      )
    ).rows[0].id;
  };
  const create = async () => {
    const id = randomUUID();
    await as(worker.user);
    const receipt = (
      await db.query<{ id: string }>(
        "select (prepare_workforce_receipt($1,$2,$3,33,'png','QA.png')).id",
        [a, id, "a".repeat(64)],
      )
    ).rows[0].id;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('workforce-receipts',$1)",
      [`${a}/${id}/${receipt}.png`],
    );
    await db.query(
      "select submit_workforce_expense($1,$2,$3,$4,now(),12.34,'MATERIALS','Synthetic original',$5,'propio')",
      [a, randomUUID(), id, project, receipt],
    );
    return { id, receipt };
  };
  const correct = async (
    e: { id: string; receipt: string },
    version = 1,
    request = randomUUID(),
    overrides: Record<string, unknown> = {},
  ) => {
    const v = {
      project,
      general: false,
      date: day,
      amount: "20.01",
      category: "TOOLS",
      description: "Synthetic corrected",
      payer: "empresa",
      receipt: e.receipt,
      reason: "Synthetic visual correction",
      ...overrides,
    };
    return db.query<{ data: { version: number; status: string } }>(
      "select correct_workforce_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) data",
      [
        a,
        request,
        e.id,
        version,
        v.project,
        v.general,
        v.date,
        v.amount,
        v.category,
        v.description,
        v.payer,
        v.receipt,
        v.reason,
      ],
    );
  };
  try {
    for (const user of [owner, worker.user, foreman.user, office.user])
      await db.query("insert into auth.users values($1,$2,now())", [
        user,
        `${user}@example.test`,
      ]);
    await as(owner);
    await db.query(
      "select create_company($1,'Manual A'),create_company($2,'Manual B')",
      [a, b],
    );
    for (const who of [worker, foreman, office]) {
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
    }
    await db.query(
      "select configure_workforce($1,$2,$3,0,'FOREMAN',null,true,'Synthetic test')",
      [a, randomUUID(), foreman.id],
    );
    await db.query(
      "select configure_workforce($1,$2,$3,0,'WORKER',$4,true,'Synthetic test')",
      [a, randomUUID(), worker.id, foreman.id],
    );
    await db.query(
      "select configure_workforce($1,$2,$3,0,'OFFICE',null,true,'Synthetic test')",
      [a, randomUUID(), office.id],
    );
    project = await projectFor(a);
    foreignProject = await projectFor(b);
    day = (
      await db.query<{ local_day: string }>(
        "select (now() at time zone timezone)::date::text as local_day from companies where id=$1",
        [a],
      )
    ).rows[0].local_day;
    await db.query(
      "select save_workforce_assignment($1,$2,$3,0,$4,$5,now()-interval '2 days',null,true,'Synthetic test')",
      [a, randomUUID(), randomUUID(), worker.id, project],
    );
    await t.test(
      "worker, foreman and a different tenant cannot correct",
      async () => {
        const e = await create(),
          original = await row(e.id);
        for (const u of [worker.user, foreman.user]) {
          await as(u);
          await assert.rejects(correct(e), /expense_forbidden/);
        }
        await as(owner);
        await assert.rejects(
          db.query(
            "select correct_workforce_expense($1,$2,$3,1,$4,false,$5,1,$6,$7,$8,$9,$10)",
            [
              b,
              randomUUID(),
              e.id,
              foreignProject,
              day,
              "TOOLS",
              "QA",
              "empresa",
              e.receipt,
              "Synthetic review",
            ],
          ),
          /expense_forbidden/,
        );
        assert.deepEqual(await row(e.id), original);
      },
    );
    await t.test(
      "invalid input and mismatched evidence leave the expense unchanged",
      async () => {
        const e = await create(),
          original = await row(e.id);
        for (const change of [
          { reason: "bad" },
          { amount: "20000.01" },
          { amount: "NaN" },
          { date: "2100-01-01" },
          { payer: "invalid" },
        ]) {
          await as(office.user);
          await assert.rejects(
            correct(e, 1, randomUUID(), change),
            /invalid_workforce_correction/,
          );
        }
        await as(office.user);
        await assert.rejects(
          correct(e, 1, randomUUID(), { project: foreignProject }),
          /project_unavailable/,
        );
        await assert.rejects(
          correct(e, 1, randomUUID(), { receipt: randomUUID() }),
          /record_conflict/,
        );
        assert.deepEqual(await row(e.id), original);
      },
    );
    await t.test(
      "correction records the actual receipt, actor, reason and local noon",
      async () => {
        const e = await create();
        await as(office.user);
        await correct(e);
        const saved = await row(e.id);
        assert.equal(saved.amount, "20.01");
        assert.equal(saved.worker_id, worker.id);
        assert.equal(saved.receipt_id, e.receipt);
        assert.equal(saved.status, "SUBMITTED");
        assert.equal(saved.version, 2);
        assert.equal(saved.admin_reviewed_by, office.user);
        assert.equal(saved.admin_review_status, "REVIEWED");
        assert.equal(saved.admin_review_note, "Synthetic visual correction");
        assert.equal(saved.pay_method, "empresa");
        assert.equal(saved.pay_method_set_by, office.user);
        const snapshot = saved.review_snapshot as Record<string, unknown>;
        assert.equal(snapshot.receipt, e.receipt);
        assert.equal(snapshot.receipt_sha256, "a".repeat(64));
        assert.equal(snapshot.amount, 20.01);
        assert.equal(snapshot.mode, "manual-admin-v1");
        assert.equal(
          (
            await db.query<{ local_hour: number }>(
              "select extract(hour from expense_at at time zone 'America/New_York')::int as local_hour from workforce_expenses where id=$1",
              [e.id],
            )
          ).rows[0].local_hour,
          12,
        );
      },
    );
    await t.test(
      "after the first decision, correction resets both approval stages",
      async () => {
        const e = await create();
        await as(foreman.user);
        await db.query(
          "select decide_workforce_expense($1,$2,$3,1,'APPROVE','Synthetic foreman')",
          [a, randomUUID(), e.id],
        );
        await as(office.user);
        const request = randomUUID();
        await correct(e, 2, request);
        await correct(e, 2, request);
        await assert.rejects(
          correct(e, 2, request, { amount: "22" }),
          /request_conflict/,
        );
        await assert.rejects(correct(e, 2), /record_conflict/);
        const saved = await row(e.id);
        assert.equal(saved.version, 3);
        assert.equal(saved.status, "SUBMITTED");
        for (const k of [
          "foreman_by",
          "foreman_at",
          "foreman_worker_id",
          "foreman_reason",
          "office_by",
          "office_at",
          "office_worker_id",
          "office_reason",
        ])
          assert.equal(saved[k], null);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from audit_events where entity='workforce_expenses' and entity_id=$1",
              [e.id],
            )
          ).rows[0].n,
          3,
        );
      },
    );
    await t.test(
      "approved and rejected expenses cannot be corrected",
      async () => {
        for (const approved of [true, false]) {
          const e = await create();
          await as(foreman.user);
          await db.query(
            "select decide_workforce_expense($1,$2,$3,1,$4,'Synthetic decision')",
            [a, randomUUID(), e.id, approved ? "APPROVE" : "REJECT"],
          );
          if (approved) {
            await as(office.user);
            await db.query(
              "select decide_workforce_expense($1,$2,$3,2,'APPROVE','Synthetic office')",
              [a, randomUUID(), e.id],
            );
          }
          const saved = await row(e.id);
          await as(office.user);
          await assert.rejects(
            correct(e, saved.version as number),
            /expense_correction_state/,
          );
          assert.deepEqual(await row(e.id), saved);
        }
      },
    );
    await t.test(
      "general allocation preserves the original project and permits the source manual limit",
      async () => {
        const e = await create();
        await as(owner);
        await correct(e, 1, randomUUID(), {
          project: null,
          general: true,
          amount: "20000",
        });
        const saved = await row(e.id);
        assert.equal(saved.project_id, project);
        assert.equal(saved.amount, "20000.00");
        assert.equal(saved.allocation, "GENERAL");
        assert.equal(saved.general_by, owner);
        assert.equal(saved.general_reason, "Synthetic visual correction");
      },
    );
    await t.test(
      "revocation is checked before replay and cannot create partial audit effects",
      async () => {
        const e = await create();
        await as(office.user);
        const request = randomUUID();
        await correct(e, 1, request);
        const saved = await row(e.id);
        await as(owner);
        await db.query(
          "select configure_workforce($1,$2,$3,1,'WORKER',null,true,'Synthetic revocation')",
          [a, randomUUID(), office.id],
        );
        await as(office.user);
        await assert.rejects(correct(e, 1, request), /expense_forbidden/);
        assert.deepEqual(await row(e.id), saved);
      },
    );
    await db.exec("reset role");
    for (const table of ["expenses", "payments", "time_entries"])
      assert.equal(
        (await db.query<{ n: number }>(`select count(*)::int n from ${table}`))
          .rows[0].n,
        0,
      );
  } finally {
    await db.close();
  }
});
