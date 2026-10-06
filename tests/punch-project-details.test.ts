import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { receiptReviewFixture } from "./helpers/receipt-review-fixture";
import {
  filterPunchProjects,
  punchProjectsSchema,
} from "../src/lib/time-visits";

test("Campo catalog details preserve rows/grants and disclose only available same-company projects", async (t) => {
  const { db } = await fullDatabase(
    "202610060082_completed_project_visits.sql",
  );
  try {
    const f = await receiptReviewFixture(db);
    await db.exec("reset role");
    const customer = (
      await db.query<{ id: string }>(
        "select customer_id id from projects where id=$1",
        [f.project],
      )
    ).rows[0].id;
    await db.query(
      "update customers set full_name='María Óñez · 客户',address='  100 Calle Ficticia, EE. UU.  ',city='  Ciudad Ensayo  ',postal_code='  00000  ',email='private@example.test',phone='private-phone',notes='PRIVATE NOTES' where id=$1",
      [customer],
    );
    await db.query(
      "update projects set project_date='2026-10-06',start_date='2027-01-01',end_date='2027-01-02' where id=$1",
      [f.project],
    );
    const snapshot = async () => {
      await db.exec("reset role");
      const tables = (
        await db.query<{ s: string; n: string }>(
          "select schemaname s,tablename n from pg_tables where schemaname in ('public','app_private','auth','storage') order by schemaname,tablename",
        )
      ).rows;
      const rows: Record<string, unknown> = {};
      for (const { s, n } of tables)
        rows[s + "." + n] = (
          await db.query(
            `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') data from "${s}"."${n}" t`,
          )
        ).rows[0];
      return rows;
    };
    const before = await snapshot();
    const grants = (
      await db.query(
        "select proacl from pg_proc where oid='public.time_punch_projects(uuid)'::regprocedure",
      )
    ).rows;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610060083_punch_project_details.sql",
          import.meta.url,
        ),
        "utf8",
      ),
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
    const reject = async (run: () => Promise<unknown>, match: RegExp) => {
      await db.exec("savepoint denied");
      try {
        await assert.rejects(run, match);
      } finally {
        await db.exec("rollback to denied;release denied");
      }
    };
    const rollback = async (run: () => Promise<void>) => {
      await db.exec("reset role;begin");
      try {
        await run();
      } finally {
        await db.exec("rollback;reset role");
      }
    };
    await t.test(
      "read-only replacement retains every row and the original function grants",
      async () => {
        assert.deepEqual(await snapshot(), before);
        assert.deepEqual(
          (
            await db.query(
              "select proacl from pg_proc where oid='public.time_punch_projects(uuid)'::regprocedure",
            )
          ).rows,
          grants,
        );
      },
    );
    await t.test(
      "current customer/date/address match the operational source and no contact or financial data escapes",
      async () => {
        const projects = await catalog();
        const project = projects.find((p) => p.id === f.project);
        assert.deepEqual(project, {
          id: f.project,
          name: "Synthetic receipt project",
          state: "asignado",
          customer_name: "María Óñez · 客户",
          project_date: "2026-10-06",
          address: "100 Calle Ficticia, Ciudad Ensayo, 00000",
        });
        assert.equal(
          projects.some((p) => p.id === f.foreignProject),
          false,
        );
        assert.deepEqual(Object.keys(project!).sort(), [
          "address",
          "customer_name",
          "id",
          "name",
          "project_date",
          "state",
        ]);
        for (const table of ["customers", "projects", "invoices", "payments"])
          assert.equal(
            (await db.query(`select * from ${table}`)).rows.length,
            0,
          );
      },
    );
    await t.test(
      "missing address pieces are empty, partial pieces join once, and project date stays canonical",
      async () =>
        rollback(async () => {
          for (const [address, city, zip, expected] of [
            [null, null, null, ""],
            ["  ", "  ", "  ", ""],
            [null, "Ciudad Ensayo", null, "Ciudad Ensayo"],
            ["Calle Uno", null, "00000", "Calle Uno, 00000"],
            [
              "Calle Dos, EEUU",
              "Ciudad Dos",
              "00001",
              "Calle Dos, Ciudad Dos, 00001",
            ],
            [
              "Calle Tres, ee. uu.",
              "Ciudad Tres",
              "00002",
              "Calle Tres, Ciudad Tres, 00002",
            ],
          ]) {
            await db.exec("reset role");
            await db.query(
              "update customers set address=$2,city=$3,postal_code=$4 where id=$1",
              [customer, address, city, zip],
            );
            const p = (await catalog()).find((p) => p.id === f.project)!;
            assert.equal(p.address, expected);
            assert.equal(p.project_date, "2026-10-06");
          }
        }),
    );
    await t.test(
      "catalog follows current canonical customer changes, never the invoice snapshot",
      async () =>
        rollback(async () => {
          await db.query(
            "update customers set full_name='Cliente actualizado' where id=$1",
            [customer],
          );
          assert.equal(
            (await catalog()).find((p) => p.id === f.project)?.customer_name,
            "Cliente actualizado",
          );
          await db.exec("reset role");
          const invoice = (
            await db.query<{ name: string }>(
              "select customer_snapshot->>'full_name' name from invoices where project_id=$1",
              [f.project],
            )
          ).rows[0];
          assert.equal(invoice.name, "Synthetic receipt customer");
        }),
    );
    await t.test(
      "cancelled/unavailable projects, foreign companies, read-only access and disabled profiles remain blocked",
      async () =>
        rollback(async () => {
          await db.query("update projects set status='CANCELADO' where id=$1", [
            f.project,
          ]);
          assert.equal(
            (await catalog()).some((p) => p.id === f.project),
            false,
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
          await reject(() => catalog(), /permission_denied/);
          await f.as(f.owner);
          await db.query("select set_member_access($1,$2,'member',true,$3)", [
            f.a,
            f.worker.user,
            JSON.stringify({ horasfix: ["write"] }),
          ]);
          await db.exec("reset role");
          await db.query("update projects set status='NUEVO' where id=$1", [
            f.project,
          ]);
          await db.query(
            "update workforce_profiles set enabled=false where company_id=$1 and id=$2",
            [f.a, f.worker.id],
          );
          assert.deepEqual(await catalog(), []);
        }),
    );
    await t.test(
      "all catalog reads and rolled-back adversarial trials leave the full original dataset unchanged",
      async () => {
        assert.deepEqual(await snapshot(), before);
      },
    );
  } finally {
    await db.close();
  }
});

