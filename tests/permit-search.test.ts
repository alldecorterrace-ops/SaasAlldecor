import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { workspaces } from "../src/lib/workspaces";
import { permitDateError } from "../src/lib/permit-filters";

test("permit search preserves tenant and project permissions, literal text and local dates", async (t) => {
  const { db } = await fullDatabase();
  const owner = id(),
    reader = id(),
    company = id(),
    foreign = id();
  async function as(user: string) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  }
  const search = async (
    query = "",
    status = "",
    from: string | null = null,
    to: string | null = null,
    target = company,
  ) =>
    (
      await db.query<{ id: string }>(
        "select id from public.search_permits($1,$2,$3,$4,$5) order by id",
        [target, query, status, from, to],
      )
    ).rows.map((r) => r.id);
  try {
    await db.query(
      "insert into auth.users values($1,'permit-owner@saasalldecor.invalid',now()),($2,'permit-reader@saasalldecor.invalid',now())",
      [owner, reader],
    );
    await as(owner);
    const projects: string[] = [];
    for (const target of [company, foreign]) {
      const customer = id(),
        estimate = id();
      await db.query(
        "select public.create_company($1,'Synthetic permit company')",
        [target],
      );
      await db.query("select public.save_customer($1,$2,0,$3)", [
        target,
        customer,
        JSON.stringify({
          full_name: "Synthetic permit client",
          status: "active",
        }),
      ]);
      await db.query("select public.save_estimate($1,$2,0,$3)", [
        target,
        estimate,
        JSON.stringify({
          customer_id: customer,
          estimate_date: "2026-09-25",
          valid_until: null,
          status: "BORRADOR",
          notes: "",
          discount: "0",
          taxes: "0",
          items: [{ ...emptyItem, name: "Synthetic work", unit_price: "100" }],
        }),
      ]);
      await db.query(
        "select public.approve_estimate($1,$2,1,'2026-09-25','Private Project Needle','Synthetic approval')",
        [target, estimate],
      );
      projects.push(
        (
          await db.query<{ id: string }>(
            "select id from public.projects where company_id=$1",
            [target],
          )
        ).rows[0].id,
      );
    }
    const first = id(),
      fallback = id(),
      later = id(),
      foreignPermit = id();
    for (const [record, date, status, target, project] of [
      [first, "2026-09-25", "PENDIENTE", company, projects[0]],
      [fallback, "", "PENDIENTE", company, projects[0]],
      [later, "2026-09-26", "RECHAZADO", company, projects[0]],
      [foreignPermit, "2026-09-25", "PENDIENTE", foreign, projects[1]],
    ]) {
      await db.query("select public.save_work_record($1,$2,0,'permits',$3)", [
        target,
        record,
        JSON.stringify({
          name: record === first ? "Building sample" : "Other permit",
          status,
          project_id: project,
          data: {
            ...workspaces.permits.defaults,
            submitted_date: date,
            authority: record === first ? "Unique City" : "Other City",
            permit_number: record === first ? "QA-(100%)_A" : "",
            notes: record === first ? "Notes only needle" : "Synthetic reason",
          },
        }),
      ]);
    }
    await db.query("select public.save_work_record($1,$2,0,'inventory',$3)", [
      company,
      id(),
      JSON.stringify({
        name: "Building sample",
        status: "ACTIVO",
        data: workspaces.inventory.defaults,
      }),
    ]);
    await db.query(
      "select public.add_company_member($1,'permit-reader@saasalldecor.invalid')",
      [company],
    );
    await db.query("select public.set_member_access($1,$2,'member',true,$3)", [
      company,
      reader,
      JSON.stringify({ permisos: ["read"] }),
    ]);
    await db.exec("reset role");
    await db.query(
      "update public.companies set timezone='America/Chicago' where id=$1",
      [company],
    );
    await db.query(
      "update public.work_records set created_at='2026-09-26T02:00:00Z' where id=$1",
      [fallback],
    );
    await as(owner);
    const before = (
      await db.query(
        "select id,version,data from public.work_records order by id",
      )
    ).rows;
    await t.test(
      "finds each original search field without wildcard or filter injection",
      async () => {
        for (const query of [
          "Building sample",
          "unique city",
          "QA-(100%)_A",
          "notes only needle",
          "%",
          "_A",
        ])
          assert.deepEqual(await search(query), [first]);
        assert.deepEqual(await search("%') OR true --"), []);
        assert.deepEqual(
          await search("Private Project Needle"),
          [first, fallback, later].sort(),
        );
        assert.equal((await search()).length, 3);
      },
    );
    await t.test(
      "date bounds are inclusive and fallback uses company timezone",
      async () => {
        assert.deepEqual(
          await search("", "", "2026-09-25", "2026-09-25"),
          [first, fallback].sort(),
        );
        assert.deepEqual(
          await search("", "RECHAZADO", "2026-09-26", "2026-09-26"),
          [later],
        );
        assert.deepEqual(await search("", "", "2026-09-27", null), []);
        await assert.rejects(search("", "", "2026-09-26", "2026-09-25"), {
          code: "22023",
        });
        await assert.rejects(search("x".repeat(101)), { code: "22023" });
      },
    );
    await t.test(
      "readers cannot infer project names or other companies through search",
      async () => {
        await as(reader);
        assert.deepEqual(await search("Unique City"), [first]);
        assert.deepEqual(await search("Private Project Needle"), []);
        await assert.rejects(search("", "", null, null, foreign), {
          code: "42501",
        });
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [
            company,
            reader,
            JSON.stringify({ permisos: ["read"], "fin-proyectos": ["read"] }),
          ],
        );
        await as(reader);
        assert.deepEqual(
          await search("Private Project Needle"),
          [first, fallback, later].sort(),
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,'{}')",
          [company, reader],
        );
        await as(reader);
        await assert.rejects(search(), { code: "42501" });
        await db.exec("reset role;set role anon");
        await assert.rejects(search(), { code: "42501" });
        await as(owner);
      },
    );
    assert.deepEqual(
      (
        await db.query(
          "select id,version,data from public.work_records order by id",
        )
      ).rows,
      before,
    );
  } finally {
    await db.close();
  }
});

test("permit date filters reject impossible and inverted dates", () => {
  assert.equal(permitDateError("2026-09-25", "2026-09-25"), null);
  assert.equal(permitDateError("", "2026-09-25"), null);
  assert.match(permitDateError("2026-09-26", "2026-09-25")!, /posterior/);
  assert.match(permitDateError("2026-02-30", "")!, /fechas/);
});
