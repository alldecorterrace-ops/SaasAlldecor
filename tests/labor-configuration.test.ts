import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { receiptReviewFixture } from "./helpers/receipt-review-fixture";
import { laborContextSchema, laborReport } from "../src/lib/labor-report";
test("Dated Labor configuration persists audit, request identity and scoped read model", async (t) => {
  const { db } = await fullDatabase();
  try {
    const f = await receiptReviewFixture(db);
    await f.as(f.owner);
    const save = async (
      kind: string,
      id: string,
      version: number,
      data: unknown,
      request = randomUUID(),
      company = f.a,
    ) =>
      db.query("select save_labor_config($1,$2,$3,$4,$5,$6,$7)", [
        company,
        request,
        id,
        version,
        kind,
        JSON.stringify(data),
        "Synthetic dated Labor configuration",
      ]);
    const context = async (company = f.a) =>
      laborContextSchema.parse(
        (
          await db.query<{ data: unknown }>("select labor_context($1) data", [
            company,
          ])
        ).rows[0].data,
      );
    const rate = randomUUID(),
      req = randomUUID(),
      entry = randomUUID();
    const body = {
      worker: f.worker.id,
      from: f.day,
      to: "",
      amount: "250.00",
      active: true,
    };
    const timestamp = (
      await db.query<{ start: string; end: string }>(
        "select (now()-interval '2 hours')::text start,(now()-interval '1 hour')::text as end",
      )
    ).rows[0];
    await t.test(
      "rate replay has one effect, receipt and audit; stale version and overlap reject",
      async () => {
        await save("RATE", rate, 0, body, req);
        await save("RATE", rate, 0, body, req);
        const rows = (
          await db.query<{ version: number }>(
            "select version from labor_rates where id=$1",
            [rate],
          )
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].version, 1);
        await assert.rejects(
          save("RATE", randomUUID(), 0, body),
          /labor_rate_overlap/,
        );
        await assert.rejects(
          save("RATE", rate, 0, { ...body, amount: "251.00" }, req),
          /request_conflict/,
        );
        await assert.rejects(save("RATE", rate, 0, body), /record_conflict/);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from audit_events where entity='labor_rates' and entity_id=$1",
              [rate],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "no direct mutations, cross-tenant worker or foreign project can create a cost input",
      async () => {
        await assert.rejects(
          db.query("update labor_rates set amount=1 where id=$1", [rate]),
          /permission denied/,
        );
        await assert.rejects(
          save("RATE", randomUUID(), 0, {
            ...body,
            worker: f.foreignWorker.id,
          }),
          /invalid_labor_config/,
        );
        await assert.rejects(
          save("PROJECT", f.foreignProject, 0, { mode: "day", active: true }),
          /invalid_labor_config/,
        );
      },
    );
    await t.test(
      "approved assigned workday derives one dated cost from persisted inputs",
      async () => {
        // The interval is anchored to the company-local date to avoid midnight fixtures.
        const dates = (
          await db.query<{ from: string }>(
            "select (cast($1 as timestamptz) at time zone timezone)::date::text as from from companies where id=$2",
            [timestamp.start, f.a],
          )
        ).rows[0];
        await save("RATE", rate, 1, { ...body, from: dates.from });
        await save("PROJECT", f.project, 0, { mode: "day", active: true });
        await db.query("select save_time_entry($1,$2,0,$3)", [
          f.a,
          entry,
          JSON.stringify({
            worker_id: f.worker.id,
            project_id: f.project,
            starts_at: timestamp.start,
            ends_at: timestamp.end,
            break_minutes: 0,
            status: "APROBADO",
            notes: "Synthetic Labor shift",
            reason: "Synthetic approved workday",
          }),
        ]);
        const c = await context(),
          r = laborReport(c);
        assert.equal(r.knownCostCents, 25000);
        assert.equal(r.complete, true);
        assert.equal(r.supplements.length, 1);
        assert.equal(r.attendance[0].minutes, 60);
        const reopened = laborReport(await context());
        assert.deepEqual(reopened, r);
        assert.equal(r.posted, false);
      },
    );
    await t.test(
      "pending requests and revoked dated assignment invalidate cost without deleting the attendance",
      async () => {
        await f.as(f.worker.user);
        const request = randomUUID();
        await db.query("select request_time_change($1,$2,$3,1,$4)", [
          f.a,
          request,
          entry,
          JSON.stringify({
            starts_at: timestamp.start,
            ends_at: timestamp.end,
            break_minutes: 1,
            reason: "Synthetic pending correction",
          }),
        ]);
        await f.as(f.owner);
        const r = laborReport(await context());
        assert.equal(r.knownCostCents, 0);
        assert.equal(r.complete, false);
        assert.equal(r.pending[0].reason, "SHIFT_REVIEW_REQUIRED");
        await db.query(
          "select decide_time_request($1,$2,1,false,'Synthetic request rejection')",
          [f.a, request],
        );
        assert.equal(laborReport(await context()).knownCostCents, 25000);
        const assignment = (
          await db.query<{
            id: string;
            version: number;
            start: string;
            end: string | null;
          }>(
            "select id,version,starts_at::text start,ends_at::text as end from workforce_assignments where company_id=$1 and worker_id=$2 and project_id=$3",
            [f.a, f.worker.id, f.project],
          )
        ).rows[0];
        const close = (end: string) =>
          db.query(
            "select save_workforce_assignment($1,$2,$3,$4,$5,$6,$7,$8,false,'Synthetic dated assignment closure')",
            [
              f.a,
              randomUUID(),
              assignment.id,
              assignment.version,
              f.worker.id,
              f.project,
              assignment.start,
              end,
            ],
          );
        // Ending after this closed shift preserves its historical assignment.
        await close(timestamp.end);
        assert.equal(laborReport(await context()).knownCostCents, 25000);
        // Reopening a closed assignment is prohibited. A new dated assignment
        // is required, with the old identity/evidence kept intact.
        await assert.rejects(
          db.query(
            "select save_workforce_assignment($1,$2,$3,$4,$5,$6,$7,null,true,'Synthetic reopen attempt')",
            [
              f.a,
              randomUUID(),
              assignment.id,
              assignment.version + 1,
              f.worker.id,
              f.project,
              assignment.start,
            ],
          ),
          /assignment_closed/,
        );
        // A separate local fixture excludes the workday by its historical end;
        // this is a read-model edge, not an authorized production correction.
        await db.exec("reset role");
        await db.query(
          "update workforce_assignments set ends_at=cast($2 as timestamptz)-interval '1 minute' where id=$1",
          [assignment.id, timestamp.start],
        );
        await f.as(f.owner);
        assert.equal(laborReport(await context()).knownCostCents, 0);
        assert.equal(
          laborReport(await context()).pending[0].reason,
          "SHIFT_REVIEW_REQUIRED",
        );
        await db.query(
          "select save_workforce_assignment($1,$2,$3,0,$4,$5,$6,null,true,'Synthetic new dated assignment')",
          [
            f.a,
            randomUUID(),
            randomUUID(),
            f.worker.id,
            f.project,
            assignment.start,
          ],
        );
        assert.equal(laborReport(await context()).knownCostCents, 25000);
      },
    );
    await t.test(
      "worker and office cannot read wages, configuration or their audit snapshots",
      async () => {
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          f.a,
          f.worker.user,
          JSON.stringify({
            horasfix: ["write"],
            gastos: ["read"],
            trabajadores: ["read"],
            "fin-proyectos": ["read"],
            activity: ["read"],
          }),
        ]);
        await f.as(f.worker.user);
        await assert.rejects(context(), /permission_denied/);
        await assert.rejects(
          save("RATE", randomUUID(), 0, body),
          /permission_denied/,
        );
        assert.equal(
          (await db.query("select * from labor_rates")).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from audit_events where entity like 'labor_%'",
            )
          ).rows.length,
          0,
        );
        await f.as(f.office.user);
        await assert.rejects(context(), /permission_denied/);
        await f.as(f.owner);
      },
    );
    await t.test(
      "saved adjustment uses the captured estimate revision and includes its crew only once",
      async () => {
        const snapshot = (
          await db.query<{ estimate: string; version: number }>(
            "select p.estimate_id estimate,e.version from projects p join estimates e on e.company_id=p.company_id and e.id=p.estimate_id where p.id=$1",
            [f.project],
          )
        ).rows[0];
        await save("PROJECT", f.project, 1, {
          mode: "adjustment",
          responsible: f.worker.id,
          amount: "600.00",
          date: f.day,
          estimate_version: snapshot.version,
          active: true,
        });
        const r = laborReport(await context());
        assert.equal(r.knownCostCents, 60000);
        assert.equal(r.supplements.length, 1);
        assert.ok(r.attendance[0].includedInAdjustment);
        assert.equal(r.supplements[0].date, f.day);
        await assert.rejects(
          save("PROJECT", f.project, 2, {
            mode: "adjustment",
            responsible: f.foreignWorker.id,
            amount: "600.00",
            date: f.day,
            estimate_version: snapshot.version,
            active: true,
          }),
          /invalid_labor_config/,
        );
        await assert.rejects(
          save("PROJECT", f.project, 2, {
            mode: "adjustment",
            responsible: f.worker.id,
            amount: "600.00",
            date: f.day,
            estimate_version: 999,
            active: true,
          }),
          /invalid_labor_config/,
        );
      },
    );
    await t.test(
      "replays recheck current authorization after administrator revocation",
      async () => {
        await f.as(f.otherOwner);
        const request = randomUUID();
        await save("SETTINGS", f.a, 0, { shared_day_rule: "review" }, request);
        await f.as(f.owner);
        await db.query("select set_member_access($1,$2,'member',true,'{}')", [
          f.a,
          f.otherOwner,
        ]);
        await f.as(f.otherOwner);
        await assert.rejects(
          save("SETTINGS", f.a, 0, { shared_day_rule: "review" }, request),
          /permission_denied/,
        );
        await assert.rejects(context(), /permission_denied/);
        await f.as(f.owner);
      },
    );
    await t.test(
      "mapped historical payroll is preserved and deducted only from its reconciled worker-day",
      async () => {
        await save("PROJECT", f.project, 2, { mode: "day", active: true });
        const legacy = randomUUID();
        await db.exec("reset role");
        await db.query(
          `insert into expenses(id,company_id,project_id,worker_id,expense_date,category,description,amount,method,status,created_by,updated_by)
        values($1,$2,$3,$4,$5,'Nómina','Synthetic previous Labor cost',100,'EFECTIVO','APROBADO',$6,$6)`,
          [legacy, f.a, f.project, f.worker.id, f.day, f.owner],
        );
        const original = (
          await db.query<{ hash: string }>(
            "select md5(to_jsonb(e)::text) hash from expenses e where id=$1",
            [legacy],
          )
        ).rows[0].hash;
        await f.as(f.owner);
        const before = laborReport(await context());
        assert.equal(before.knownCostCents, 10000);
        assert.equal(before.supplements.length, 0);
        assert.equal(before.complete, false);
        const day = laborReport(await context()).attendance[0]?.date;
        assert.ok(day);
        const mapped = {
          expense_version: 1,
          allocations: [{ worker: f.worker.id, date: day, cents: 10000 }],
          active: true,
        };
        await assert.rejects(
          save("HISTORICAL", legacy, 0, {
            ...mapped,
            allocations: [{ worker: f.worker.id, date: day, cents: 9999 }],
          }),
          /labor_allocation_total/,
        );
        await assert.rejects(
          save("HISTORICAL", legacy, 0, {
            ...mapped,
            allocations: [
              { worker: f.foreignWorker.id, date: day, cents: 10000 },
            ],
          }),
          /invalid_labor_config/,
        );
        const request = randomUUID();
        await save("HISTORICAL", legacy, 0, mapped, request);
        await save("HISTORICAL", legacy, 0, mapped, request);
        const r = laborReport(await context());
        assert.equal(r.knownCostCents, 25000);
        assert.equal(r.historicalCostCents, 10000);
        assert.equal(r.supplementCostCents, 15000);
        assert.equal(r.complete, true);
        assert.equal(
          (
            await db.query<{ hash: string }>(
              "select md5(to_jsonb(e)::text) hash from expenses e where id=$1",
              [legacy],
            )
          ).rows[0].hash,
          original,
        );
        await db.exec("reset role");
        await db.query(
          "update expenses set amount=125,version=version+1 where id=$1",
          [legacy],
        );
        await f.as(f.owner);
        const changed = laborReport(await context());
        assert.equal(changed.knownCostCents, 12500);
        assert.equal(changed.supplements.length, 0);
        assert.equal(changed.complete, false);
        await assert.rejects(
          save("HISTORICAL", legacy, 1, mapped),
          /labor_source_changed/,
        );
        await save("HISTORICAL", legacy, 1, {
          ...mapped,
          expense_version: 2,
          allocations: [{ worker: f.worker.id, date: day, cents: 12500 }],
        });
        assert.equal(laborReport(await context()).knownCostCents, 25000);
        await db.exec("reset role");
        await db.query(
          "update expenses set status='ANULADO',version=version+1 where id=$1",
          [legacy],
        );
        await f.as(f.owner);
        assert.equal(laborReport(await context()).supplementCostCents, 25000);
        await db.exec("reset role");
        await db.query(
          "update expenses set status='APROBADO',version=version+1 where id=$1",
          [legacy],
        );
        await f.as(f.owner);
        assert.equal(laborReport(await context()).supplementCostCents, 12500);
        assert.equal((await db.query("select * from expenses")).rows.length, 1);
        assert.equal((await db.query("select * from payments")).rows.length, 0);
      },
    );
  } finally {
    await db.close();
  }
});
