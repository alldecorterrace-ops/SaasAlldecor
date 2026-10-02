import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fullDatabase } from "../tests/helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
async function main() {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    company = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID();
  try {
    await db.query(
      "insert into auth.users values($1,'payment-reference@example.test',now())",
      [owner],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
    await db.query("select create_company($1,'Synthetic payment reference')", [
      company,
    ]);
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({ full_name: "Synthetic", status: "active" }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
      company,
      estimate,
      JSON.stringify({
        customer_id: customer,
        status: "PENDIENTE",
        estimate_date: "2026-10-02",
        valid_until: null,
        discount: "0",
        taxes: "0",
        notes: "",
        items: [{ ...emptyItem, name: "QA", unit_price: "100.10" }],
      }),
    ]);
    const invoice = (
      await db.query<{ id: string }>(
        "select approve_estimate($1,$2,1,'2026-10-02','QA','Synthetic approval') id",
        [company, estimate],
      )
    ).rows[0].id;
    const pairs = [
      ["CASH", "EFECTIVO"],
      ["CHEQUE", "CHEQUE"],
      ["Wire transfer", "TRANSFERENCIA"],
      ["ZELLE", "ZELLE"],
      ["Not charged.", "NOT_CHARGED"],
      ["", "SIN_METODO"],
    ];
    const cases: object[] = [];
    let version = 1;
    for (const [raw, canonical, amount] of [
      ...pairs.map(([raw, canonical], i) => [
        raw,
        canonical,
        i === 5 ? "95.05" : "1.01",
      ]),
      ["CASH", "EFECTIVO", "1.01"],
      ["CASH", "EFECTIVO", "0.00"],
    ]) {
      let status = 200,
        error: null | string = null;
      try {
        await db.query("select record_payment($1,$2,$3,$4,$5)", [
          company,
          randomUUID(),
          invoice,
          version,
          JSON.stringify({
            amount,
            payment_date: "2026-10-02",
            method: canonical,
            reference: "",
            notes: "",
          }),
        ]);
        version++;
      } catch (e) {
        status = 422;
        error =
          e instanceof Error && e.message.includes("overpayment")
            ? "overpayment"
            : "amount_positive";
      }
      const row = (
        await db.query<{
          paid_amount: string;
          balance_due: string;
          payment_status: string;
        }>(
          "select paid_amount,balance_due,payment_status from invoices where id=$1",
          [invoice],
        )
      ).rows[0];
      const payments = (
        await db.query<{ method: string }>(
          "select method from payments where invoice_id=$1 order by created_at,id",
          [invoice],
        )
      ).rows;
      cases.push({
        name: `${canonical}-${amount}`,
        input: {
          invoice_external_id: "QA-INV",
          amount,
          payment_date: "2026-10-02",
          method: raw,
          notes: "",
          reference: "",
        },
        actual: {
          status,
          error,
          ...row,
          count: payments.length,
          methods: payments.map((p) => p.method),
        },
      });
    }
    const rows = (await db.query<{ id: string }>("select id from payments where invoice_id=$1 order by created_at,id", [invoice])).rows;
    const operations = [
      { operation: "invoiceVoid", input: { external_id: "QA-INV", reason: "Synthetic annulment" }, payment: null },
      { operation: "invoiceVoid", input: { external_id: "QA-INV", reason: "Repeated annulment" }, payment: null },
      { operation: "paymentVoid", input: { external_id: "QA-PAY-1", reason: "Synthetic reversal" }, payment: rows[0].id },
      { operation: "paymentVoid", input: { external_id: "QA-PAY-1", reason: "Repeated reversal" }, payment: rows[0].id },
      { operation: "paymentVoid", input: { external_id: "QA-PAY-2", reason: "Second reversal" }, payment: rows[1].id },
    ];
    for (const step of operations) {
      const current = (await db.query<{ version: number }>("select version from invoices where id=$1", [invoice])).rows[0];
      if (step.operation === "invoiceVoid") {
        await db.query("select update_invoice($1,$2,$3,'2026-10-02',null,'',$4)", [company, invoice, current.version, step.input.reason]);
      } else {
        const pay = (await db.query<{ version: number }>("select version from payments where id=$1", [step.payment])).rows[0];
        await db.query("select void_payment($1,$2,$3,$4)", [company, step.payment, pay.version, step.input.reason]);
      }
      const state = (await db.query<Record<string, unknown>>("select paid_amount,balance_due,payment_status from invoices where id=$1", [invoice])).rows[0];
      const payments = (await db.query<{ method: string; amount: string; status: string; void_reason: string }>("select method,amount,status,void_reason from payments where invoice_id=$1 order by created_at,id", [invoice])).rows;
      cases.push({ name: step.operation + "-" + step.input.reason, operation: step.operation, input: step.input, actual: { status: 200, error: null, ...state, count: payments.length, methods: payments.map(p => p.method), payment_states: payments.map(p => ({ amount: p.amount, status: p.status, reason: p.void_reason })) } });
    }
    await mkdir(".local", { recursive: true });
    await writeFile(
      ".local/payment-reference-input.json",
      JSON.stringify(cases),
    );
    console.log(
      `Generated ${cases.length} isolated SaaS payment reference results.`,
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Payment reference failed");
  process.exitCode = 1;
});
