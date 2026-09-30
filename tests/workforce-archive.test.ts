import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { workforceArchiveSchema } from "../src/lib/workforce-expenses";

test("Archive reason and operation are explicit", () => {
  const v = {
    id: randomUUID(),
    request: randomUUID(),
    version: 1,
    operation: "archive",
    reason: "Synthetic reason",
  };
  assert(workforceArchiveSchema.safeParse(v).success);
  for (const d of [
    { reason: "    " },
    { reason: "x".repeat(501) },
    { operation: "delete" },
    { version: 0 },
    { request: "" },
  ])
    assert(!workforceArchiveSchema.safeParse({ ...v, ...d }).success);
});

test("Workforce recoverable archive preserves evidence and enforces tenant and role boundaries", async (t) => {
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
  const row = async (id: string) => {
    await db.exec("reset role");
    return (
      await db.query<Record<string, unknown>>(
        "select * from workforce_expenses where id=$1",
        [id],
      )
    ).rows[0];
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
    const id = randomUUID();
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
    await t.test(
      "only a company manager can archive; office, worker, foreman and foreign company are denied",
      async () => {
        const e = await create();
        for (const user of [worker.user, office.user, foreman.user]) {
          await as(user);
          await assert.rejects(act(e.id, 1), /expense_archive_forbidden/);
        }
        await as(owner);
        await assert.rejects(
          act(e.id, 1, false, randomUUID(), "Synthetic reason", b),
          /expense_archive_forbidden/,
        );
        assert.equal((await row(e.id)).version, 1);
      },
    );
    await t.test(
      "archive and restore retain every operational field across all five prior statuses",
      async () => {
        for (const status of [
          "SUBMITTED",
          "FOREMAN_APPROVED",
          "OFFICE_APPROVED",
          "REJECTED",
          "NEEDS_CORRECTION",
        ]) {
          const e = await create(status);
          const before = await row(e.id);
          await as(owner);
          const req = randomUUID();
          const first = (await act(e.id, 1, false, req)).rows[0].data;
          assert.equal(first.status, "ARCHIVED");
          assert.equal(first.version, 2);
          assert.deepEqual(
            (await act(e.id, 1, false, req)).rows[0].data,
            first,
          );
          await assert.rejects(
            act(e.id, 1, false, req, "Changed reason"),
            /request_conflict/,
          );
          await assert.rejects(act(e.id, 1), /record_conflict/);
          await assert.rejects(act(e.id, 2), /expense_archive_state/);
          const archived = await row(e.id);
          assert.equal(archived.archived_from_status, status);
          assert.equal(archived.archived_by, owner);
          await as(owner);
          const restored = (await act(e.id, 2, true)).rows[0].data;
          assert.equal(restored.status, status);
          assert.equal(restored.version, 3);
          const after = await row(e.id);
          const metadata = new Set([
            "status",
            "version",
            "updated_at",
            "archived_from_status",
            "archived_by",
            "archived_at",
            "archive_reason",
            "restored_by",
            "restored_at",
            "restore_reason",
          ]);
          for (const [k, v] of Object.entries(before))
            if (!metadata.has(k))
              assert.deepEqual(after[k], v, `${status}: ${k}`);
          assert.equal(
            (
              await db.query<{ n: number }>(
                "select count(*)::int n from storage.objects where name=$1",
                [`${a}/${e.id}/${e.receipt}.png`],
              )
            ).rows[0].n,
            1,
          );
          assert.equal(
            (
              await db.query<{ n: number }>(
                "select count(*)::int n from audit_events where entity='workforce_expenses' and entity_id=$1",
                [e.id],
              )
            ).rows[0].n,
            3 + (status === "SUBMITTED" ? 0 : 1),
          );
        }
      },
    );
    await t.test(
      "archived expenses, names, current and historic receipts, storage and audit are private to managers",
      async () => {
        const e = await create();
        await as(owner);
        await act(e.id, 1);
        for (const user of [worker.user, office.user, foreman.user]) {
          await as(user);
          assert.equal(
            (
              await db.query("select * from workforce_expenses where id=$1", [
                e.id,
              ])
            ).rows.length,
            0,
          );
          await assert.rejects(
            db.query("select workforce_expense_receipt($1,$2)", [a, e.id]),
            /expense_forbidden/,
          );
          await assert.rejects(
            db.query("select workforce_expense_receipt_version($1,$2,$3)", [
              a,
              e.id,
              e.receipt,
            ]),
            /expense_forbidden/,
          );
          assert.deepEqual(
            (
              await db.query<{ data: unknown }>(
                "select workforce_receipt_versions($1,array[$2::uuid]) data",
                [a, e.id],
              )
            ).rows[0].data,
            [],
          );
          assert.deepEqual(
            (
              await db.query<{ data: unknown }>(
                "select workforce_expense_names($1,array[$2::uuid]) data",
                [a, e.id],
              )
            ).rows[0].data,
            [],
          );
          assert.equal(
            (
              await db.query(
                "select * from workforce_receipt_uploads where expense_id=$1",
                [e.id],
              )
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await db.query(
                "select * from record_history($1,'workforce_expenses',$2)",
                [a, e.id],
              )
            ).rows.length,
            0,
          );
          await assert.rejects(
            db.query(
              "select prepare_workforce_receipt($1,$2,$3,500,'png','Synthetic.png')",
              [a, e.id, "a".repeat(64)],
            ),
            /expense_forbidden/,
          );
          assert.equal(
            (
              await db.query("select * from storage.objects where name=$1", [
                `${a}/${e.id}/${e.receipt}.png`,
              ])
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await db.query(
                "select * from audit_events where entity='workforce_expenses' and entity_id=$1",
                [e.id],
              )
            ).rows.length,
            0,
          );
        }
        await as(owner);
        assert.equal(
          (
            await db.query("select * from workforce_expenses where id=$1", [
              e.id,
            ])
          ).rows.length,
          1,
        );
        await db.query("select workforce_expense_receipt($1,$2)", [a, e.id]);
        await act(e.id, 2, true);
        await as(worker.user);
        assert.equal(
          (
            await db.query("select * from workforce_expenses where id=$1", [
              e.id,
            ])
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "cached correction, approval and replacement cannot mutate archived expenses",
      async () => {
        const e = await create();
        await as(owner);
        await act(e.id, 1);
        await as(office.user);
        await assert.rejects(
          db.query(
            "select decide_workforce_expense($1,$2,$3,2,'APPROVE','QA reason')",
            [a, randomUUID(), e.id],
          ),
          /expense_state_invalid/,
        );
        await assert.rejects(
          db.query(
            "select correct_workforce_expense($1,$2,$3,2,$4,false,current_date,12.34,'TOOLS','QA','empresa',$5,'QA correction')",
            [a, randomUUID(), e.id, project, e.receipt],
          ),
          /expense_correction_state/,
        );
        await assert.rejects(
          db.query(
            "select prepare_workforce_receipt($1,$2,$3,500,'png','Other.png')",
            [a, e.id, "b".repeat(64)],
          ),
          /expense_forbidden/,
        );
        assert.equal((await row(e.id)).version, 2);
      },
    );
    await t.test(
      "review snapshot and both approval actors survive restoration",
      async () => {
        const e = await create();
        await as(owner);
        await db.query(
          "select configure_workforce($1,$2,$3,1,'WORKER',$4,true,'Synthetic supervisor')",
          [a, randomUUID(), worker.id, foreman.id],
        );
        await as(office.user);
        await db.query(
          "select correct_workforce_expense($1,$2,$3,1,$4,false,current_date,12.34,'MATERIALS','Synthetic reviewed','propio',$5,'Synthetic visual review')",
          [a, randomUUID(), e.id, project, e.receipt],
        );
        await as(foreman.user);
        await db.query(
          "select decide_workforce_expense($1,$2,$3,2,'APPROVE','Synthetic foreman')",
          [a, randomUUID(), e.id],
        );
        await as(office.user);
        await db.query(
          "select decide_workforce_expense($1,$2,$3,3,'APPROVE','Synthetic office')",
          [a, randomUUID(), e.id],
        );
        const before = await row(e.id);
        assert.equal(before.admin_review_status, "REVIEWED");
        assert.equal(before.foreman_by, foreman.user);
        assert.equal(before.office_by, office.user);
        await as(owner);
        await act(e.id, 4);
        await act(e.id, 5, true);
        const after = await row(e.id);
        for (const k of [
          "review_snapshot",
          "admin_reviewed_at",
          "admin_reviewed_by",
          "admin_review_note",
          "foreman_by",
          "foreman_at",
          "foreman_reason",
          "office_by",
          "office_at",
          "office_reason",
          "receipt_id",
          "amount",
          "pay_method",
        ])
          assert.deepEqual(after[k], before[k], k);
      },
    );
    await t.test(
      "revoked administrator cannot replay a previously accepted archive request",
      async () => {
        const e = await create();
        await as(owner);
        await db.query("select set_member_access($1,$2,'admin',true,'{}')", [
          a,
          office.user,
        ]);
        await as(office.user);
        const req = randomUUID();
        await act(e.id, 1, false, req);
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          a,
          office.user,
          JSON.stringify({ horasfix: ["write"] }),
        ]);
        await as(office.user);
        await assert.rejects(
          act(e.id, 1, false, req),
          /expense_archive_forbidden/,
        );
      },
    );
    await t.test(
      "repeated cycles and invalid reasons are audited without financial effects or direct table writes",
      async () => {
        const e = await create();
        await as(owner);
        await assert.rejects(
          act(e.id, 1, false, randomUUID(), "bad"),
          /invalid_workforce_archive/,
        );
        await assert.rejects(act(e.id, 1, true), /expense_archive_state/);
        await act(e.id, 1);
        await act(e.id, 2, true);
        await act(e.id, 3);
        await act(e.id, 4, true);
        await assert.rejects(
          db.query(
            "update workforce_expenses set status='ARCHIVED' where id=$1",
            [e.id],
          ),
          /permission denied/,
        );
        await db.exec("reset role");
        for (const table of ["expenses", "payments"])
          assert.equal(
            (
              await db.query<{ n: number }>(
                `select count(*)::int n from ${table} where company_id=$1`,
                [a],
              )
            ).rows[0].n,
            0,
          );
        assert.equal((await row(e.id)).version, 5);
      },
    );
  } finally {
    await db.close();
  }
});
