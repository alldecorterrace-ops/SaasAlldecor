import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { parseFinanceRequest } from "../src/lib/finance-requests";

test("ADT annulment accepts a nonempty one-character reason and rejects an empty form", () => {
  for (const operation of ["void-invoice", "void-payment"]) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ operation, id: randomUUID(), request: randomUUID(), version: "1", date: "2026-10-02", due: "", notes: "", reason: "X" })) form.set(key, value);
    assert.equal(parseFinanceRequest(form).success, true);
    form.set("reason", " ");
    assert.equal(parseFinanceRequest(form).success, false);
  }
});

test("ADT invoice annulment preserves payments and document snapshots", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(), staff = randomUUID(), a = randomUUID(), b = randomUUID(), customer = randomUUID();
  const as = async (id: string, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  };
  const row = async (id: string) => (await db.query<Record<string, unknown>>("select * from invoices where id=$1", [id])).rows[0];
  const payments = async (id: string) => (await db.query<Record<string, unknown>>("select * from payments where invoice_id=$1 order by created_at,id", [id])).rows;
  const execute = async (operation: string, id: string, version: number, data: object, request = randomUUID(), company = a) =>
    (await db.query<{ result: unknown }>("select execute_finance_action($1,$2,$3,$4,$5,$6) result", [company, request, operation, id, version, JSON.stringify(data)])).rows[0].result;
  const voidData = { date: "2026-10-03", due: "2026-10-04", notes: "Must not replace the invoice", reason: "Synthetic annulment" };
  const fixture = async (amounts: string[]) => {
    const estimate = randomUUID();
    await db.query("select save_estimate($1,$2,0,$3)", [a, estimate, JSON.stringify({ customer_id: customer, status: "PENDIENTE", estimate_date: "2026-10-02", valid_until: null, discount: "0", taxes: "0", notes: "Original notes", items: [{ ...emptyItem, name: "Synthetic service", unit_price: "100.10" }] })]);
    const invoice = (await db.query<{ id: string }>("select approve_estimate($1,$2,1,'2026-10-02','Synthetic project','Synthetic approval') id", [a, estimate])).rows[0].id;
    for (const amount of amounts) {
      const current = await row(invoice);
      await execute("payment", invoice, Number(current.version), { payment_id: randomUUID(), amount, payment_date: "2026-10-02", method: "ZELLE", reference: randomUUID(), notes: "Original payment" });
    }
    return invoice;
  };
  const fingerprint = async () => {
    await db.exec("reset role");
    const result = (await db.query<Record<string, unknown>>("select (select jsonb_agg(to_jsonb(i) order by id) from invoices i) invoices,(select jsonb_agg(to_jsonb(p) order by id) from payments p) payments,(select jsonb_agg(to_jsonb(p) order by id) from projects p) projects,(select jsonb_agg(to_jsonb(d) order by id) from commercial_documents d) documents,(select count(*) from audit_events) audits,(select count(*) from app_private.finance_requests) receipts")).rows;
    await as(owner);
    return result;
  };
  try {
    await db.query("insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())", [owner, staff]);
    await as(owner);
    await db.query("select create_company($1,'Annulment A'),create_company($2,'Annulment B')", [a, b]);
    await db.query("select save_customer($1,$2,0,$3)", [a, customer, JSON.stringify({ full_name: "Synthetic customer", status: "active" })]);
    await db.query("select add_company_member($1,'staff@example.test')", [a]);
    for (const amounts of [[], ["25.10"], ["25.10", "75.00"]]) {
      await t.test(`unpaid/partial/paid annulment: ${amounts.join("+") || "unpaid"}`, async () => {
        const invoice = await fixture(amounts);
        const before = await row(invoice), beforePayments = await payments(invoice);
        const project = (await db.query("select * from projects where id=$1", [before.project_id])).rows;
        const document = (await db.query<{ data: unknown }>("select to_jsonb(prepare_commercial_document($1,'invoice',$2,$3)) data", [a, invoice, before.version])).rows[0].data;
        const request = randomUUID();
        const reply = await execute("void-invoice", invoice, Number(before.version), voidData, request);
        const after = await row(invoice);
        for (const [key, value] of Object.entries(before)) {
          if (!["status", "payment_status", "void_reason", "version", "updated_by", "updated_at"].includes(key)) assert.deepEqual(after[key], value, `Invoice ${key} is preserved`);
        }
        assert.equal(after.status, "VOID");
        assert.equal(after.payment_status, "VOID");
        assert.equal(after.version, Number(before.version) + 1);
        const afterPayments = await payments(invoice);
        assert.equal(afterPayments.length, beforePayments.length);
        for (let n = 0; n < beforePayments.length; n++) {
          for (const [key, value] of Object.entries(beforePayments[n])) {
            if (!["status", "void_reason", "version", "updated_by", "updated_at"].includes(key)) assert.deepEqual(afterPayments[n][key], value, `Payment ${key} is preserved`);
          }
          assert.equal(afterPayments[n].status, "ASSOCIATED_TO_VOID_INVOICE");
          assert.equal(afterPayments[n].void_reason, voidData.reason);
          assert.equal(afterPayments[n].version, Number(beforePayments[n].version) + 1);
        }
        assert.deepEqual((await db.query("select * from projects where id=$1", [before.project_id])).rows, project);
        assert.deepEqual((await db.query<{ data: unknown }>("select to_jsonb(d) data from commercial_documents d where record_id=$1", [invoice])).rows[0].data, document);
        const unchanged = await fingerprint();
        assert.deepEqual(await execute("void-invoice", invoice, Number(before.version), voidData, request), reply);
        // ADT also accepts another annulment of an already-void invoice without changes.
        await execute("void-invoice", invoice, Number(before.version), { ...voidData, reason: "Repeated annulment" });
        const afterRepeat = await fingerprint();
        assert.deepEqual(afterRepeat.map(x => ({ ...x, receipts: 0 })), unchanged.map(x => ({ ...x, receipts: 0 })));
        await assert.rejects(execute("void-invoice", invoice, Number(before.version), { ...voidData, reason: "Changed request" }, request), /request_conflict/);
        await assert.rejects(execute("payment", invoice, Number(after.version), { payment_id: randomUUID(), amount: "1.00", payment_date: "2026-10-02", method: "ZELLE", reference: "", notes: "" }), /invoice_void/);
        await assert.rejects(execute("invoice", invoice, Number(after.version), { date: "2026-10-02", due: null, notes: "Alter" }), /invoice_void/);
        await assert.rejects(db.query("select prepare_commercial_document($1,'invoice',$2,$3)", [a, invoice, after.version]), /document_state/);
        assert.deepEqual(await fingerprint(), afterRepeat);
        if (afterPayments.length) {
          const first = afterPayments[0], reversalRequest = randomUUID();
          await assert.rejects(execute("void-payment", String(first.id), Number(first.version) - 1, { reason: "Stale revision" }), /record_conflict/);
          const reversed = await execute("void-payment", String(first.id), Number(first.version), { reason: "Synthetic reversal" }, reversalRequest);
          const recomputed = await row(invoice);
          assert.equal(recomputed.paid_amount, "0.00");
          assert.equal(recomputed.balance_due, "100.10");
          assert.equal(recomputed.payment_status, "VOID");
          assert.equal((await payments(invoice))[0].status, "VOID");
          assert((await payments(invoice)).slice(1).every(p => p.status === "ASSOCIATED_TO_VOID_INVOICE"));
          const afterReversal = await fingerprint();
          assert.deepEqual(await execute("void-payment", String(first.id), Number(first.version), { reason: "Synthetic reversal" }, reversalRequest), reversed);
          assert.deepEqual(await fingerprint(), afterReversal);
        }
      });
    }
    await t.test("previously reversed payments remain unchanged, invalid/stale/foreign operations have no effects", async () => {
      const invoice = await fixture(["25.10", "25.10"]), pay = (await payments(invoice))[0];
      await execute("void-payment", String(pay.id), Number(pay.version), { reason: "Earlier reversal" });
      const old = (await payments(invoice))[0], current = await row(invoice), before = await fingerprint();
      await assert.rejects(execute("void-invoice", invoice, Number(current.version) - 1, voidData), /record_conflict/);
      await assert.rejects(execute("void-invoice", invoice, Number(current.version), { ...voidData, reason: " " }), /reason_required/);
      const { reason: _reason, ...missingReason } = voidData;
      assert.equal(_reason, "Synthetic annulment");
      await assert.rejects(execute("void-invoice", invoice, Number(current.version), missingReason), /reason_required/);
      await assert.rejects(execute("void-invoice", invoice, Number(current.version), voidData, randomUUID(), b), /record_conflict/);
      assert.deepEqual(await fingerprint(), before);
      await execute("void-invoice", invoice, Number(current.version), { ...voidData, reason: "X" });
      assert.deepEqual((await payments(invoice))[0], old);
      assert.equal((await row(invoice)).paid_amount, "25.10");
      assert.equal((await row(invoice)).balance_due, "75.00");
    });
    await t.test("reader, revoked writer and anonymous actor cannot annul or retry", async () => {
      const invoice = await fixture(["25.10"]), current = await row(invoice);
      await db.query("select set_member_access($1,$2,'member',true,$3)", [a, staff, JSON.stringify({ "fin-invoices": ["read"] })]);
      await as(staff);
      await assert.rejects(execute("void-invoice", invoice, Number(current.version), voidData), /permission_denied/);
      await as(owner);
      await db.query("select set_member_access($1,$2,'member',true,$3)", [a, staff, JSON.stringify({ "fin-invoices": ["write"] })]);
      await as(staff);
      const request = randomUUID();
      await execute("void-invoice", invoice, Number(current.version), voidData, request);
      await as(owner);
      await db.query("select set_member_access($1,$2,'member',false,'{}')", [a, staff]);
      const before = await fingerprint();
      await as(staff);
      await assert.rejects(execute("void-invoice", invoice, Number(current.version), voidData, request), /permission_denied/);
      await as("", "anon");
      await assert.rejects(execute("void-invoice", invoice, Number(current.version), voidData), /permission denied/);
      assert.deepEqual(await fingerprint(), before);
    });
  } finally { await db.close(); }
});
