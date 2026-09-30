import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import {
  identifyWorkforceReceipt,
  safeWorkforceReceiptName,
} from "../src/lib/workforce-receipts";
import {
  workforceExpenseSchema,
  workforceDecisionSchema,
  workforceUtcDateTime,
} from "../src/lib/workforce-expenses";
test("Workforce expenses enforce receipts, assignments, tenant isolation and two decisions", async (t) => {
  const { db } = await fullDatabase(),
    owner = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  const actors = Array.from({ length: 4 }, () => ({
      user: randomUUID(),
      worker: randomUUID(),
    })),
    [worker, foreman, office, other] = actors;
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const configure = (
    who: typeof worker,
    role: string,
    supervisor: string | null = null,
    version = 0,
    enabled = true,
  ) =>
    db.query(
      "select configure_workforce($1,$2,$3,$4,$5,$6,$7,'Synthetic receipt test')",
      [a, randomUUID(), who.worker, version, role, supervisor, enabled],
    );
  let project: string;
  const now = new Date().toISOString();
  const prepare = async (id: string, upload = true) => {
    const receipt = (
      await db.query<{ id: string }>(
        "select (prepare_workforce_receipt($1,$2,$3,33,'png','recibo.png')).id",
        [a, id, "a".repeat(64)],
      )
    ).rows[0].id;
    if (upload)
      await db.query(
        "insert into storage.objects(bucket_id,name) values('workforce-receipts',$1)",
        [`${a}/${id}/${receipt}.png`],
      );
    return receipt;
  };
  const submit = (
    id: string,
    receipt: string,
    request = randomUUID(),
    p = project,
    amount = "12.34",
    at = now,
    company = a,
  ) =>
    db.query(
      "select submit_workforce_expense($1,$2,$3,$4,$5,$6,'MATERIALS','Synthetic expense',$7) data",
      [company, request, id, p, at, amount, receipt],
    );
  const decide = (
    id: string,
    version: number,
    decision = "APPROVE",
    reason = "",
    request = randomUUID(),
  ) =>
    db.query<{ data: { status: string; version: number } }>(
      "select decide_workforce_expense($1,$2,$3,$4,$5,$6) data",
      [a, request, id, version, decision, reason],
    );
  const counts = async () => {
    await db.exec("reset role");
    return (
      await db.query(
        "select (select count(*) from expenses)::int expenses,(select count(*) from time_entries)::int hours,(select count(*) from payments)::int payments",
      )
    ).rows;
  };
  const ids: string[] = [];
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now())",
      [owner],
    );
    for (const x of actors)
      await db.query("insert into auth.users values($1,$2,now())", [
        x.user,
        `${x.user}@example.test`,
      ]);
    await as(owner);
    await db.query(
      "select create_company($1,'Receipt A'),create_company($2,'Receipt B')",
      [a, b],
    );
    for (const x of actors) {
      await db.query("select add_company_member($1,$2)", [
        a,
        `${x.user}@example.test`,
      ]);
      await db.query("select set_member_access($1,$2,'member',true,$3)", [
        a,
        x.user,
        JSON.stringify({ horasfix: ["write"], activity: ["read"] }),
      ]);
      await db.query("select save_worker($1,$2,0,$3)", [
        a,
        x.worker,
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
        x.worker,
        `${x.user}@example.test`,
      ]);
    }
    await configure(foreman, "FOREMAN");
    await configure(worker, "WORKER", foreman.worker);
    await configure(office, "OFFICE");
    await configure(other, "FOREMAN");
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
      "select approve_estimate($1,$2,1,'2026-09-30','Synthetic project','Local test')",
      [a, estimate],
    );
    project = (
      await db.query<{ id: string }>(
        "select id from projects where estimate_id=$1",
        [estimate],
      )
    ).rows[0].id;
    await db.query(
      "select save_workforce_assignment($1,$2,$3,0,$4,$5,$6,null,true,'Synthetic expense assignment')",
      [
        a,
        randomUUID(),
        randomUUID(),
        worker.worker,
        project,
        new Date(Date.now() - 86400_000).toISOString(),
      ],
    );
    const before = await counts();
    await t.test(
      "receipt is required and must exist in private Storage; scope/amount/date checked before writes",
      async () => {
        await as(worker.user);
        const id = randomUUID(),
          receipt = await prepare(id, false);
        await assert.rejects(submit(id, receipt), /receipt_unavailable/);
        await assert.rejects(
          submit(id, receipt, randomUUID(), randomUUID()),
          /project_not_assigned/,
        );
        await assert.rejects(
          submit(id, receipt, randomUUID(), project, "0"),
          /invalid_workforce_expense/,
        );
        await assert.rejects(
          submit(id, receipt, randomUUID(), project, "10000.01"),
          /invalid_workforce_expense/,
        );
        await assert.rejects(
          submit(id, receipt, randomUUID(), project, "NaN"),
          /invalid_workforce_expense/,
        );
        await assert.rejects(
          submit(
            id,
            receipt,
            randomUUID(),
            project,
            "12",
            new Date(Date.now() - 91 * 86400_000).toISOString(),
          ),
          /invalid_workforce_expense/,
        );
        await assert.rejects(
          submit(
            id,
            receipt,
            randomUUID(),
            project,
            "12",
            new Date(Date.now() + 301000).toISOString(),
          ),
          /invalid_workforce_expense/,
        );
        await assert.rejects(
          submit(id, receipt, randomUUID(), project, "12", now, b),
          /worker_login_required/,
        );
        await assert.rejects(
          db.query(
            "select prepare_workforce_receipt($1,$2,$3,12,'pdf','x.pdf')",
            [a, id, "a".repeat(64)],
          ),
          /invalid_workforce_receipt/,
        );
        await assert.rejects(
          db.query(
            "select prepare_workforce_receipt($1,$2,$3,12,'png','../x.png')",
            [a, id, "a".repeat(64)],
          ),
          /invalid_workforce_receipt/,
        );
        assert.equal(
          (await db.query("select * from workforce_expenses")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "lost responses can retry submission; another actor cannot consume the candidate",
      async () => {
        await as(worker.user);
        const id = randomUUID(),
          receipt = await prepare(id),
          request = randomUUID();
        ids.push(id);
        const first = await submit(id, receipt, request);
        assert.deepEqual((await submit(id, receipt, request)).rows, first.rows);
        await assert.rejects(
          submit(id, receipt, request, project, "99"),
          /request_conflict/,
        );
        assert.equal(
          (await db.query("select * from workforce_expenses where id=$1", [id]))
            .rows.length,
          1,
        );
        await as(other.user);
        assert.equal(
          (await db.query("select * from workforce_expenses")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select workforce_expense_receipt($1,$2)", [a, id]),
          /expense_forbidden/,
        );
        await assert.rejects(decide(id, 1), /expense_forbidden/);
        assert.equal(
          (
            await db.query(
              "select * from storage.objects where bucket_id='workforce-receipts'",
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "worker and own foreman cannot approve; office cannot bypass the first stage",
      async () => {
        const id = ids[0];
        await as(worker.user);
        await assert.rejects(decide(id, 1), /expense_forbidden/);
        await as(owner);
        await assert.rejects(decide(id, 1), /expense_state_invalid/);
        await as(office.user);
        await assert.rejects(decide(id, 1), /expense_state_invalid/);
        await as(owner);
        await db.query(
          "select save_workforce_assignment($1,$2,$3,0,$4,$5,$6,null,true,'Synthetic own assignment')",
          [
            a,
            randomUUID(),
            randomUUID(),
            foreman.worker,
            project,
            new Date(Date.now() - 86400_000).toISOString(),
          ],
        );
        await as(foreman.user);
        const own = randomUUID(),
          r = await prepare(own);
        await submit(own, r);
        ids.push(own);
        await assert.rejects(decide(own, 1), /expense_forbidden/);
      },
    );
    await t.test(
      "two stages persist actors, times and versions; retries and stale decisions do not duplicate",
      async () => {
        const id = ids[0],
          request = randomUUID();
        await as(foreman.user);
        assert.equal(
          (await db.query("select workforce_expense_receipt($1,$2)", [a, id]))
            .rows.length,
          1,
        );
        const first = await decide(id, 1, "APPROVE", "", request);
        assert.equal(first.rows[0].data.status, "FOREMAN_APPROVED");
        assert.deepEqual(
          (await decide(id, 1, "APPROVE", "", request)).rows,
          first.rows,
        );
        await assert.rejects(
          decide(id, 1, "REJECT", "Synthetic rejection"),
          /record_conflict/,
        );
        await assert.rejects(decide(id, 2), /expense_state_invalid/);
        await as(office.user);
        await decide(id, 2);
        const row = (
          await db.query<{
            status: string;
            version: number;
            foreman_by: string;
            office_by: string;
            foreman_at: string;
            office_at: string;
          }>("select * from workforce_expenses where id=$1", [id])
        ).rows[0];
        assert.equal(row.status, "OFFICE_APPROVED");
        assert.equal(row.version, 3);
        assert.equal(row.foreman_by, foreman.user);
        assert.equal(row.office_by, office.user);
        assert(row.foreman_at && row.office_at);
        await assert.rejects(decide(id, 3), /expense_state_invalid/);
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from audit_events where entity='workforce_expenses' and entity_id=$1",
              [id],
            )
          ).rows[0].n,
          3,
        );
      },
    );
    await t.test(
      "general allocation preserves original evidence and approvals, requires office authority and cannot bypass stages",
      async () => {
        const id = ids[0],
          request = randomUUID();
        await as(office.user);
        const beforeRow = (
          await db.query<Record<string, unknown>>(
            "select * from workforce_expenses where id=$1",
            [id],
          )
        ).rows[0];
        await assert.rejects(
          decide(id, 3, "RECLASSIFY_GENERAL", "no"),
          /invalid_workforce_decision/,
        );
        await as(worker.user);
        await assert.rejects(
          decide(id, 3, "RECLASSIFY_GENERAL", "Synthetic general"),
          /expense_forbidden/,
        );
        await as(foreman.user);
        await assert.rejects(
          decide(id, 3, "RECLASSIFY_GENERAL", "Synthetic general"),
          /expense_forbidden/,
        );
        await as(office.user);
        const first = await decide(
          id,
          3,
          "RECLASSIFY_GENERAL",
          "Synthetic general",
          request,
        );
        assert.deepEqual(
          (
            await decide(
              id,
              3,
              "RECLASSIFY_GENERAL",
              "Synthetic general",
              request,
            )
          ).rows,
          first.rows,
        );
        await assert.rejects(
          decide(id, 3, "RECLASSIFY_GENERAL", "Changed general", request),
          /request_conflict/,
        );
        await assert.rejects(
          decide(id, 3, "RECLASSIFY_GENERAL", "Synthetic general"),
          /record_conflict/,
        );
        await assert.rejects(
          decide(id, 4, "RECLASSIFY_GENERAL", "Synthetic general"),
          /expense_state_invalid/,
        );
        const after = (
          await db.query<Record<string, unknown>>(
            "select * from workforce_expenses where id=$1",
            [id],
          )
        ).rows[0];
        for (const key of [
          "project_id",
          "worker_id",
          "receipt_id",
          "expense_at",
          "amount",
          "category",
          "description",
          "status",
          "foreman_by",
          "foreman_at",
          "office_by",
          "office_at",
        ])
          assert.deepEqual(after[key], beforeRow[key], key);
        assert.equal(after.allocation, "GENERAL");
        assert.equal(after.version, 4);
        assert.equal(after.general_by, office.user);
        assert.equal(after.general_worker_id, office.worker);
        assert.equal(after.general_reason, "Synthetic general");
        assert(after.general_at);
        // A new expense may be reclassified after the first decision, without granting the second.
        await as(worker.user);
        const pending = randomUUID(),
          receipt = await prepare(pending);
        await submit(pending, receipt);
        await as(office.user);
        await assert.rejects(
          decide(pending, 1, "RECLASSIFY_GENERAL", "Synthetic general"),
          /expense_state_invalid/,
        );
        await as(foreman.user);
        await decide(pending, 1);
        await as(office.user);
        await decide(pending, 2, "RECLASSIFY_GENERAL", "Synthetic general");
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from workforce_expenses where id=$1",
              [pending],
            )
          ).rows[0].status,
          "FOREMAN_APPROVED",
        );
        await decide(pending, 3);
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from workforce_expenses where id=$1",
              [pending],
            )
          ).rows[0].status,
          "OFFICE_APPROVED",
        );
        // Losing the office role must deny even a previously accepted idempotent retry.
        await as(owner);
        await configure(office, "FOREMAN", null, 1);
        await as(office.user);
        await assert.rejects(
          decide(id, 3, "RECLASSIFY_GENERAL", "Synthetic general", request),
          /expense_forbidden/,
        );
        await as(owner);
        await configure(office, "OFFICE", null, 2);
      },
    );
    await t.test(
      "rejection at either stage is final and requires a reason",
      async () => {
        for (const secondStage of [false, true]) {
          await as(worker.user);
          const id = randomUUID(),
            r = await prepare(id);
          await submit(id, r);
          ids.push(id);
          await as(foreman.user);
          await assert.rejects(
            decide(id, 1, "REJECT", "no"),
            /invalid_workforce_decision/,
          );
          if (secondStage) {
            await decide(id, 1);
            await as(office.user);
          }
          await decide(
            id,
            secondStage ? 2 : 1,
            "REJECT",
            "Synthetic rejection",
          );
          assert.equal(
            (
              await db.query<{ status: string }>(
                "select status from workforce_expenses where id=$1",
                [id],
              )
            ).rows[0].status,
            "REJECTED",
          );
          await as(office.user);
          await assert.rejects(
            decide(
              id,
              secondStage ? 3 : 2,
              "RECLASSIFY_GENERAL",
              "Synthetic general",
            ),
            /expense_state_invalid/,
          );
          await assert.rejects(
            decide(id, secondStage ? 3 : 2),
            /expense_state_invalid/,
          );
        }
      },
    );
    await t.test(
      "history and private receipt reads follow current scope; revocation blocks privileged retries",
      async () => {
        await as(foreman.user);
        assert.equal(
          (
            await db.query(
              "select * from record_history($1,'workforce_expenses',$2)",
              [a, ids[0]],
            )
          ).rows.length,
          4,
        );
        await as(other.user);
        assert.equal(
          (
            await db.query(
              "select * from record_history($1,'workforce_expenses',$2)",
              [a, ids[0]],
            )
          ).rows.length,
          0,
        );
        await as(owner);
        await configure(worker, "WORKER", other.worker, 1);
        await as(foreman.user);
        await assert.rejects(
          db.query("select workforce_expense_receipt($1,$2)", [a, ids[0]]),
          /expense_forbidden/,
        );
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',true,'{}')", [
          a,
          office.user,
        ]);
        await as(office.user);
        await assert.rejects(decide(ids[0], 3), /permission_denied/);
        assert.equal(
          (await db.query("select * from workforce_expenses")).rows.length,
          0,
        );
        assert.deepEqual(
          await counts(),
          before,
          "approval never writes administrative expenses, hours or payments",
        );
      },
    );
    await t.test(
      "no direct financial/receipt writes, object overwrite/delete or anonymous function access",
      async () => {
        await as(worker.user);
        await assert.rejects(
          db.query("update workforce_expenses set status='OFFICE_APPROVED'"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("delete from workforce_receipt_uploads"),
          /permission denied/,
        );
        assert.equal(
          (
            await db.query(
              "delete from storage.objects where bucket_id='workforce-receipts' returning id",
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "update storage.objects set name='changed' where bucket_id='workforce-receipts' returning id",
            )
          ).rows.length,
          0,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(
          db.query("select workforce_expense_receipt($1,$2)", [a, ids[0]]),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("Workforce receipts check dimensions/brands, reject PDF and unsafe inputs, and bound names and amount", () => {
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12);
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  assert.equal(identifyWorkforceReceipt(png).extension, "png");
  png.writeUInt32BE(0, 16);
  assert.throws(
    () => identifyWorkforceReceipt(png),
    /invalid_workforce_receipt/,
  );
  const heic = Buffer.alloc(24);
  heic.writeUInt32BE(24);
  heic.write("ftyp", 4);
  heic.write("heic", 8);
  heic.write("mif1", 16);
  assert.equal(identifyWorkforceReceipt(heic).contentType, "image/heic");
  assert.throws(
    () => identifyWorkforceReceipt(Buffer.from("%PDF-1.7\nSynthetic")),
    /invalid_workforce_receipt/,
  );
  assert.throws(
    () => identifyWorkforceReceipt(Buffer.alloc(8388609)),
    /invalid_workforce_receipt/,
  );
  assert.equal(safeWorkforceReceiptName(" a/\\b\u0000.png "), "a__b_.png");
  assert.equal(
    Array.from(safeWorkforceReceiptName("😀".repeat(250))).length,
    200,
  );
  assert.equal(
    workforceDecisionSchema.safeParse({
      id: randomUUID(),
      request: randomUUID(),
      version: 1,
      decision: "REJECT",
      reason: "no",
    }).success,
    false,
  );
  assert.equal(
    workforceExpenseSchema.safeParse({
      id: randomUUID(),
      request: randomUUID(),
      project_id: randomUUID(),
      expense_at: new Date().toISOString(),
      amount: "0.001",
      category: "OTHER",
      description: "",
      receipt_id: randomUUID(),
    }).success,
    false,
  );
});

test("Workforce edited UTC dates accept minute precision and reject rollover or offsets", () => {
  assert.equal(
    workforceUtcDateTime("2026-09-30T12:00"),
    "2026-09-30T12:00:00Z",
  );
  assert.equal(
    workforceUtcDateTime("2026-09-30T12:00:31"),
    "2026-09-30T12:00:31Z",
  );
  assert.equal(
    workforceUtcDateTime("2026-09-30T12:00:31.123"),
    "2026-09-30T12:00:31.123Z",
  );
  for (const value of [
    "",
    "2026-02-30T12:00",
    "2026-09-30T25:00",
    "2026-09-30",
    "2026-09-30T12:00Z",
    "2026-09-30T12:00-04:00",
  ]) {
    assert.equal(workforceUtcDateTime(value), null);
  }
});

test("general allocation needs a reason and remains a decision distinct from reimbursement", () => {
  const base = {
    id: randomUUID(),
    request: randomUUID(),
    version: 2,
    decision: "RECLASSIFY_GENERAL",
    reason: "  no  ",
  };
  assert.equal(workforceDecisionSchema.safeParse(base).success, false);
  assert.equal(
    workforceDecisionSchema.safeParse({
      ...base,
      reason: "Correction to general cost",
    }).success,
    true,
  );
  assert.equal(
    workforceDecisionSchema.safeParse({
      ...base,
      decision: "REIMBURSE",
      reason: "Paid",
    }).success,
    false,
  );
});
