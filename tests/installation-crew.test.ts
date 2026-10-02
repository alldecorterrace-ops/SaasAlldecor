import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { workspaces } from "../src/lib/workspaces";
import {
  installationCrewIds,
  parseInstallationCrew,
} from "../src/lib/installation-crew";
test("crew forms distinguish omission, removal and invalid identities", () => {
  const form = new FormData(),
    worker = id();
  assert.deepEqual(parseInstallationCrew(form), {
    success: true,
    data: undefined,
  });
  form.set("crew_present", "1");
  assert.equal(parseInstallationCrew(form).success, true);
  assert.deepEqual(installationCrewIds(undefined), []);
  form.append("crew_worker_ids", worker.toUpperCase());
  const valid = parseInstallationCrew(form);
  assert(valid.success);
  assert.deepEqual(valid.data, [worker]);
  form.append("crew_worker_ids", worker);
  assert.equal(parseInstallationCrew(form).success, false);
  assert.throws(() => installationCrewIds(["invalid"]));
  form.delete("crew_worker_ids");
  form.append("crew_worker_ids", "invalid");
  assert.equal(parseInstallationCrew(form).success, false);
  form.set("crew_present", "invalid");
  assert.equal(parseInstallationCrew(form).success, false);
});
test("installation teams preserve audit, legacy compatibility and tenant access", async (t) => {
  const { db } = await fullDatabase();
  const owner = id(),
    other = id(),
    staff = id(),
    company = id(),
    foreign = id(),
    customer = id(),
    estimate = id();
  const responsible = id(),
    second = id(),
    shared = id(),
    outsider = id(),
    inactive = id(),
    record = id();
  const as = async (user = owner) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const worker = async (companyId: string, workerId: string, active = true) =>
    db.query("select save_worker($1,$2,0,$3)", [
      companyId,
      workerId,
      JSON.stringify({
        name: "Synthetic " + workerId,
        email: "",
        phone: "",
        job_title: "",
        team: "",
        hourly_rate: "0",
        weekly_target: 40,
        active,
        notes: "",
      }),
    ]);
  let project = "";
  const body = (
    main = responsible,
    crew: unknown = [shared],
    start = "2026-10-05T13:00:00Z",
    end = "2026-10-05T17:00:00Z",
    status = "PROGRAMADA",
  ) => ({
    name: "Synthetic team",
    status,
    project_id: project,
    worker_id: main,
    data: {
      ...workspaces.installations.defaults,
      starts_at: start,
      ends_at: end,
      notes: status === "CANCELADA" ? "Synthetic cancellation" : "",
      ...(crew === undefined ? {} : { crew_worker_ids: crew }),
    },
  });
  const execute = async (
    recordId: string,
    version: number,
    data: object,
    request = id(),
  ) =>
    (
      await db.query<{ data: { version: number } }>(
        "select execute_work_action($1,$2,'save','installations',$3,$4,$5) data",
        [company, request, recordId, version, JSON.stringify(data)],
      )
    ).rows[0].data;
  const row = async (recordId = record) =>
    (
      await db.query<{
        data: { crew_worker_ids: string[] };
        version: number;
        status: string;
      }>("select * from work_records where id=$1", [recordId])
    ).rows[0];
  const snapshot = async () => {
    await db.exec("reset role");
    const result = (
      await db.query(
        "select (select jsonb_agg(to_jsonb(r) order by id) from work_records r) records,(select count(*)::int from app_private.work_requests) receipts,(select count(*)::int from audit_events) audits",
      )
    ).rows[0];
    await as();
    return result;
  };
  try {
    await db.query(
      "insert into auth.users values($1,'crew-owner@example.test',now()),($2,'crew-other@example.test',now()),($3,'crew-staff@example.test',now())",
      [owner, other, staff],
    );
    await as();
    await db.query("select create_company($1,'Synthetic team A')", [company]);
    await db.query("select add_company_member($1,'crew-staff@example.test')", [
      company,
    ]);
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "Synthetic crew customer",
        status: "active",
      }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
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
      await db.query<{ id: string }>(
        "select approve_estimate($1,$2,1,'2026-10-01','Synthetic team project','Synthetic approval') id",
        [company, estimate],
      )
    ).rows[0].id;
    project = (
      await db.query<{ project_id: string }>(
        "select project_id from invoices where id=$1",
        [invoice],
      )
    ).rows[0].project_id;
    for (const w of [responsible, second, shared]) await worker(company, w);
    await worker(company, inactive, false);
    await as(other);
    await db.query("select create_company($1,'Synthetic team B')", [foreign]);
    await worker(foreign, outsider);
    await as();
    const finance = (
      await db.query(
        "select (select jsonb_agg(to_jsonb(r) order by id) from payments r) payments,(select jsonb_agg(to_jsonb(r) order by id) from invoices r) invoices,(select jsonb_agg(to_jsonb(r) order by id) from expenses r) expenses",
      )
    ).rows[0];
    await t.test(
      "retry has one team revision and immutable original audit",
      async () => {
        const request = id(),
          input = body(responsible, [shared, second]);
        assert.equal((await execute(record, 0, input, request)).version, 1);
        assert.equal((await execute(record, 0, input, request)).version, 1);
        assert.deepEqual(
          (await row()).data.crew_worker_ids,
          [shared, second].sort(),
        );
        const h = await db.query<{
          after_data: { data: { crew_worker_ids: string[] } };
        }>("select * from record_history($1,'work_records',$2)", [
          company,
          record,
        ]);
        assert.equal(h.rows.length, 1);
        assert.deepEqual(
          h.rows[0].after_data.data.crew_worker_ids,
          [shared, second].sort(),
        );
      },
    );
    await t.test(
      "different responsibles conflict on any shared crew member",
      async () => {
        const before = await snapshot();
        await assert.rejects(
          execute(id(), 0, body(second, [shared])),
          /schedule_overlap/,
        );
        await assert.rejects(
          execute(id(), 0, body(shared, [])),
          /schedule_overlap/,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "invalid, inactive, foreign and duplicate members leave no effect or receipt",
      async () => {
        const before = await snapshot();
        for (const crew of [
          null,
          "bad",
          ["invalid"],
          [shared, shared],
          Array.from({ length: 21 }, () => id()),
        ])
          await assert.rejects(
            execute(
              id(),
              0,
              body(
                second,
                crew,
                "2026-10-06T13:00:00Z",
                "2026-10-06T17:00:00Z",
              ),
            ),
            /invalid_crew/,
          );
        for (const crew of [[outsider], [inactive], [id()]])
          await assert.rejects(
            execute(
              id(),
              0,
              body(
                second,
                crew,
                "2026-10-06T13:00:00Z",
                "2026-10-06T17:00:00Z",
              ),
            ),
            /crew_worker_unavailable/,
          );
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "legacy saves retain registered crew and stale forms cannot overwrite it",
      async () => {
        const legacy = body(responsible, undefined);
        delete (legacy.data as { crew_worker_ids?: unknown }).crew_worker_ids;
        await db.query("select save_work_record($1,$2,1,'installations',$3)", [
          company,
          record,
          JSON.stringify(legacy),
        ]);
        assert.deepEqual(
          (await row()).data.crew_worker_ids,
          [shared, second].sort(),
        );
        assert.equal((await row()).version, 2);
        await assert.rejects(
          execute(record, 1, body(responsible, [])),
          /record_conflict/,
        );
      },
    );
    await t.test(
      "cancellation releases the team and conflicting restore is rejected",
      async () => {
        await execute(
          record,
          2,
          body(
            responsible,
            [shared, second],
            undefined,
            undefined,
            "CANCELADA",
          ),
        );
        const replacement = id();
        await execute(replacement, 0, body(second, [shared]));
        await assert.rejects(execute(record, 3, body()), /schedule_overlap/);
        assert.equal((await row()).status, "CANCELADA");
        await execute(
          replacement,
          1,
          body(second, [], undefined, undefined, "CANCELADA"),
        );
        await execute(record, 3, body(responsible, []));
        assert.deepEqual((await row()).data.crew_worker_ids, []);
        await execute(id(), 0, body(second, [shared]));
      },
    );
    await t.test(
      "adjacent intervals are permitted without releasing earlier history",
      async () => {
        await execute(
          id(),
          0,
          body(
            second,
            [shared],
            "2026-10-05T17:00:00Z",
            "2026-10-05T18:00:00Z",
          ),
        );
        const h = await db.query<{
          after_data: { data: { crew_worker_ids: string[] } };
        }>("select * from record_history($1,'work_records',$2)", [
          company,
          record,
        ]);
        assert(
          h.rows.some((r) =>
            r.after_data.data.crew_worker_ids?.includes(shared),
          ),
        );
      },
    );
    await t.test(
      "operational access does not confer worker access; revocation and tenant denial",
      async () => {
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          company,
          staff,
          JSON.stringify({ instalaciones: ["read", "write"] }),
        ]);
        await as(staff);
        assert.equal((await db.query("select * from workers")).rows.length, 0);
        await assert.rejects(
          execute(
            record,
            4,
            body(
              responsible,
              [shared],
              "2026-10-08T13:00:00Z",
              "2026-10-08T17:00:00Z",
            ),
          ),
          /crew_worker_unavailable/,
        );
        await as();
        await db.query("select set_member_access($1,$2,'member',false,'{}')", [
          company,
          staff,
        ]);
        await as(staff);
        await assert.rejects(execute(record, 4, body()), /permission_denied/);
        await as(other);
        assert.equal(
          (await db.query("select * from work_records")).rows.length,
          0,
        );
        await assert.rejects(execute(record, 4, body()), /permission_denied/);
        await as();
      },
    );
    assert.deepEqual(
      (
        await db.query(
          "select (select jsonb_agg(to_jsonb(r) order by id) from payments r) payments,(select jsonb_agg(to_jsonb(r) order by id) from invoices r) invoices,(select jsonb_agg(to_jsonb(r) order by id) from expenses r) expenses",
        )
      ).rows[0],
      finance,
    );
  } finally {
    await db.close();
  }
});
