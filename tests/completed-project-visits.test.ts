import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { receiptReviewFixture } from "./helpers/receipt-review-fixture";
import { emptyItem } from "../src/lib/estimates";
import {
  punchProjectsSchema,
  visitLabel,
  visitReasons,
} from "../src/lib/time-visits";

test("Campo completed visits preserve clocks, finances, role scope and reasons", async (t) => {
  const { db } = await fullDatabase(
    "202610060081_workforce_project_choices.sql",
  );
  try {
    const f = await receiptReviewFixture(db);
    await f.as(f.owner);
    const existing = randomUUID();
    await db.query("select save_time_entry($1,$2,0,$3)", [
      f.a,
      existing,
      JSON.stringify({
        worker_id: f.worker.id,
        project_id: f.project,
        starts_at: "2000-01-01T12:00:00Z",
        ends_at: "2000-01-01T13:01:30Z",
        break_minutes: 5,
        status: "APROBADO",
        notes: "Synthetic old record",
        reason: "Synthetic preservation",
      }),
    ]);
    const oldRows = async () => {
      await db.exec("reset role");
      return (
        await db.query(
          "select jsonb_build_object('time',(select to_jsonb(t)-'visit_reason'-'punch_project_state' from time_entries t where id=$1),'invoices',(select jsonb_agg(to_jsonb(i) order by id) from invoices i),'payments',(select jsonb_agg(to_jsonb(p) order by id) from payments p),'assignments',(select jsonb_agg(to_jsonb(a) order by id) from workforce_assignments a),'members',(select jsonb_agg(to_jsonb(m) order by company_id,user_id) from memberships m)) data",
          [existing],
        )
      ).rows[0];
    };
    const before = await oldRows();
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610060082_completed_project_visits.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await t.test(
      "additive schema retains every original value and uses null metadata",
      async () => {
        assert.deepEqual(await oldRows(), before);
        assert.equal(
          (
            await db.query<{ visit_reason: string | null }>(
              "select visit_reason from time_entries where id=$1",
              [existing],
            )
          ).rows[0].visit_reason,
          null,
        );
      },
    );
    const catalog = async (user = f.worker.user, company = f.a) => {
      await f.as(user);
      return punchProjectsSchema.parse(
        (
          await db.query<{ data: unknown }>(
            "select time_punch_projects($1) data",
            [company],
          )
        ).rows[0].data,
      );
    };
    const row = async (id: string) =>
      (
        await db.query<Record<string, unknown>>(
          "select * from time_entries where id=$1",
          [id],
        )
      ).rows[0];
    const punch = async (
      id: string,
      action = "IN",
      project: string | null = f.project,
      reason: string | null = null,
      gps = true,
      company = f.a,
    ) => {
      const stamp = (
        await db.query<{ n: number }>(
          "select floor(extract(epoch from clock_timestamp()))::float8*1000 n",
        )
      ).rows[0].n;
      return db.query("select punch_time($1,$2,$3,$4,$5::jsonb,$6)", [
        company,
        id,
        action,
        project,
        gps
          ? JSON.stringify({ lat: 25.75, lng: -80.3, acc: 18, gps_ts: stamp })
          : null,
        reason,
      ]);
    };
    const rollback = async (run: () => Promise<void>) => {
      await db.exec("reset role;begin");
      try {
        await run();
      } finally {
        await db.exec("rollback;reset role");
      }
    };
    const reject = async (run: () => Promise<unknown>, match: RegExp) => {
      await db.exec("savepoint denied");
      try {
        await assert.rejects(run, match);
      } finally {
        await db.exec("rollback to denied;release denied");
      }
    };
    const projectFor = async (name: string) => {
      await f.as(f.owner);
      const estimate = randomUUID();
      const customer = (
        await db.query<{ id: string }>(
          "select customer_id id from projects where id=$1",
          [f.project],
        )
      ).rows[0].id;
      await db.query("select save_estimate($1,$2,0,$3)", [
        f.a,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: f.day,
          valid_until: null,
          status: "BORRADOR",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "Synthetic visit", unit_price: "100" }],
        }),
      ]);
      await db.query(
        "select approve_estimate($1,$2,1,$3,$4,'Synthetic visit test')",
        [f.a, estimate, f.day, name],
      );
      return (
        await db.query<{ id: string }>(
          "select id from projects where estimate_id=$1",
          [estimate],
        )
      ).rows[0].id;
    };
    const paid = await projectFor("Synthetic completed visit"),
      active = await projectFor("Synthetic active visit"),
      hidden = await projectFor("Synthetic unassigned no deposit");
    const pay = async (project: string, amount: string) => {
      await f.as(f.owner);
      const invoice = (
        await db.query<{ id: string; version: number }>(
          "select id,version from invoices where project_id=$1",
          [project],
        )
      ).rows[0];
      await db.query("select record_payment($1,$2,$3,$4,$5)", [
        f.a,
        randomUUID(),
        invoice.id,
        invoice.version,
        JSON.stringify({
          amount,
          payment_date: f.day,
          method: "OTRO",
          reference: "Synthetic visit",
          notes: "Fictitious local test",
        }),
      ]);
    };
    await pay(paid, "100.00");
    await pay(active, "25.00");
    await t.test(
      "financial catalog exposes all paid jobs but no unpaid unassigned or foreign jobs",
      async () => {
        const c = await catalog();
        assert.equal(c.find((p) => p.id === paid)?.state, "terminado");
        assert.equal(c.find((p) => p.id === active)?.state, "activo");
        assert.equal(c.find((p) => p.id === f.project)?.state, "asignado");
        assert.equal(
          c.some((p) => p.id === hidden || p.id === f.foreignProject),
          false,
        );
        assert.deepEqual(
          Object.keys(
            (
              await db.query<{ data: Record<string, unknown>[] }>(
                "select time_punch_projects($1) data",
                [f.a],
              )
            ).rows[0].data[0],
          ).sort(),
          ["id", "name", "state"],
        );
        assert.equal(c[0].customer_name, "");
        assert.equal(c[0].project_date, null);
        assert.equal(c[0].address, "");
        assert.equal((await db.query("select * from projects")).rows.length, 0);
        assert.equal((await db.query("select * from invoices")).rows.length, 0);
        assert.equal((await db.query("select * from payments")).rows.length, 0);
      },
    );
    await t.test(
      "fully paid is completed even without administrative COMPLETADO status",
      async () => {
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from projects where id=$1",
              [paid],
            )
          ).rows[0].status,
          "NUEVO",
        );
        assert.equal(
          (await catalog()).find((p) => p.id === paid)?.state,
          "terminado",
        );
      },
    );
    await t.test(
      "administrative completion alone does not replace the invoice criterion",
      async () =>
        rollback(async () => {
          await db.query(
            "update projects set status='COMPLETADO' where id=$1",
            [f.project],
          );
          assert.equal(
            (await catalog()).find((p) => p.id === f.project)?.state,
            "asignado",
          );
        }),
    );
    await t.test(
      "a second unpaid invoice prevents completion; another client's bills never offset",
      async () =>
        rollback(async () => {
          await db.query(
            "update invoices set project_id=$1 where project_id=$2",
            [paid, hidden],
          );
          assert.equal(
            (await catalog()).find((p) => p.id === paid)?.state,
            "activo",
          );
          assert.equal(
            (await catalog()).find((p) => p.id === active)?.state,
            "activo",
          );
        }),
    );
    await t.test(
      "void invoices and retained payments do not qualify a completed catalog entry",
      async () =>
        rollback(async () => {
          await db.query(
            "update invoices set status='VOID',payment_status='VOID' where project_id=$1",
            [paid],
          );
          assert.equal(
            (await catalog()).some((p) => p.id === paid),
            false,
          );
        }),
    );
    await t.test(
      "no reason, free text and old five-argument clock cannot start a completed visit",
      async () =>
        rollback(async () => {
          await f.as(f.worker.user);
          for (const reason of [null, "", "otro", "Garantía"])
            await reject(
              () => punch(randomUUID(), "IN", paid, reason),
              /visit_reason_required/,
            );
          const stamp = (
            await db.query<{ n: number }>(
              "select floor(extract(epoch from clock_timestamp()))::float8*1000 n",
            )
          ).rows[0].n;
          await reject(
            () =>
              db.query("select punch_time($1,$2,'IN',$3,$4::jsonb)", [
                f.a,
                randomUUID(),
                paid,
                JSON.stringify({
                  lat: 25.75,
                  lng: -80.3,
                  acc: 18,
                  gps_ts: stamp,
                }),
              ]),
            /visit_reason_required/,
          );
          assert.equal(
            (
              await db.query("select * from time_entries where project_id=$1", [
                paid,
              ])
            ).rows.length,
            0,
          );
        }),
    );
    for (const [reason, label] of Object.entries(visitReasons))
      await t.test(
        `${reason}: audited entry, exact retry, original project on exit and native minute rule`,
        async () =>
          rollback(async () => {
            await f.as(f.worker.user);
            const id = randomUUID();
            await punch(id, "IN", paid, reason);
            const opened = await row(id);
            assert.equal(opened.visit_reason, reason);
            assert.equal(opened.punch_project_state, "terminado");
            assert.equal(opened.notes, `Proyecto terminado · ${label}`);
            assert.equal(opened.minute_rule, "CAMPO_CLOCK_V1");
            await punch(id, "IN", paid, reason);
            assert.deepEqual(await row(id), opened);
            await reject(
              () => punch(id, "IN", paid, "otro"),
              /request_conflict/,
            );
            await reject(
              () => punch(randomUUID(), "IN", paid, reason),
              /time_overlap/,
            );
            await punch(id, "OUT", f.foreignProject, "otro");
            const closed = await row(id);
            assert.equal(closed.project_id, paid);
            assert.equal(closed.visit_reason, reason);
            assert.equal(closed.minutes, 1);
            assert.equal(closed.version, 2);
            await punch(id, "OUT", null, null);
            assert.deepEqual(await row(id), closed);
            const audit = (
              await db.query<{ after_data: Record<string, unknown> }>(
                "select * from record_history($1,'time_entries',$2)",
                [f.a, id],
              )
            ).rows;
            assert.equal(audit.length, 2);
            assert.equal(
              audit.some((a) => a.after_data?.visit_reason === reason),
              true,
            );
          }),
      );
    await t.test(
      "active clocks discard a stale reason like ADT and keep prior signatures usable",
      async () =>
        rollback(async () => {
          await f.as(f.worker.user);
          const id = randomUUID();
          await punch(id, "IN", active, "otro");
          assert.equal((await row(id)).visit_reason, null);
          assert.equal((await row(id)).punch_project_state, "activo");
          await punch(id, "OUT");
        }),
    );
    await t.test(
      "cancelled projects cannot enter even with payment, current choice and valid reason",
      async () =>
        rollback(async () => {
          await db.query("update projects set status='CANCELADO' where id=$1", [
            paid,
          ]);
          await f.as(f.owner);
          await db.query("select choose_workforce_project($1,$2,$3,0,$4)", [
            f.a,
            randomUUID(),
            f.worker.id,
            paid,
          ]);
          assert.equal(
            (await catalog()).some((p) => p.id === paid),
            false,
          );
          await reject(
            () => punch(randomUUID(), "IN", paid, "garantia"),
            /project_unavailable/,
          );
        }),
    );
    await t.test(
      "an open visit can exit after cancellation and revoked assignment",
      async () =>
        rollback(async () => {
          await f.as(f.worker.user);
          const id = randomUUID();
          await punch(id, "IN", paid, "garantia");
          await db.exec("reset role");
          await db.query("update projects set status='CANCELADO' where id=$1", [
            paid,
          ]);
          await db.query(
            "update workforce_assignments set active=false where worker_id=$1",
            [f.worker.id],
          );
          await f.as(f.worker.user);
          await punch(id, "OUT");
          assert.equal((await row(id)).visit_reason, "garantia");
        }),
    );
    await t.test(
      "current choice exposes unpaid completed-status project without reopening administrative scope",
      async () =>
        rollback(async () => {
          await db.query(
            "update projects set status='COMPLETADO' where id=$1",
            [hidden],
          );
          await f.as(f.owner);
          await db.query("select choose_workforce_project($1,$2,$3,0,$4)", [
            f.a,
            randomUUID(),
            f.worker.id,
            hidden,
          ]);
          assert.equal(
            (await catalog()).find((p) => p.id === hidden)?.state,
            "asignado",
          );
          assert.equal(
            (
              await db.query<{ data: { projects: { id: string }[] } }>(
                "select workforce_scope($1) data",
                [f.a],
              )
            ).rows[0].data.projects.some((p) => p.id === hidden),
            false,
          );
        }),
    );
    await t.test(
      "GPS remains mandatory, including for retries and exit",
      async () =>
        rollback(async () => {
          await f.as(f.worker.user);
          const id = randomUUID();
          await reject(
            () => punch(id, "IN", paid, "garantia", false),
            /gps_required/,
          );
          await punch(id, "IN", paid, "garantia");
          await reject(
            () => punch(id, "IN", paid, "garantia", false),
            /gps_required/,
          );
          await reject(
            () => punch(id, "OUT", null, null, false),
            /gps_required/,
          );
          assert.equal((await row(id)).ends_at, null);
        }),
    );
    await t.test(
      "another worker cannot close, read or inspect a visit's raw history",
      async () =>
        rollback(async () => {
          await f.as(f.worker.user);
          const id = randomUUID();
          await punch(id, "IN", paid, "garantia");
          await f.as(f.office.user);
          await reject(() => punch(id, "OUT"), /entry_unavailable/);
          assert.equal(
            (await db.query("select * from time_entries where id=$1", [id]))
              .rows.length,
            0,
          );
          assert.equal(
            (
              await db.query(
                "select * from record_history($1,'time_entries',$2)",
                [f.a, id],
              )
            ).rows.length,
            0,
          );
        }),
    );
    await t.test(
      "native visit metadata cannot be rewritten during an administrative correction",
      async () =>
        rollback(async () => {
          await f.as(f.worker.user);
          const id = randomUUID();
          await punch(id, "IN", paid, "garantia");
          await punch(id, "OUT");
          await db.exec("reset role");
          await reject(
            () =>
              db.query(
                "update time_entries set visit_reason='limpieza' where id=$1",
                [id],
              ),
            /clock_visit_locked/,
          );
          await reject(
            () =>
              db.query(
                "update time_entries set punch_project_state='activo',visit_reason=null where id=$1",
                [id],
              ),
            /clock_visit_locked/,
          );
          await reject(
            () =>
              db.query(
                "update time_entries set visit_reason='garantia' where id=$1",
                [existing],
              ),
            /clock_visit_locked/,
          );
        }),
    );
    await t.test(
      "visit eligibility does not grant expense scope on an unassigned completed job",
      async () =>
        rollback(async () => {
          await f.as(f.worker.user);
          assert.equal(
            (await catalog()).some((p) => p.id === paid),
            true,
          );
          assert.equal(
            (
              await db.query<{ data: { projects: { id: string }[] } }>(
                "select workforce_scope($1) data",
                [f.a],
              )
            ).rows[0].data.projects.some((p) => p.id === paid),
            false,
          );
          await reject(
            () =>
              db.query(
                "select app_private.time_punch_project_state($1,$2,$3,now())",
                [f.a, f.worker.id, paid],
              ),
            /permission denied/,
          );
          await reject(
            () => db.query("update time_entries set visit_reason='garantia'"),
            /permission denied/,
          );
        }),
    );
    await t.test(
      "foreign tenants, anonymous, read-only and disabled profiles cannot use the visit entry",
      async () =>
        rollback(async () => {
          await f.as(f.worker.user);
          await reject(
            () => punch(randomUUID(), "IN", f.foreignProject, "garantia"),
            /project_unavailable/,
          );
          await reject(() => catalog(f.worker.user, f.b), /permission_denied/);
          await f.as(f.worker.user, "anon");
          await reject(
            () => db.query("select time_punch_projects($1)", [f.a]),
            /permission denied/,
          );
          await f.as(f.owner);
          await db.query("select set_member_access($1,$2,'member',true,$3)", [
            f.a,
            f.worker.user,
            JSON.stringify({ horasfix: ["read"] }),
          ]);
          await f.as(f.worker.user);
          await reject(
            () => punch(randomUUID(), "IN", paid, "garantia"),
            /permission_denied/,
          );
          await reject(() => catalog(), /permission_denied/);
          await f.as(f.owner);
          await db.query("select set_member_access($1,$2,'member',true,$3)", [
            f.a,
            f.worker.user,
            JSON.stringify({ horasfix: ["write"] }),
          ]);
          await db.query(
            "select configure_workforce($1,$2,$3,1,'WORKER',null,false,'Synthetic disabled profile')",
            [f.a, randomUUID(), f.worker.id],
          );
          await f.as(f.worker.user);
          assert.equal((await catalog()).length, 0);
          await reject(
            () => punch(randomUUID(), "IN", paid, "garantia"),
            /project_unavailable/,
          );
        }),
    );
    await t.test(
      "invalid nullable metadata cannot evade the schema constraint",
      async () =>
        rollback(async () => {
          await reject(
            () =>
              db.query(
                "insert into time_entries(id,company_id,worker_id,project_id,starts_at,source,visit_reason,created_by,updated_by) values($1,$2,$3,$4,now(),'MANUAL','garantia',$5,$5)",
                [randomUUID(), f.a, f.worker.id, f.project, f.owner],
              ),
            /time_visit_metadata/,
          );
        }),
    );
  } finally {
    await db.close();
  }
});

test("visit labels match the source enum and do not accept arbitrary text", () => {
  assert.equal(visitLabel("garantia"), "Garantía");
  assert.equal(visitLabel(null), null);
  assert.equal(visitLabel("otro"), null);
  assert.equal(visitLabel("toString"), null);
});