test("Campo search matches all five source fields, Unicode normalization and both financial views", () => {
  const id = "a0181eea-a8b6-4992-ac71-dd1671b6c219";
  const rows = punchProjectsSchema.parse([
    {
      id,
      name: "Terraza Ñandú",
      state: "terminado",
      customer_name: "María Óñez · 客户",
      project_date: "2026-10-06",
      address: "100 Calle Ficticia, Ciudad Ensayo, 00000",
    },
    {
      id: "fa5a65db-9ce5-4a94-b9e9-8911bca9c04e",
      name: "Obra activa",
      state: "activo",
      customer_name: "María Óñez",
      project_date: "2026-10-06",
      address: "100 Calle Ficticia",
    },
    {
      id: "fa5a65db-9ce5-4a94-b9e9-8911bca9c04f",
      name: "Obra asignada",
      state: "asignado",
    },
  ]);
  for (const query of [
    "  MARIA onez  ",
    "ñandú",
    "客户",
    "calle ficticia",
    "00000",
    "2026-10-06",
    id,
  ]) {
    assert.deepEqual(
      filterPunchProjects(rows, true, query).map((p) => p.id),
      [id],
      query,
    );
  }
  assert.equal(filterPunchProjects(rows, false, "maria").length, 1);
  assert.equal(filterPunchProjects(rows, false, "").length, 2);
  assert.deepEqual(filterPunchProjects(rows, true, "no existe"), []);
  assert.deepEqual(rows[2], {
    id: "fa5a65db-9ce5-4a94-b9e9-8911bca9c04f",
    name: "Obra asignada",
    state: "asignado",
    customer_name: "",
    project_date: null,
    address: "",
  });
  assert.equal(
    punchProjectsSchema.safeParse([{ ...rows[0], project_date: "2026-02-30" }])
      .success,
    false,
  );
});
