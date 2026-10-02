import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { emptyItem } from "../src/lib/estimates";
import { workspaces } from "../src/lib/workspaces";
async function main() {
  const url = new URL(process.env.QUEUE_TEST_DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/saas_queue_test"
  )
    throw new Error("Dedicated loopback test database required");
  const pool = new Pool({
    connectionString: url.href,
    max: 12,
    statement_timeout: 30000,
  });
  const owner = id(),
    staff = id(),
    company = id(),
    customer = id(),
    estimate = id(),
    worker = id(),
    secondWorker = id(),
    sharedWorker = id(),
    stock = id();
  const actor = async <T>(
    user: string,
    run: (c: PoolClient) => Promise<T>,
    name = "saas-work-request",
  ) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('application_name',$2,true)",
        [user, name],
      );
      await c.query("set local role authenticated");
      const r = await run(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  const execute = (
    operation: string,
    kind: string,
    record: string,
    version: number,
    body: object,
    request = id(),
    user = owner,
    name = "saas-work-request",
  ) =>
    actor(
      user,
      async (c) =>
        (
          await c.query(
            "select execute_work_action($1,$2,$3,$4,$5,$6,$7) data",
            [
              company,
              request,
              operation,
              kind,
              record,
              version,
              JSON.stringify(body),
            ],
          )
        ).rows[0].data,
      name,
    );
  const protectedFinance = async () =>
    (
      await pool.query(
        "select (select jsonb_agg(to_jsonb(v) order by id) from invoices v) invoices,(select jsonb_agg(to_jsonb(v) order by id) from payments v) payments,(select jsonb_agg(to_jsonb(v) order by id) from expenses v) expenses",
      )
    ).rows[0];
  try {
    await pool.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$3,now()),($2,$4,now())",
      [owner, staff, owner + "@example.test", staff + "@example.test"],
    );
    const project = await actor(owner, async (c) => {
      await c.query("select create_company($1,'Synthetic native operations')", [
        company,
      ]);
      await c.query("select add_company_member($1,$2)", [
        company,
        staff + "@example.test",
      ]);
      await c.query("select set_member_access($1,$2,'member',true,$3)", [
        company,
        staff,
        JSON.stringify({ inventario: ["write"] }),
      ]);
      await c.query("select save_customer($1,$2,0,$3)", [
        company,
        customer,
        JSON.stringify({
          full_name: "Synthetic concurrency",
          status: "active",
        }),
      ]);
      await c.query("select save_estimate($1,$2,0,$3)", [
        company,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: "2026-10-01",
          valid_until: null,
          status: "PENDIENTE",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "Synthetic", unit_price: "100" }],
        }),
      ]);
      const invoice = (
        await c.query(
          "select approve_estimate($1,$2,1,'2026-10-01','Synthetic operations','Synthetic approval') id",
          [company, estimate],
        )
      ).rows[0].id;
      for (const workerId of [worker, secondWorker, sharedWorker])
        await c.query("select save_worker($1,$2,0,$3)", [
          company,
          workerId,
          JSON.stringify({
            name: "Synthetic responsible " + workerId,
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
      return (
        await c.query("select project_id from invoices where id=$1", [invoice])
      ).rows[0].project_id;
    });
    const beforeFinance = await protectedFinance();
    const item = {
      name: "Synthetic material",
      status: "ACTIVO",
      project_id: null,
      worker_id: null,
      data: { ...workspaces.inventory.defaults, sku: id(), unit: "ft" },
    };
    const saveRequest = id(),
      saved = await Promise.all(
        Array.from({ length: 8 }, () =>
          execute("save", "inventory", stock, 0, item, saveRequest),
        ),
      );
    assert(saved.every((x) => JSON.stringify(x) === JSON.stringify(saved[0])));
    assert.equal(saved[0].version, 1);
    const movement = id(),
      moveRequest = id(),
      move = {
        movement_id: movement,
        quantity: "10.125",
        movement_date: "2026-10-01",
        reason: "Synthetic input",
        reference: "",
        project_id: project,
        reversal_of: "",
      };
    const moves = await Promise.all(
      Array.from({ length: 8 }, () =>
        execute("movement", "inventory", stock, 1, move, moveRequest),
      ),
    );
    assert(moves.every((x) => JSON.stringify(x) === JSON.stringify(moves[0])));
    assert.equal(moves[0].version, 2);
    const race = await Promise.allSettled([
      execute("movement", "inventory", stock, 2, {
        ...move,
        movement_id: id(),
        quantity: "-3.125",
      }),
      execute("movement", "inventory", stock, 2, {
        ...move,
        movement_id: id(),
        quantity: "-3.125",
      }),
    ]);
    assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(race.filter((x) => x.status === "rejected").length, 1);
    const balance = (
      await pool.query(
        "select stock,version,(select count(*)::int from inventory_movements where item_id=$1) movements from work_records where id=$1",
        [stock],
      )
    ).rows[0];
    assert.deepEqual(balance, { stock: "7.000", version: 3, movements: 2 });
    const schedule = {
      name: "Synthetic schedule",
      status: "PROGRAMADA",
      project_id: project,
      worker_id: worker,
      data: {
        ...workspaces.installations.defaults,
        starts_at: "2026-10-05T13:00:00Z",
        ends_at: "2026-10-05T17:00:00Z",
        crew_worker_ids: [sharedWorker],
      },
    };
    const schedules = await Promise.allSettled([
      execute("save", "installations", id(), 0, schedule),
      execute("save", "installations", id(), 0, {
        ...schedule,
        worker_id: secondWorker,
      }),
    ]);
    assert.equal(schedules.filter((x) => x.status === "fulfilled").length, 1);
    const conflict = schedules.find((x) => x.status === "rejected");
    assert(conflict?.status === "rejected");
    assert.match(String(conflict.reason), /schedule_overlap/);
    const manual = id(),
      attachment = id(),
      fileRequest = id(),
      path = `${company}/${manual}/${attachment}.pdf`;
    await execute("save", "manuals", manual, 0, {
      name: "Synthetic manual",
      status: "APROBADO",
      project_id: project,
      worker_id: null,
      data: { ...workspaces.manuals.defaults, steps: "Synthetic instructions" },
    });
    await pool.query(
      "insert into storage.objects(bucket_id,name) values('work-files',$1)",
      [path],
    );
    const file = {
      attachment_id: attachment,
      path,
      name: "Synthetic.pdf",
      active: true,
      content_sha256: "synthetic-ci-only",
    };
    const files = await Promise.all(
      Array.from({ length: 8 }, () =>
        execute("attachment", "manuals", manual, 1, file, fileRequest),
      ),
    );
    assert(files.every((x) => JSON.stringify(x) === JSON.stringify(files[0])));
    assert.equal(files[0].version, 2);
    assert.equal(files[0].status, "EN_REVISION");
    const archiveRequest = id(),
      archive = { ...file, active: false, content_sha256: null };
    const archives = await Promise.all(
      Array.from({ length: 8 }, () =>
        execute("attachment", "manuals", manual, 2, archive, archiveRequest),
      ),
    );
    assert(
      archives.every((x) => JSON.stringify(x) === JSON.stringify(archives[0])),
    );
    assert.deepEqual(
      (
        await pool.query(
          "select active,version from work_attachments where id=$1",
          [attachment],
        )
      ).rows[0],
      { active: false, version: 2 },
    );
    const gate = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await gate.query("begin");
      await gate.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        company + ":work-actions",
      ]);
      pending = execute(
        "save",
        "inventory",
        stock,
        3,
        { ...item, name: "Revoked writer" },
        id(),
        staff,
        "saas-work-revocation",
      ).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );
      let blocked = false;
      for (let n = 0; n < 80; n++) {
        if (
          (
            await pool.query(
              "select exists(select 1 from pg_stat_activity where application_name='saas-work-revocation' and wait_event='advisory') blocked",
            )
          ).rows[0].blocked
        ) {
          blocked = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      assert(blocked, "The writer must wait on a real concurrent transaction");
      await actor(owner, (c) =>
        c.query("select set_member_access($1,$2,'member',false,'{}')", [
          company,
          staff,
        ]),
      );
      await gate.query("commit");
      const result = (await pending) as { ok: boolean; error?: unknown };
      assert.equal(result.ok, false);
      assert.match(String(result.error), /permission_denied/);
    } finally {
      await gate.query("rollback");
      gate.release();
      if (pending) await pending;
    }
    assert.equal(
      (
        await pool.query("select version from work_records where id=$1", [
          stock,
        ])
      ).rows[0].version,
      3,
    );
    assert.deepEqual(await protectedFinance(), beforeFinance);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from app_private.work_requests where company_id=$1",
          [company],
        )
      ).rows[0].n,
      7,
    );
    console.log(
      JSON.stringify({
        operations: {
          save_attempts: 8,
          save_effects: 1,
          movement_attempts: 8,
          movement_effects: 1,
          stale_movements: 2,
          stale_effects: 1,
          overlapping_schedules: 2,
          distinct_responsibles_shared_crew: true,
          schedule_effects: 1,
          attachment_attempts: 8,
          attachment_effects: 1,
          archive_attempts: 8,
          archive_effects: 1,
          revocation_wait_verified: true,
          revoked_effects: 0,
          payments_invoices_expenses_unchanged: true,
        },
      }),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    "Operational concurrency verification failed:",
    error instanceof Error ? error.message : "unknown",
  );
  process.exitCode = 1;
});
