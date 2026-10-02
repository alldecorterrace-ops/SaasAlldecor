import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { compareReceipt } from "../src/lib/receipt-review";
import {
  reimbursementBalancesSchema,
  reimbursementFormSchema,
} from "../src/lib/workforce-reimbursements";
import { fullDatabase } from "./helpers/full-database";
import { reimbursementFixture } from "./helpers/reimbursement-fixture";
test("Reimbursement evidence preserves cost, reviewer, archive and tenant boundaries", async (t) => {
  const { db } = await fullDatabase();
  try {
    const f = await reimbursementFixture(db);
    await t.test(
      "only approved own-pocket costs create debt; pending and company costs remain separate",
      async () => {
        await f.approve();
        await f.approve("empresa");
        await f.approve("efectivo_empresa");
        await f.create();
        await f.as(f.owner);
        const v = await f.balances();
        assert.equal(v.debt, "100.00");
        assert.equal(v.company_paid, "200.00");
        assert.equal(v.unknown_payer, "0.00");
        assert.equal((v.groups as unknown[]).length, 1);
      },
    );
    await t.test(
      "the displayed contract validates real SQL results and explicit prior-payment confirmation",
      async () => {
        await f.as(f.owner);
        reimbursementBalancesSchema.parse(await f.balances());
        const valid = {
          request: randomUUID(),
          worker: f.worker.id,
          items: JSON.stringify([{ id: randomUUID(), version: 1 }]),
          total: "100.00",
          all: "false",
          note: "Synthetic prior-payment reference",
          confirmed: "on",
        };
        assert(reimbursementFormSchema.safeParse(valid).success);
        assert(
          !reimbursementFormSchema.safeParse({ ...valid, confirmed: "" })
            .success,
        );
        assert(
          !reimbursementFormSchema.safeParse({ ...valid, items: "invalid" })
            .success,
        );
      },
    );
    await t.test(
      "a confirmed AI snapshot must remain current after a workday change",
      async () => {
        const e = await f.approve();
        await f.as(f.owner);
        const job = await f.prepare(e, 4),
          context = await f.context(f.a, job.job);
        const verdict = compareReceipt(
          {
            es_recibo: true,
            legible: true,
            comercio: "Synthetic merchant",
            direccion_comercio: "",
            fecha: f.day,
            total: 100,
            subtotal: 90,
            impuesto: 10,
            moneda: "USD",
            numero_factura: e.id,
            metodo_pago: "cash",
            tarjeta_ult4: "",
          },
          context,
        );
        await f.as(f.owner, "service_role");
        await db.query(
          "select finish_workforce_receipt_review($1,$2,$3,$4,$5,'synthetic-reference','fixture','Synthetic-request',null)",
          [
            f.a,
            job.job,
            job.claim,
            JSON.stringify(context),
            JSON.stringify(verdict),
          ],
        );
        await f.as(f.owner);
        await db.query(
          "select confirm_workforce_receipt_review($1,$2,$3,6,$4,'Synthetic human confirmation')",
          [f.a, randomUUID(), e.id, job.job],
        );
        assert.equal(
          (
            await db.query<{ ready: boolean }>(
              "select app_private.workforce_review_is_current($1,$2) ready",
              [f.a, e.id],
            )
          ).rows[0].ready,
          true,
        );
        await db.exec("reset role");
        await db.query(
          "insert into time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,source,created_by,updated_by) values($1,$2,$3,$4,now()-interval '1 hour',now(),'MANUAL',$5,$5)",
          [randomUUID(), f.a, f.worker.id, f.project, f.owner],
        );
        await f.as(f.owner);
        await assert.rejects(
          f.record([{ id: e.id, version: 7 }]),
          /reimbursement_review_required/,
        );
      },
    );
    await t.test(
      "unreviewed receipts block a complete worker batch atomically",
      async () => {
        const a = await f.approve(),
          b = await f.approve("propio", false);
        await f.as(f.owner);
        await assert.rejects(f.record([a, b]), /reimbursement_review_required/);
        assert.equal((await f.row(a.id)).reimbursed_at, null);
        assert.equal((await f.row(b.id)).reimbursed_at, null);
      },
    );
    await t.test(
      "the complete reviewed batch succeeds and removes debt without changing project cost",
      async () => {
        const g = await reimbursementFixture(db),
          a = await g.approve(),
          b = await g.approve();
        await g.as(g.owner);
        const before = (
          await db.query<{ data: { active: string; reimbursements: string } }>(
            "select expense_register($1) data",
            [g.a],
          )
        ).rows[0].data;
        const result = await g.record([a, b], { all: true });
        assert.equal(result.count, 2);
        assert.equal(result.amount, "200.00");
        const balance = reimbursementBalancesSchema.parse(await g.balances());
        assert.equal(balance.debt, "0.00");
        assert.equal(balance.recorded_count, 2);
        const after = (
          await db.query<{ data: { active: string; reimbursements: string } }>(
            "select expense_register($1) data",
            [g.a],
          )
        ).rows[0].data;
        assert.equal(after.active, before.active);
        assert.equal(after.reimbursements, "0.00");
        assert.equal(before.reimbursements, "200.00");
      },
    );
    await t.test(
      "worker, foreman, office and foreign company cannot register a reimbursement",
      async () => {
        const e = await f.approve();
        for (const actor of [f.worker.user, f.foreman.user, f.office.user]) {
          await f.as(actor);
          await assert.rejects(f.record([e]), /reimbursement_forbidden/);
        }
        await f.as(f.owner);
        await assert.rejects(
          f.record([e], { company: f.b }),
          /reimbursement_forbidden/,
        );
        await f.as(f.foreignWorker.user);
        assert.equal((await f.balances(f.b)).debt, "0.00");
        await assert.rejects(f.balances(f.a), /permission_denied/);
      },
    );
    await t.test(
      "a repeated request retains one stamp and audit; a new request cannot pay twice",
      async () => {
        const e = await f.approve();
        await f.as(f.owner);
        const req = randomUUID(),
          first = await f.record([e], { request: req });
        const before = await f.row(e.id);
        await f.as(f.owner);
        assert.deepEqual(await f.record([e], { request: req }), first);
        await assert.rejects(f.record([e]), /reimbursement_changed/);
        await assert.rejects(
          f.record([e], {
            request: req,
            note: "Different receipt confirmation",
          }),
          /request_conflict/,
        );
        const after = await f.row(e.id);
        assert.equal(after.version, 5);
        assert.equal(after.status, "OFFICE_APPROVED");
        assert.equal(after.amount, before.amount);
        assert.deepEqual(
          after.reimbursement_snapshot,
          before.reimbursement_snapshot,
        );
        assert.equal(after.reimbursed_by, f.owner);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from audit_events where entity='workforce_expenses' and entity_id=$1 and after_data->>'reimbursed_at' is not null",
              [e.id],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "stale versions, changed total, duplicates and changed complete set fail without partial effects",
      async () => {
        const a = await f.approve(),
          b = await f.approve();
        await f.as(f.owner);
        await assert.rejects(
          f.record([{ ...a, version: a.version - 1 }, b]),
          /reimbursement_changed/,
        );
        await assert.rejects(
          f.record([a, b], { total: "199.99" }),
          /reimbursement_changed/,
        );
        await assert.rejects(f.record([a, a]), /invalid_reimbursement/);
        await assert.rejects(
          f.record([a, b], { all: true }),
          /reimbursement_changed/,
        );
        assert.equal((await f.row(a.id)).reimbursed_at, null);
      },
    );
    await t.test(
      "archiving removes debt and keeps paid evidence; restoration never recreates a payment",
      async () => {
        const e = await f.approve();
        await f.as(f.owner);
        await f.record([e]);
        const before = await f.row(e.id);
        await f.as(f.owner);
        await db.query(
          "select archive_workforce_expense($1,$2,$3,5,false,'Synthetic archive paid evidence')",
          [f.a, randomUUID(), e.id],
        );
        await db.query(
          "select archive_workforce_expense($1,$2,$3,6,true,'Synthetic restoration paid evidence')",
          [f.a, randomUUID(), e.id],
        );
        const after = await f.row(e.id);
        for (const key of [
          "reimbursed_at",
          "reimbursed_by",
          "reimbursement_snapshot",
          "reimbursement_note",
          "amount",
          "receipt_id",
          "foreman_by",
          "office_by",
        ])
          assert.deepEqual(after[key], before[key], key);
        assert.equal(after.version, 7);
        await f.as(f.owner);
        await assert.rejects(
          f.record([{ id: e.id, version: 7 }]),
          /reimbursement_changed/,
        );
      },
    );
    await t.test(
      "archive, payer and review revocations cannot be accepted from an old form",
      async () => {
        const e = await f.approve();
        await f.as(f.owner);
        await db.query(
          "select archive_workforce_expense($1,$2,$3,$4,false,'Synthetic remove debt')",
          [f.a, randomUUID(), e.id, e.version],
        );
        await assert.rejects(f.record([e]), /reimbursement_changed/);
        const companyPaid = await f.approve("empresa");
        await f.as(f.owner);
        await assert.rejects(f.record([companyPaid]), /reimbursement_changed/);
        const a = await f.approve();
        await db.exec("reset role");
        await db.query(
          "update workforce_expenses set admin_review_status='PENDING',admin_reviewed_by=null,admin_reviewed_at=null,admin_review_note=null,review_snapshot=null where id=$1",
          [a.id],
        );
        await f.as(f.owner);
        await assert.rejects(f.record([a]), /reimbursement_review_required/);
      },
    );
    await t.test(
      "revoked manager cannot replay an accepted request or read former-company balances",
      async () => {
        const e = await f.approve(),
          request = randomUUID();
        await f.as(f.otherOwner);
        await f.record([e], { request });
        await f.as(f.owner);
        await db.query("select set_member_access($1,$2,'member',false,'{}')", [
          f.a,
          f.otherOwner,
        ]);
        await f.as(f.otherOwner);
        await assert.rejects(
          f.record([e], { request }),
          /reimbursement_forbidden/,
        );
        await assert.rejects(f.balances(), /permission_denied/);
      },
    );
    await t.test(
      "recording a reimbursement does not create payments or administrative copies and cannot be forged directly",
      async () => {
        await f.as(f.worker.user);
        await assert.rejects(
          db.query("update workforce_expenses set reimbursed_at=now()"),
          /permission denied/,
        );
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from payments",
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from expenses",
            )
          ).rows[0].n,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
