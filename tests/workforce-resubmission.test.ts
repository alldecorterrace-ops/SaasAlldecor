import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { workforceResubmissionSchema } from "../src/lib/workforce-expenses";

test("Returned expenses allow one worker resubmission and retain history", async (t) => {
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
  const adminCorrect = async (
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
    const returned = async () => {
      const e = await create();
      await db.exec("reset role");
      // Synthetic returned-state fixture; does not simulate an AI provider.
      await db.query(
        "update workforce_expenses set status='NEEDS_CORRECTION',correction_note='Synthetic return for correction',returned_at=now(),version=version+1 where id=$1",
        [e.id],
      );
      return e;
    };
    const resubmit = async (
      e: { id: string; receipt: string },
      version = 2,
      request = randomUUID(),
      changes: Record<string, unknown> = {},
    ) => {
      const v = {
        project,
        general: false,
        date: day,
        amount: "21.01",
        category: "TOOLS",
        description: "Worker corrected synthetic",
        payer: "empresa",
        receipt: e.receipt,
        ...changes,
      };
      return db.query<{ data: { version: number; status: string } }>(
        "select resubmit_workforce_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) data",
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
        ],
      );
    };
    await t.test("only the active original worker can resubmit", async () => {
      const e = await returned(),
        before = await row(e.id);
      for (const user of [owner, office.user, foreman.user]) {
        await as(user);
        await assert.rejects(
          resubmit(e),
          /worker_login_required|expense_resubmit_forbidden/,
        );
      }
      await as(worker.user);
      await assert.rejects(
        db.query(
          "select resubmit_workforce_expense($1,$2,$3,2,$4,false,$5,1,'TOOLS','QA','empresa',$6)",
          [b, randomUUID(), e.id, foreignProject, day, e.receipt],
        ),
        /worker_login_required|expense_resubmit_forbidden/,
      );
      assert.deepEqual(await row(e.id), before);
    });
    await t.test(
      "invalid input, stale version, mismatched receipt and foreign project do not change evidence",
      async () => {
        const e = await returned(),
          before = await row(e.id);
        for (const change of [
          { amount: "0" },
          { amount: "20000.01" },
          { amount: "NaN" },
          { date: "2100-01-01" },
          { payer: "invalid" },
        ]) {
          await as(worker.user);
          await assert.rejects(
            resubmit(e, 2, randomUUID(), change),
            /invalid_workforce_resubmission/,
          );
        }
        await as(worker.user);
        await assert.rejects(resubmit(e, 1), /record_conflict/);
        await assert.rejects(
          resubmit(e, 2, randomUUID(), { receipt: randomUUID() }),
          /record_conflict/,
        );
        await assert.rejects(
          resubmit(e, 2, randomUUID(), { project: foreignProject }),
          /project_unavailable/,
        );
        assert.deepEqual(await row(e.id), before);
      },
    );
    await t.test(
      "returned is distinct from submitted, approved and rejected",
      async () => {
        for (const state of [
          "SUBMITTED",
          "FOREMAN_APPROVED",
          "OFFICE_APPROVED",
          "REJECTED",
        ]) {
          const e = await create();
          await db.exec("reset role");
          await db.query(
            "update workforce_expenses set status=$1 where id=$2",
            [state, e.id],
          );
          const before = await row(e.id);
          await as(worker.user);
          await assert.rejects(resubmit(e, 1), /expense_resubmit_state/);
          assert.deepEqual(await row(e.id), before);
        }
      },
    );
    await t.test(
      "one resubmission preserves worker, receipt, creation and return note; retries apply once",
      async () => {
        const e = await returned(),
          before = await row(e.id);
        await as(worker.user);
        const request = randomUUID();
        await resubmit(e, 2, request);
        await resubmit(e, 2, request);
        await assert.rejects(
          resubmit(e, 2, request, { amount: "22" }),
          /request_conflict/,
        );
        await assert.rejects(resubmit(e, 2), /record_conflict/);
        const saved = await row(e.id);
        assert.equal(saved.version, 3);
        assert.equal(saved.status, "SUBMITTED");
        assert.equal(saved.resubmission_count, 1);
        assert.equal(saved.resubmitted_by, worker.user);
        assert.equal(saved.worker_id, before.worker_id);
        assert.equal(saved.receipt_id, before.receipt_id);
        assert.deepEqual(saved.created_at, before.created_at);
        assert.equal(saved.correction_note, before.correction_note);
        assert.equal(saved.amount, "21.01");
        assert.equal(saved.pay_method, "empresa");
        assert.equal(saved.pay_method_set_by, worker.user);
        assert.equal(saved.admin_review_status, "PENDING");
        assert.equal(saved.review_snapshot, null);
        const time = (
          await db.query<{ local_hour: number }>(
            "select extract(hour from expense_at at time zone 'America/New_York')::int local_hour from workforce_expenses where id=$1",
            [e.id],
          )
        ).rows[0];
        assert.equal(time.local_hour, 12);
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
      "a second return requires administration, never another worker resubmission",
      async () => {
        const e = await returned();
        await as(worker.user);
        await resubmit(e);
        await db.exec("reset role");
        await db.query(
          "update workforce_expenses set status='NEEDS_CORRECTION',version=version+1,correction_note='Synthetic second review for administration',returned_at=now() where id=$1",
          [e.id],
        );
        const before = await row(e.id);
        await as(worker.user);
        await assert.rejects(resubmit(e, 4), /expense_resubmit_limit/);
        assert.deepEqual(await row(e.id), before);
        await as(office.user);
        await adminCorrect(e, 4);
        const saved = await row(e.id);
        assert.equal(saved.status, "SUBMITTED");
        assert.equal(saved.admin_review_status, "REVIEWED");
        assert.equal(saved.resubmission_count, 1);
      },
    );
    await t.test(
      "general resubmission retains original project and supports the Campo correction limit",
      async () => {
        const e = await returned();
        await as(worker.user);
        await resubmit(e, 2, randomUUID(), {
          project: null,
          general: true,
          amount: "20000",
        });
        const saved = await row(e.id);
        assert.equal(saved.allocation, "GENERAL");
        assert.equal(saved.project_id, project);
        assert.equal(saved.amount, "20000.00");
        assert.equal(saved.general_by, worker.user);
        assert.equal(saved.receipt_id, e.receipt);
      },
    );
    await t.test(
      "a worker resubmission invalidates previous manual review without fabricating a new review",
      async () => {
        const e = await create();
        await as(office.user);
        await adminCorrect(e);
        await db.exec("reset role");
        await db.query(
          "update workforce_expenses set status='NEEDS_CORRECTION',correction_note='Synthetic returned after review',returned_at=now(),version=version+1 where id=$1",
          [e.id],
        );
        await as(worker.user);
        await resubmit(e, 3);
        const saved = await row(e.id);
        assert.equal(saved.admin_review_status, "PENDING");
        for (const k of [
          "admin_reviewed_by",
          "admin_reviewed_at",
          "admin_review_note",
          "review_snapshot",
          "foreman_by",
          "office_by",
        ])
          assert.equal(saved[k], null);
      },
    );
    await t.test("missing receipt object prevents resubmission", async () => {
      const e = await returned();
      await db.exec("reset role");
      await db.query("delete from storage.objects where name=$1", [
        `${a}/${e.id}/${e.receipt}.png`,
      ]);
      const before = await row(e.id);
      await as(worker.user);
      await assert.rejects(resubmit(e), /receipt_unavailable/);
      assert.deepEqual(await row(e.id), before);
    });
    await t.test(
      "an ended assignment does not prevent correction of the original project",
      async () => {
        const e = await returned();
        await db.exec("reset role");
        await db.query(
          "update workforce_assignments set active=false where company_id=$1 and worker_id=$2",
          [a, worker.id],
        );
        await as(worker.user);
        await resubmit(e);
        const saved = await row(e.id);
        assert.equal(saved.project_id, project);
        assert.equal(saved.status, "SUBMITTED");
        await db.exec("reset role");
        await db.query(
          "update workforce_assignments set active=true where company_id=$1 and worker_id=$2",
          [a, worker.id],
        );
      },
    );
    // Metadata/object fixtures exercise SQL authorization; binary checks are covered separately.
    const preparePhoto = async (
      e: { id: string },
      user: string,
      hash = "b",
      store = true,
    ) => {
      await as(user);
      const receipt = (
        await db.query<{ id: string }>(
          "select (prepare_workforce_receipt($1,$2,$3,400,'png','Replacement.png')).id",
          [a, e.id, hash.repeat(64)],
        )
      ).rows[0].id;
      if (store)
        await db.query(
          "insert into storage.objects(bucket_id,name) values('workforce-receipts',$1)",
          [`${a}/${e.id}/${receipt}.png`],
        );
      return receipt;
    };
    const photoResubmit = (
      e: { id: string; receipt: string },
      next: string,
      request = randomUUID(),
      version = 2,
    ) =>
      db.query<{ data: Record<string, unknown> }>(
        "select resubmit_workforce_expense($1,$2,$3,$4,$5,false,$6,21.01,'TOOLS','Synthetic new photo','empresa',$7,$8) data",
        [a, request, e.id, version, project, day, e.receipt, next],
      );
    const photoCorrect = (
      e: { id: string; receipt: string },
      next: string,
      request = randomUUID(),
    ) =>
      db.query<{ data: Record<string, unknown> }>(
        "select correct_workforce_expense($1,$2,$3,2,$4,false,$5,21.01,'TOOLS','Synthetic new photo','empresa',$6,'Synthetic review of new photo',$7) data",
        [a, request, e.id, project, day, e.receipt, next],
      );
    await t.test(
      "a worker replaces once, replays once and can read consumed old receipts only",
      async () => {
        const e = await returned();
        const next = await preparePhoto(e, worker.user);
        let list = (
          await db.query<{
            data: { receipts: { id: string; current: boolean }[] }[];
          }>("select workforce_receipt_versions($1,$2) data", [a, [e.id]])
        ).rows[0].data;
        assert.equal(list[0].receipts.length, 1); // Prepared drafts are not historical evidence.
        const request = randomUUID();
        const result = await photoResubmit(e, next, request);
        assert.deepEqual(
          (await photoResubmit(e, next, request)).rows,
          result.rows,
        );
        const saved = await row(e.id);
        assert.equal(saved.receipt_id, next);
        assert.equal(saved.version, 3);
        assert.equal(saved.resubmission_count, 1);
        assert.equal(saved.admin_review_status, "PENDING");
        await as(worker.user);
        list = (
          await db.query<{
            data: { receipts: { id: string; current: boolean }[] }[];
          }>("select workforce_receipt_versions($1,$2) data", [a, [e.id]])
        ).rows[0].data;
        assert.equal(list[0].receipts.length, 2);
        assert.equal(
          list[0].receipts.find((r) => r.id === e.receipt)?.current,
          false,
        );
        for (const receipt of [e.receipt, next]) {
          assert.equal(
            (
              await db.query<{ data: { id: string } }>(
                "select workforce_expense_receipt_version($1,$2,$3) data",
                [a, e.id, receipt],
              )
            ).rows[0].data.id,
            receipt,
          );
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select app_private.workforce_receipt_access($1,'read') ok",
                [`${a}/${e.id}/${receipt}.png`],
              )
            ).rows[0].ok,
            true,
          );
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select app_private.workforce_receipt_access($1,'write') ok",
                [`${a}/${e.id}/${receipt}.png`],
              )
            ).rows[0].ok,
            false,
          );
        }
        assert.equal(
          (
            await db.query<{ id: string }>(
              "select (prepare_workforce_receipt($1,$2,$3,400,'png','Replacement.png')).id",
              [a, e.id, "b".repeat(64)],
            )
          ).rows[0].id,
          next,
        );
        await assert.rejects(
          preparePhoto(e, worker.user, "c"),
          /expense_forbidden/,
        );
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from workforce_receipt_changes where expense_id=$1",
              [e.id],
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
          3,
        );
      },
    );
    await t.test(
      "an administrator without a worker profile replaces atomically and reviews the new hash",
      async () => {
        const e = await returned();
        const next = await preparePhoto(e, owner, "c");
        const request = randomUUID();
        const result = await photoCorrect(e, next, request);
        assert.deepEqual(
          (await photoCorrect(e, next, request)).rows,
          result.rows,
        );
        const saved = await row(e.id);
        assert.equal(saved.receipt_id, next);
        assert.equal(saved.version, 3);
        assert.equal(saved.resubmission_count, 0);
        assert.equal(saved.admin_review_status, "REVIEWED");
        const review = saved.review_snapshot as Record<string, unknown>;
        assert.equal(review.receipt, next);
        assert.equal(review.receipt_sha256, "c".repeat(64));
        const change = (
          await db.query<{
            old_receipt_id: string;
            new_receipt_id: string;
            actor_id: string;
            operation: string;
          }>("select * from workforce_receipt_changes where expense_id=$1", [
            e.id,
          ])
        ).rows;
        assert.equal(change.length, 1);
        assert.equal(change[0].old_receipt_id, e.receipt);
        assert.equal(change[0].new_receipt_id, next);
        assert.equal(change[0].actor_id, owner);
        assert.equal(change[0].operation, "manual_correction");
      },
    );
    await t.test(
      "missing or borrowed replacements cannot change the expense or history",
      async () => {
        const e = await returned();
        const missing = await preparePhoto(e, worker.user, "b", false);
        const before = await row(e.id);
        await as(worker.user);
        await assert.rejects(photoResubmit(e, missing), /receipt_unavailable/);
        const other = await returned();
        const borrowed = await preparePhoto(other, worker.user, "c");
        await as(worker.user);
        await assert.rejects(photoResubmit(e, borrowed), /receipt_unavailable/);
        const someoneElse = await preparePhoto(e, office.user, "d");
        await as(worker.user);
        await assert.rejects(
          photoResubmit(e, someoneElse),
          /receipt_unavailable/,
        );
        assert.deepEqual(await row(e.id), before);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from workforce_receipt_changes where expense_id=$1",
              [e.id],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "worker and foreman cannot prepare pending corrections; final states and foreign queries remain closed",
      async () => {
        const e = await create();
        for (const user of [worker.user, foreman.user])
          await assert.rejects(preparePhoto(e, user), /expense_forbidden/);
        for (const status of ["OFFICE_APPROVED", "REJECTED"]) {
          await db.exec("reset role");
          await db.query(
            "update workforce_expenses set status=$2 where id=$1",
            [e.id, status],
          );
          await assert.rejects(preparePhoto(e, owner), /expense_forbidden/);
        }
        await as(worker.user);
        await assert.rejects(
          db.query("select workforce_expense_receipt_version($1,$2,$3)", [
            b,
            e.id,
            e.receipt,
          ]),
          /expense_forbidden/,
        );
        await as(owner);
        assert.deepEqual(
          (
            await db.query<{ data: unknown[] }>(
              "select workforce_receipt_versions($1,$2) data",
              [b, [e.id]],
            )
          ).rows[0].data,
          [],
        );
      },
    );
    await t.test(
      "replacement formats and stale versions preserve prepared files and reject changes",
      async () => {
        const e = await returned();
        await as(worker.user);
        for (const [bytes, extension] of [
          [399, "png"],
          [400, "heic"],
        ])
          await assert.rejects(
            db.query(
              "select prepare_workforce_receipt($1,$2,$3,$4,$5,'Photo')",
              [a, e.id, "f".repeat(64), bytes, extension],
            ),
            /invalid_workforce_receipt_replacement/,
          );
        const next = await preparePhoto(e, worker.user);
        const before = await row(e.id);
        await as(worker.user);
        await assert.rejects(
          photoResubmit(e, next, randomUUID(), 1),
          /record_conflict/,
        );
        assert.deepEqual(await row(e.id), before);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from storage.objects where name=$1",
              [`${a}/${e.id}/${next}.png`],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "revoking membership hides used photos and refuses a successful replacement replay",
      async () => {
        const e = await returned();
        const next = await preparePhoto(e, worker.user);
        const request = randomUUID();
        await photoResubmit(e, next, request);
        const before = await row(e.id);
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',false,$3)", [
          a,
          worker.user,
          JSON.stringify({ horasfix: ["write"] }),
        ]);
        await as(worker.user);
        await assert.rejects(
          photoResubmit(e, next, request),
          /worker_login_required|expense_resubmit_forbidden/,
        );
        await assert.rejects(
          db.query("select workforce_expense_receipt_version($1,$2,$3)", [
            a,
            e.id,
            e.receipt,
          ]),
          /expense_forbidden/,
        );
        assert.equal(
          (
            await db.query<{ ok: boolean }>(
              "select app_private.workforce_receipt_access($1,'read') ok",
              [`${a}/${e.id}/${e.receipt}.png`],
            )
          ).rows[0].ok,
          false,
        );
        assert.deepEqual(await row(e.id), before);
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          a,
          worker.user,
          JSON.stringify({ horasfix: ["write"] }),
        ]);
      },
    );
    await t.test(
      "revoked profiles cannot replay the previously successful request",
      async () => {
        const e = await returned();
        await as(worker.user);
        const request = randomUUID();
        await resubmit(e, 2, request);
        const before = await row(e.id);
        await as(owner);
        await db.query(
          "select configure_workforce($1,$2,$3,1,'WORKER',$4,false,'Synthetic revocation')",
          [a, randomUUID(), worker.id, foreman.id],
        );
        await as(worker.user);
        await assert.rejects(
          resubmit(e, 2, request),
          /worker_login_required|expense_resubmit_forbidden/,
        );
        assert.deepEqual(await row(e.id), before);
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

test("Worker correction validates fields without creating an administrative review reason", () => {
  const good = {
    id: randomUUID(),
    request: randomUUID(),
    version: 2,
    project_id: "GENERAL",
    expense_date: "2026-09-30",
    amount: "20",
    category: "MATERIALS",
    description: "QA",
    pay_method: "propio",
    receipt_id: randomUUID(),
  };
  assert(workforceResubmissionSchema.safeParse(good).success);
  assert(
    !workforceResubmissionSchema.safeParse({ ...good, amount: "0" }).success,
  );
});
