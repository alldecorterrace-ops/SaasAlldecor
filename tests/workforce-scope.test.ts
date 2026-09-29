import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import {
  workforceScopeSchema,
  workforceAssignmentSchema,
} from "../src/lib/workforce";

test("Workforce profiles and assignments: explicit scope, dates, retries, conflicts and revocation", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  const identities = Array.from({ length: 5 }, () => ({
    user: randomUUID(),
    worker: randomUUID(),
  }));
  const [worker, foreman, other, office, foreman2] = identities;
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const configure = (
    id: string,
    version = 0,
    role = "WORKER",
    supervisor: string | null = null,
    enabled = true,
    request = randomUUID(),
    company = a,
  ) =>
    db.query("select public.configure_workforce($1,$2,$3,$4,$5,$6,$7,$8)", [
      company,
      request,
      id,
      version,
      role,
      supervisor,
      enabled,
      "Synthetic scope test",
    ]);
  const assign = (
    id: string,
    who: string,
    project: string,
    version = 0,
    active = true,
    start = "2026-01-01T05:00:00Z",
    end: string | null = null,
    request = randomUUID(),
    company = a,
  ) =>
    db.query(
      "select public.save_workforce_assignment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        company,
        request,
        id,
        version,
        who,
        project,
        start,
        end,
        active,
        "Synthetic assignment",
      ],
    );
  const scope = async (company = a) =>
    workforceScopeSchema.parse(
      (
        await db.query<{ data: unknown }>(
          "select public.workforce_scope($1) data",
          [company],
        )
      ).rows[0].data,
    );
  const useProject = async (project: string, at: string) => {
    await db.exec("reset role");
    const allowed = (
      await db.query<{ allowed: boolean }>(
        "select app_private.can_use_workforce_project($1,$2,$3) allowed",
        [a, project, at],
      )
    ).rows[0].allowed;
    await db.exec("set role authenticated");
    return allowed;
  };
  const projects: string[] = [];
  try {
    await db.query(
      "insert into auth.users values($1,'scope-owner@example.test',now())",
      [owner],
    );
    for (const x of identities)
      await db.query("insert into auth.users values($1,$2,now())", [
        x.user,
        `${x.user}@example.test`,
      ]);
    await as(owner);
    await db.query(
      "select public.create_company($1,'Scope A'),public.create_company($2,'Scope B')",
      [a, b],
    );
    for (const x of identities) {
      await db.query("select public.add_company_member($1,$2)", [
        a,
        `${x.user}@example.test`,
      ]);
      await db.query(
        "select public.set_member_access($1,$2,'member',true,$3)",
        [
          a,
          x.user,
          JSON.stringify({ horasfix: ["read", "write"], activity: ["read"] }),
        ],
      );
      await db.query("select public.save_worker($1,$2,0,$3)", [
        a,
        x.worker,
        JSON.stringify({
          name: "Same synthetic name",
          email: "",
          phone: "",
          job_title: "",
          team: "",
          hourly_rate: "12.34",
          weekly_target: 40,
          active: true,
          notes: "private employment notes",
        }),
      ]);
      await db.query("select public.link_worker_login($1,$2,1,$3)", [
        a,
        x.worker,
        `${x.user}@example.test`,
      ]);
    }
    for (const company of [a, a, b]) {
      const customer = randomUUID(),
        estimate = randomUUID();
      await db.query("select public.save_customer($1,$2,0,$3)", [
        company,
        customer,
        JSON.stringify({
          full_name: "Synthetic project customer",
          email: "",
          status: "active",
        }),
      ]);
      await db.query("select public.save_estimate($1,$2,0,$3)", [
        company,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: "2026-09-29",
          valid_until: null,
          status: "BORRADOR",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "QA", unit_price: "100.00" }],
        }),
      ]);
      await db.query(
        "select public.approve_estimate($1,$2,1,'2026-09-29','Synthetic project','Local test')",
        [company, estimate],
      );
      projects.push(
        (
          await db.query<{ id: string }>(
            "select id from public.projects where company_id=$1 and estimate_id=$2",
            [company, estimate],
          )
        ).rows[0].id,
      );
    }
    const fingerprint = async () => {
      await as(owner);
      return (
        await db.query(
          "select md5(coalesce(jsonb_agg(t order by id)::text,'')) hash from public.workers t",
        )
      ).rows;
    };
    const before = await fingerprint();
    await t.test(
      "existing workers have no implicit team authority; invalid or foreign profile changes fail",
      async () => {
        await as(worker.user);
        assert.equal((await scope()).role, null);
        assert.deepEqual((await scope()).projects, []);
        await assert.rejects(configure(worker.worker), /manager_required/);
        await as(owner);
        await assert.rejects(
          configure(worker.worker, 0, "ADMIN"),
          /invalid_workforce_profile/,
        );
        await assert.rejects(
          configure(worker.worker, 0, "WORKER", worker.worker),
          /supervisor_unavailable/,
        );
        await assert.rejects(
          configure(worker.worker, 0, "WORKER", null, true, randomUUID(), b),
          /worker_unavailable/,
        );
      },
    );
    await t.test(
      "administrator sets explicit profiles and idempotent retries create one audit effect",
      async () => {
        await as(owner);
        await configure(foreman.worker, 0, "FOREMAN");
        await configure(foreman2.worker, 0, "FOREMAN");
        const request = randomUUID();
        await configure(
          worker.worker,
          0,
          "WORKER",
          foreman.worker,
          true,
          request,
        );
        await configure(
          worker.worker,
          0,
          "WORKER",
          foreman.worker,
          true,
          request,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from audit_events where entity='workforce_profiles' and entity_id=$1",
              [worker.worker],
            )
          ).rows[0].n,
          1,
        );
        await assert.rejects(
          configure(worker.worker, 0, "OFFICE", null, true, request),
          /request_conflict/,
        );
        await assert.rejects(configure(worker.worker, 0), /record_conflict/);
        await configure(other.worker, 0, "WORKER", foreman2.worker);
        await configure(office.worker, 0, "OFFICE");
        await assert.rejects(
          configure(foreman.worker, 1, "WORKER"),
          /supervisor_has_team/,
        );
        await configure(foreman2.worker, 1, "FOREMAN", foreman.worker);
        await assert.rejects(
          configure(foreman.worker, 1, "FOREMAN", foreman2.worker),
          /supervisor_cycle/,
        );
        await configure(foreman2.worker, 2, "FOREMAN");
      },
    );
    await t.test(
      "identity and team scope exclude another supervisor, another tenant and employment data",
      async () => {
        await as(worker.user);
        let data = await scope();
        assert.deepEqual(
          data.team.map((w) => w.id),
          [worker.worker],
        );
        assert(!JSON.stringify(data).includes("private employment"));
        assert(!JSON.stringify(data).includes("hourly_rate"));
        assert(!JSON.stringify(data).includes("email"));
        assert.equal(
          (await db.query("select * from workforce_profiles")).rows.length,
          0,
        );
        await assert.rejects(scope(b), /permission_denied/);
        await as(foreman.user);
        data = await scope();
        assert.deepEqual(
          new Set(data.team.map((w) => w.id)),
          new Set([worker.worker, foreman.worker]),
        );
        await as(office.user);
        assert.equal((await scope()).team.length, 5);
      },
    );
    await t.test(
      "assignments are tenant-bound, immutable in identity, non-overlapping and retry-safe",
      async () => {
        await as(owner);
        const id = randomUUID(),
          request = randomUUID();
        await assign(
          id,
          worker.worker,
          projects[0],
          0,
          true,
          "2026-01-01T05:00:00Z",
          null,
          request,
        );
        await assign(
          id,
          worker.worker,
          projects[0],
          0,
          true,
          "2026-01-01T05:00:00Z",
          null,
          request,
        );
        await assert.rejects(
          assign(randomUUID(), worker.worker, projects[0]),
          /assignment_overlap/,
        );
        await assert.rejects(
          assign(randomUUID(), worker.worker, projects[2]),
          /assignment_unavailable/,
        );
        await assert.rejects(
          assign(id, other.worker, projects[0], 1),
          /assignment_identity_locked/,
        );
        await assert.rejects(
          assign(id, worker.worker, projects[0], 0),
          /record_conflict/,
        );
        await as(worker.user);
        assert.deepEqual(
          (await scope()).projects.map((p) => p.id),
          [projects[0]],
        );
        await assert.rejects(
          assign(randomUUID(), worker.worker, projects[1]),
          /manager_required/,
        );
        await as(foreman.user);
        assert.deepEqual(
          (await scope()).projects,
          [],
          "foreman does not inherit subordinate project write scope",
        );
        await as(owner);
        await assign(id, worker.worker, projects[0], 1, false);
        await as(worker.user);
        assert.deepEqual((await scope()).projects, []);
        await as(owner);
        await assign(id, worker.worker, projects[0], 2, true);
        await as(worker.user);
        assert.equal((await scope()).projects.length, 1);
      },
    );
    await t.test(
      "half-open date intervals respect company timezone and DST",
      async () => {
        await as(owner);
        const id = randomUUID();
        await db.query(
          "select public.save_workforce_assignment_days($1,$2,$3,0,$4,$5,'2026-11-01','2026-11-02',true,'Synthetic DST date')",
          [a, randomUUID(), id, worker.worker, projects[1]],
        );
        const row = (
          await db.query<{ starts_at: Date; ends_at: Date }>(
            "select starts_at,ends_at from workforce_assignments where id=$1",
            [id],
          )
        ).rows[0];
        assert.equal(
          new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime(),
          25 * 3600_000,
        );
        await as(worker.user);
        assert.equal(
          await useProject(projects[1], "2026-11-01T03:59:59Z"),
          false,
        );
        assert.equal(
          await useProject(projects[1], "2026-11-01T04:00:00Z"),
          true,
        );
        assert.equal(
          await useProject(projects[1], "2026-11-02T04:59:59Z"),
          true,
        );
        assert.equal(
          await useProject(projects[1], "2026-11-02T05:00:00Z"),
          false,
        );
      },
    );
    await t.test(
      "supervisor reassignment immediately revokes old team; history remains manager-only",
      async () => {
        await as(owner);
        await configure(worker.worker, 1, "WORKER", foreman2.worker);
        await as(foreman.user);
        assert(!(await scope()).team.some((w) => w.id === worker.worker));
        await as(foreman2.user);
        assert((await scope()).team.some((w) => w.id === worker.worker));
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [
            a,
            worker.user,
            JSON.stringify({
              horasfix: ["read"],
              trabajadores: ["read"],
              activity: ["read"],
            }),
          ],
        );
        await as(worker.user);
        assert.equal(
          (
            await db.query(
              "select * from public.record_history($1,'workforce_profiles',$2)",
              [a, worker.worker],
            )
          ).rows.length,
          0,
        );
        assert(
          !(
            await db.query<{ entity: string }>(
              "select * from public.activity_feed($1)",
              [a],
            )
          ).rows.some((x) => x.entity.startsWith("workforce_")),
        );
        await as(owner);
        assert.equal(
          (
            await db.query(
              "select * from public.record_history($1,'workforce_profiles',$2)",
              [a, worker.worker],
            )
          ).rows.length,
          2,
        );
      },
    );
    await t.test(
      "profile disable and membership revocation deny reads and privileged retries",
      async () => {
        await as(owner);
        await configure(worker.worker, 2, "WORKER", null, false);
        await as(worker.user);
        assert.equal((await scope()).role, null);
        assert.deepEqual((await scope()).projects, []);
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [a, worker.user],
        );
        await as(worker.user);
        await assert.rejects(scope(), /permission_denied/);
      },
    );
    await t.test(
      "ordinary workers, amounts, hours and direct-write protections are preserved",
      async () => {
        assert.deepEqual(await fingerprint(), before);
        await as(office.user);
        await assert.rejects(
          db.query("update workforce_profiles set role='OFFICE' where id=$1", [
            worker.worker,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("delete from workforce_assignments"),
          /permission denied/,
        );
        await db.exec("reset role; set role anon");
        await assert.rejects(
          db.query("select public.workforce_scope($1)", [a]),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("assignment form rejects backwards dates and invalid IDs", () => {
  assert.equal(
    workforceAssignmentSchema.safeParse({
      id: randomUUID(),
      request: randomUUID(),
      version: 0,
      worker_id: randomUUID(),
      project_id: randomUUID(),
      starts_at: "2026-09-29",
      ends_at: "2026-09-28",
      active: true,
      reason: "Synthetic",
    }).success,
    false,
  );
});
