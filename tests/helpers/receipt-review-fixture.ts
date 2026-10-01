import { randomUUID, createHash } from "node:crypto";
import { emptyItem } from "../../src/lib/estimates";
export interface ReceiptTestDb {
  query<T = Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}
export async function receiptReviewFixture(db: ReceiptTestDb) {
  const owner = randomUUID(),
    otherOwner = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  const worker = { user: randomUUID(), id: randomUUID() },
    office = { user: randomUUID(), id: randomUUID() },
    foreignWorker = { user: randomUUID(), id: randomUUID() };
  const as = async (user: string, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role " + role);
  };
  for (const user of [
    owner,
    otherOwner,
    worker.user,
    office.user,
    foreignWorker.user,
  ])
    await db.query("insert into auth.users values($1,$2,now())", [
      user,
      user + "@example.test",
    ]);
  await as(owner);
  await db.query(
    "select create_company($1,'Receipt synthetic A'),create_company($2,'Receipt synthetic B')",
    [a, b],
  );
  await db.query("select add_company_member($1,$2)", [
    a,
    otherOwner + "@example.test",
  ]);
  await db.query("select set_member_access($1,$2,'admin',true,'{}')", [
    a,
    otherOwner,
  ]);
  const projectFor = async (company: string) => {
    const customer = randomUUID(),
      estimate = randomUUID();
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "Synthetic receipt customer",
        email: "",
        status: "active",
      }),
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
      "select approve_estimate($1,$2,1,'2026-09-30','Synthetic receipt project','Synthetic test')",
      [company, estimate],
    );
    return (
      await db.query<{ id: string }>(
        "select id from projects where company_id=$1 and estimate_id=$2",
        [company, estimate],
      )
    ).rows[0].id;
  };
  const project = await projectFor(a),
    foreignProject = await projectFor(b);
  for (const [who, company, pid, role] of [
    [worker, a, project, "WORKER"],
    [office, a, project, "OFFICE"],
    [foreignWorker, b, foreignProject, "WORKER"],
  ] as const) {
    await db.query("select add_company_member($1,$2)", [
      company,
      who.user + "@example.test",
    ]);
    await db.query("select set_member_access($1,$2,'member',true,$3)", [
      company,
      who.user,
      JSON.stringify({ horasfix: ["write"] }),
    ]);
    await db.query("select save_worker($1,$2,0,$3)", [
      company,
      who.id,
      JSON.stringify({
        name: "Synthetic worker",
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
      company,
      who.id,
      who.user + "@example.test",
    ]);
    await db.query(
      "select configure_workforce($1,$2,$3,0,$4,null,true,'Synthetic receipt test')",
      [company, randomUUID(), who.id, role],
    );
    await db.query(
      "select save_workforce_assignment($1,$2,$3,0,$4,$5,now()-interval '2 days',null,true,'Synthetic receipt test')",
      [company, randomUUID(), randomUUID(), who.id, pid],
    );
  }
  const day = (
    await db.query<{ day: string }>(
      'select (now() at time zone timezone)::date::text as "day" from companies where id=$1',
      [a],
    )
  ).rows[0].day;
  const create = async (
    company = a,
    who = worker,
    pid = project,
    sha?: string,
  ) => {
    const id = randomUUID();
    await as(who.user);
    const receipt = (
      await db.query<{ id: string }>(
        "select (prepare_workforce_receipt($1,$2,$3,33,'png','Synthetic receipt.png')).id",
        [company, id, sha ?? createHash("sha256").update(id).digest("hex")],
      )
    ).rows[0].id;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('workforce-receipts',$1)",
      [company + "/" + id + "/" + receipt + ".png"],
    );
    await db.query(
      "select submit_workforce_expense($1,$2,$3,$4,now(),100,'MATERIALS','Synthetic receipt',$5,'propio')",
      [company, randomUUID(), id, pid, receipt],
    );
    return { id, receipt, company };
  };
  const prepare = async (
    e: { id: string; company: string },
    version = 1,
    request = randomUUID(),
  ) =>
    (
      await db.query<{
        data: {
          job: string;
          claimed: boolean;
          claim?: string;
          status: string;
          version: number;
        };
      }>("select prepare_workforce_receipt_review($1,$2,$3,$4) data", [
        e.company,
        request,
        e.id,
        version,
      ])
    ).rows[0].data;
  const context = async (company: string, job: string) =>
    (
      await db.query<{
        data: import("../../src/lib/receipt-review").ReceiptReviewContext;
      }>("select workforce_receipt_review_context($1,$2,$3) data", [
        company,
        job,
        day,
      ])
    ).rows[0].data;
  const row = async (id: string) => {
    await db.exec("reset role");
    return (
      await db.query<Record<string, unknown>>(
        "select * from workforce_expenses where id=$1",
        [id],
      )
    ).rows[0];
  };
  return {
    db,
    owner,
    otherOwner,
    a,
    b,
    worker,
    office,
    foreignWorker,
    project,
    foreignProject,
    day,
    as,
    create,
    prepare,
    context,
    row,
  };
}
