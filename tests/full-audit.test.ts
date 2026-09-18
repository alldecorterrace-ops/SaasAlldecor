import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";

test("Full schema audit: financial workflow and access boundaries after every migration", async (t) => {
  const { db, files } = await fullDatabase();
  const owner = randomUUID(),
    staff = randomUUID(),
    other = randomUUID();
  const company = randomUUID(),
    foreign = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID();
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  try {
    await t.test(
      "all migrations compose, every public table uses RLS, no direct writes or anonymous table reads",
      async () => {
        assert.ok(files.length >= 14);
        const result = await db.query<{ name: string }>(`
        select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and (
          not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT')
          or has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE'))
      `);
        assert.deepEqual(result.rows, []);
        assert.equal(
          (await db.query("select * from public.module_catalog")).rows.length,
          23,
        );
        assert.deepEqual(
          (await db.query("select id from storage.buckets where public")).rows,
          [],
        );
      },
    );
    await t.test(
      "only the four intended public-link/form functions permit anonymous execution",
      async () => {
        const result = await db.query<{ name: string }>(`
        select p.proname name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')
        order by p.proname
      `);
        assert.deepEqual(
          result.rows.map((r) => r.name),
          [
            "read_client_share",
            "respond_client_share",
            "submit_web_request",
            "web_form_info",
          ],
        );
        const unpinned = await db.query(`
        select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','app_private') and p.prosecdef
        and not exists(select 1 from unnest(p.proconfig) x where x in ('search_path=""','search_path='))
      `);
        assert.deepEqual(unpinned.rows, []);
      },
    );
    for (const [uid, email] of [
      [owner, "audit-owner@example.test"],
      [staff, "audit-staff@example.test"],
      [other, "audit-other@example.test"],
    ]) {
      await db.query("insert into auth.users values($1,$2,now())", [
        uid,
        email,
      ]);
    }
    await as(owner);
    await db.query("select public.create_company($1,'Audit A')", [company]);
    await db.query(
      "select public.add_company_member($1,'audit-staff@example.test')",
      [company],
    );
    await as(other);
    await db.query("select public.create_company($1,'Audit B')", [foreign]);
    await as(owner);
    const input = {
      customer_id: customer,
      estimate_date: "2026-09-18",
      valid_until: null,
      status: "BORRADOR",
      notes: "Synthetic audit",
      discount: "0.10",
      taxes: "2.05",
      items: [
        {
          ...emptyItem,
          name: "Synthetic service",
          base: "unit",
          unit_price: "33.35",
          qty: "3",
        },
      ],
    };
    let invoice = "",
      project = "";
    const paymentId = randomUUID();
    const paymentData = {
      amount: "30.00",
      payment_date: "2026-09-18",
      method: "TRANSFERENCIA",
      reference: "AUDIT-ONLY",
      notes: "No money transferred",
    };
    const pay = () =>
      db.query("select public.record_payment($1,$2,$3,1,$4)", [
        company,
        paymentId,
        invoice,
        JSON.stringify(paymentData),
      ]);
    await t.test(
      "customer, decimal estimate, invoice, partial payment and project keep consistent references",
      async () => {
        await db.query("select public.save_customer($1,$2,0,$3)", [
          company,
          customer,
          JSON.stringify({ full_name: "Synthetic Customer", status: "active" }),
        ]);
        await db.query("select public.save_estimate($1,$2,0,$3)", [
          company,
          estimate,
          JSON.stringify(input),
        ]);
        invoice = (
          await db.query<{ id: string }>(
            "select public.approve_estimate($1,$2,1,'2026-09-18','Synthetic project','Synthetic approval') id",
            [company, estimate],
          )
        ).rows[0].id;
        await pay();
        await pay();
        const row = (
          await db.query<{
            project_id: string;
            total: string;
            paid_amount: string;
            balance_due: string;
            customer_id: string;
            estimate_id: string;
            version: number;
          }>("select * from public.invoices where id=$1", [invoice])
        ).rows[0];
        assert.equal(row.total, "102.00");
        assert.equal(row.paid_amount, "30.00");
        assert.equal(row.balance_due, "72.00");
        assert.equal(row.customer_id, customer);
        assert.equal(row.estimate_id, estimate);
        assert.equal(row.version, 2);
        project = row.project_id;
        await db.query("select public.update_project($1,$2,1,$3)", [
          company,
          project,
          JSON.stringify({
            name: "Synthetic project",
            status: "PRODUCCION",
            start_date: "2026-10-01",
            end_date: null,
            notes: "",
          }),
        ]);
        assert.equal(
          (
            await db.query(
              "select id from public.payments where invoice_id=$1",
              [invoice],
            )
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "late migrations do not reopen tenant access or payment/history permissions",
      async () => {
        await as(other);
        for (const table of [
          "customers",
          "estimates",
          "estimate_revisions",
          "invoices",
          "payments",
          "projects",
          "audit_events",
        ])
          assert.deepEqual(
            (
              await db.query(
                `select * from public.${table} where company_id=$1`,
                [company],
              )
            ).rows,
            [],
          );
        await assert.rejects(pay(), /permission_denied/);
        await assert.rejects(
          db.query("select * from public.record_history($1,'invoices',$2)", [
            company,
            invoice,
          ]),
          /permission_denied/,
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [company, staff, JSON.stringify({ "fin-invoices": ["read"] })],
        );
        await as(staff);
        assert.equal(
          (await db.query("select id from public.invoices")).rows.length,
          1,
        );
        assert.deepEqual(
          (await db.query("select id from public.projects")).rows,
          [],
        );
        await assert.rejects(pay(), /permission_denied/);
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [company, staff],
        );
        await as(staff);
        assert.deepEqual(
          (await db.query("select id from public.invoices")).rows,
          [],
        );
        await assert.rejects(
          db.query("select * from public.record_history($1,'invoices',$2)", [
            company,
            invoice,
          ]),
          /permission_denied/,
        );
        await as(owner);
      },
    );
    await t.test(
      "stale invoice edits cannot overwrite a newer payment; reversals retain history and idempotence",
      async () => {
        await as(owner);
        await assert.rejects(
          db.query(
            "select public.update_invoice($1,$2,1,'2026-09-18',null,'stale edit',null)",
            [company, invoice],
          ),
          /record_conflict/,
        );
        await db.query(
          "select public.void_payment($1,$2,1,'Synthetic correction')",
          [company, paymentId],
        );
        await pay(); // Replaying the old payment must never reactivate the reversed record.
        const row = (
          await db.query<{ balance_due: string; paid_amount: string }>(
            "select balance_due,paid_amount from public.invoices where id=$1",
            [invoice],
          )
        ).rows[0];
        assert.deepEqual(row, { balance_due: "102.00", paid_amount: "0.00" });
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from public.payments where id=$1",
              [paymentId],
            )
          ).rows[0].status,
          "VOID",
        );
        await db.query(
          "select public.update_invoice($1,$2,3,'2026-09-18',null,'','Synthetic void')",
          [company, invoice],
        );
        assert.equal(
          (
            await db.query("select id from public.invoices where id=$1", [
              invoice,
            ])
          ).rows.length,
          1,
        );
        assert.ok(
          (
            await db.query(
              "select * from public.record_history($1,'invoices',$2)",
              [company, invoice],
            )
          ).rows.length >= 4,
        );
      },
    );
  } finally {
    await db.close();
  }
});
