import { randomUUID } from "node:crypto";
import {
  receiptReviewFixture,
  type ReceiptTestDb,
} from "./receipt-review-fixture";
export async function reimbursementFixture(db: ReceiptTestDb) {
  const f = await receiptReviewFixture(db),
    foreman = { user: randomUUID(), id: randomUUID() };
  await db.exec("reset role");
  await db.query("insert into auth.users values($1,$2,now())", [
    foreman.user,
    foreman.user + "@example.test",
  ]);
  await f.as(f.owner);
  await db.query("select add_company_member($1,$2)", [
    f.a,
    foreman.user + "@example.test",
  ]);
  await db.query("select set_member_access($1,$2,'member',true,$3)", [
    f.a,
    foreman.user,
    JSON.stringify({ horasfix: ["write"] }),
  ]);
  await db.query("select save_worker($1,$2,0,$3)", [
    f.a,
    foreman.id,
    JSON.stringify({
      name: "Synthetic foreman",
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
    f.a,
    foreman.id,
    foreman.user + "@example.test",
  ]);
  await db.query(
    "select configure_workforce($1,$2,$3,0,'FOREMAN',null,true,'Synthetic reimbursement fixture')",
    [f.a, randomUUID(), foreman.id],
  );
  await db.query(
    "select save_workforce_assignment($1,$2,$3,0,$4,$5,now()-interval '2 days',null,true,'Synthetic reimbursement fixture')",
    [f.a, randomUUID(), randomUUID(), foreman.id, f.project],
  );
  await db.query(
    "select configure_workforce($1,$2,$3,1,'WORKER',$4,true,'Synthetic reimbursement supervisor')",
    [f.a, randomUUID(), f.worker.id, foreman.id],
  );
  const approve = async (method = "propio", review = true) => {
    const e = await f.create();
    await f.as(f.owner);
    if (review)
      await db.query(
        "select correct_workforce_expense($1,$2,$3,1,$4,false,$5,100,'MATERIALS','Synthetic receipt',$6,$7,'Synthetic visual receipt review')",
        [f.a, randomUUID(), e.id, f.project, f.day, method, e.receipt],
      );
    else if (method !== "propio") {
      await db.exec("reset role");
      await db.query(
        "update workforce_expenses set pay_method=$2 where id=$1",
        [e.id, method],
      );
    }
    await f.as(foreman.user);
    await db.query(
      "select decide_workforce_expense($1,$2,$3,$4,'APPROVE','Synthetic foreman approval')",
      [f.a, randomUUID(), e.id, review ? 2 : 1],
    );
    await f.as(f.office.user);
    await db.query(
      "select decide_workforce_expense($1,$2,$3,$4,'APPROVE','Synthetic office approval')",
      [f.a, randomUUID(), e.id, review ? 3 : 2],
    );
    return { ...e, version: review ? 4 : 3 };
  };
  const record = async (
    items: Array<{ id: string; version: number }>,
    options: {
      request?: string;
      total?: string;
      all?: boolean;
      worker?: string;
      company?: string;
      note?: string;
    } = {},
  ) =>
    (
      await db.query<{ data: Record<string, unknown> }>(
        "select record_workforce_reimbursement($1,$2,$3,$4,$5,$6,$7) data",
        [
          options.company ?? f.a,
          options.request ?? randomUUID(),
          options.worker ?? f.worker.id,
          JSON.stringify(items.map(({ id, version }) => ({ id, version }))),
          options.total ?? String(items.length * 100),
          options.all ?? false,
          options.note ?? "Synthetic record of a previous payment; no transfer",
        ],
      )
    ).rows[0].data;
  const balances = async (company = f.a) =>
    (
      await db.query<{ data: Record<string, unknown> }>(
        "select workforce_reimbursement_balances($1) data",
        [company],
      )
    ).rows[0].data;
  return { ...f, foreman, approve, record, balances };
}
