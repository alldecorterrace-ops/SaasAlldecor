import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { historicalBusinessPayload } from "../src/lib/migration/historical-business-payload";
import { historicalEstimatePayload } from "../src/lib/migration/historical-estimate-payload";
import { planOperationalCustomers } from "../src/lib/migration/operational-customers";
import { planOperationalProjects } from "../src/lib/migration/operational-projects";
function fixture() {
  const clients = ["a", "b"].map((id) => ({
    external_id: id,
    full_name: `Client ${id}`,
    email: id === "a" ? "valid@example.test" : "bad email",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    service: "",
    client_date: "2020-01-02",
    notes: "",
    status: "ACTIVO",
  }));
  const projects = ["a", "b", "c", "d"].map((id) => ({
    external_id: id,
    client_external_id: id === "c" ? "b" : "a",
    estimate_external_id: id,
    name: "Same project name",
    project_date: "2020-02-03",
    status: id === "d" ? "PENDIENTE" : "Nuevo",
    total: "100.00",
  }));
  const estimates = projects.map((p) => ({
    external_id: p.estimate_external_id,
    client_external_id: p.client_external_id,
    status: "LEGACY",
    estimate_date: "2020-01-03",
    subtotal: "100.00",
    discount: "0.00",
    taxes: "0.00",
    total: "100.00",
    source_json: "{}",
  }));
  return {
    format: "adt-history-snapshot-v1",
    origin: "restored_snapshot",
    clients,
    projects,
    estimates,
    items: [],
    invoices: [],
    payments: [],
    documents: [],
    contracts: [],
  };
}
test("project import preserves provenance, has no financial side effects and keeps payment gates", async (t) => {
  const { db } = await fullDatabase(),
    owner = randomUUID(),
    other = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID(),
    source = fixture();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  try {
    await db.exec("set timezone='UTC'");
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [other, "other@example.test"],
      [staff, "staff@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'Company A')", [company]);
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    await db.query(
      "select public.set_member_access($1,$2,'member',true,'{}')",
      [company, staff],
    );
    await as(other);
    await db.query("select public.create_company($1,'Company B')", [foreign]);
    await db.exec("reset role");
    const ep = historicalEstimatePayload(source, company),
      bp = historicalBusinessPayload(source, company);
    await db.query("select app_private.import_historical_estimates($1,$2,$3)", [
      company,
      ep.snapshotSha256,
      JSON.stringify(ep.records),
    ]);
    await db.query("select app_private.import_historical_business($1,$2,$3)", [
      company,
      bp.snapshotSha256,
      JSON.stringify(bp.records),
    ]);
    const cp = planOperationalCustomers(source, [], company);
    await db.query(
      "select app_private.import_operational_customers($1,$2,$3,$4,$5)",
      [company, owner, cp.snapshotSha256, "[]", JSON.stringify(cp.records)],
    );
    const mappings = (
      await db.query<{ value: unknown }>(
        "select to_jsonb(m) value from public.historical_customer_migrations m order by historical_id",
      )
    ).rows.map((r) => r.value);
    const ids = (
      await db.query<{ id: string }>(
        "select id from public.customers order by id",
      )
    ).rows.map((r) => r.id);
    const destination = {
        projects: [],
        customer_mappings: mappings,
        customer_ids: ids,
      },
      plan = planOperationalProjects(source, destination, company);
    const load = (records = plan.records, expected: unknown = destination) =>
      db.query<{ result: unknown }>(
        "select app_private.import_operational_projects($1,$2,$3,$4,$5) result",
        [
          company,
          owner,
          plan.snapshotSha256,
          JSON.stringify(expected),
          JSON.stringify(records),
        ],
      );
    await t.test(
      "planner allows separate estimates with same project name and flags unmet prerequisites",
      async () => {
        assert.deepEqual(plan.summary, { source: 4, ready: 2, review: 2 });
        assert.ok(plan.records[2].review_reasons.includes("customer_pending"));
        assert.ok(plan.records[3].review_reasons.includes("source_status"));
        assert.throws(
          () => planOperationalProjects(source, destination, foreign),
          /wrong_company/,
        );
        const duplicate = structuredClone(source);
        duplicate.projects[1].estimate_external_id = "a";
        assert.equal(
          planOperationalProjects(
            duplicate,
            destination,
            company,
          ).records.filter((r) => r.review_reasons.includes("source_duplicate"))
            .length,
          2,
        );
      },
    );
    await t.test(
      "changed destination, forged customer and late source errors leave no copies",
      async () => {
        await assert.rejects(
          load(plan.records, { ...destination, customer_ids: [] }),
          /project_destination_changed/,
        );
        const wrong = structuredClone(plan.records);
        wrong[0].customer_id = randomUUID();
        await assert.rejects(
          load(wrong),
          /project_relationship_requires_review/,
        );
        const changed = structuredClone(plan.records);
        changed[0].data!.project_date = "2024-01-01";
        await assert.rejects(load(changed), /invalid_project_copy/);
        const late = structuredClone(plan.records);
        late[3].source_sha256 = "0".repeat(64);
        await assert.rejects(load(late), /project_source_changed/);
        assert.equal(
          (await db.query("select * from public.projects")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.historical_project_migrations"))
            .rows.length,
          0,
        );
      },
    );
    let project = "";
    await t.test(
      "imports only ready projects without generating estimates, invoices or payments",
      async () => {
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 2,
          review: 2,
          unchanged: 0,
        });
        const rows = (
          await db.query<{
            id: string;
            estimate_id: null;
            historical_project_id: string;
            customer_id: string;
            project_date: string;
          }>(
            "select id,estimate_id,historical_project_id,customer_id,project_date::text from public.projects order by historical_project_id",
          )
        ).rows;
        project = rows[0].id;
        assert.equal(rows.length, 2);
        for (const r of rows) {
          assert.equal(r.estimate_id, null);
          assert.equal(r.customer_id, ids[0]);
          assert.equal(r.project_date, "2020-02-03");
          assert.ok(
            plan.records.some(
              (p) => p.historical_id === r.historical_project_id,
            ),
          );
        }
        for (const table of ["estimates", "invoices", "payments"])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        await assert.rejects(
          db.query(
            "update public.projects set historical_project_id=null where id=$1",
            [project],
          ),
          /projects_source_required/,
        );
        const clientHistory = cp.records[0].historical_id;
        await assert.rejects(
          db.query(
            "update public.projects set historical_project_id=$1 where id=$2",
            [clientHistory, project],
          ),
          /foreign key/,
        );
      },
    );
    await t.test(
      "ordinary edits work, scheduling remains gated and retries preserve edits",
      async () => {
        await as(owner);
        const data = {
          name: "Edited project",
          status: "NUEVO",
          start_date: null,
          end_date: null,
          notes: "User note",
        };
        await db.query("select public.update_project($1,$2,1,$3)", [
          company,
          project,
          JSON.stringify(data),
        ]);
        await assert.rejects(
          db.query("select public.update_project($1,$2,1,$3)", [
            company,
            project,
            JSON.stringify(data),
          ]),
          /record_conflict/,
        );
        await assert.rejects(
          db.query("select public.update_project($1,$2,2,$3)", [
            company,
            project,
            JSON.stringify({ ...data, status: "PRODUCCION" }),
          ]),
          /deposit_required/,
        );
        await assert.rejects(
          db.query("select public.update_project($1,$2,2,$3)", [
            company,
            project,
            JSON.stringify({ ...data, start_date: "2026-09-20" }),
          ]),
          /deposit_required/,
        );
        await db.exec("reset role");
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 0,
          review: 0,
          unchanged: 4,
        });
        assert.equal(
          (
            await db.query<{ notes: string }>(
              "select notes from public.projects where id=$1",
              [project],
            )
          ).rows[0].notes,
          "User note",
        );
      },
    );
    await t.test(
      "module access and company boundaries protect copies, mappings and importer",
      async () => {
        await as(other);
        assert.equal(
          (await db.query("select * from public.projects")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.historical_project_migrations"))
            .rows.length,
          0,
        );
        await as(staff);
        assert.equal(
          (await db.query("select * from public.historical_project_migrations"))
            .rows.length,
          0,
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [company, staff, JSON.stringify({ "fin-proyectos": ["read"] })],
        );
        await as(staff);
        assert.equal(
          (await db.query("select * from public.historical_project_migrations"))
            .rows.length,
          4,
        );
        await assert.rejects(load(), /permission denied/);
        await assert.rejects(
          db.query("select * from app_private.operational_project_imports"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("update public.projects set name='Forged'"),
          /permission denied/,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(
          db.query("select * from public.historical_project_migrations"),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
