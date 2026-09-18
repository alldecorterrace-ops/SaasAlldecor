import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  planOperationalCustomers,
  customerMatchKey,
} from "../src/lib/migration/operational-customers";
import { historicalBusinessPayload } from "../src/lib/migration/historical-business-payload";
import { fullDatabase } from "./helpers/full-database";

const client = (id: string, email: string) => ({
  external_id: id,
  full_name: `Customer ${id}`,
  email,
  phone: "",
  address: "Old street",
  city: "City",
  postal_code: "12345",
  service: "Patio",
  client_date: "2020-01-02",
  notes: "Original note",
  status: "ACTIVO",
});
const fixture = () => ({
  format: "adt-history-snapshot-v1",
  origin: "restored_snapshot",
  clients: [
    client("clean", "clean@example.test"),
    client("dup1", "shared@example.test"),
    client("dup2", "shared@example.test"),
    client("current", "existing@example.test"),
    { ...client("invalid", "bad email"), status: "SKIP:invalid_email" },
  ],
  estimates: [],
  items: [],
  projects: [],
  invoices: [],
  payments: [],
  documents: [],
  contracts: [],
});

test("customer planner isolates ambiguous source and existing matches", () => {
  const company = randomUUID(),
    existing = [
      {
        id: randomUUID(),
        company_id: company,
        version: 1,
        email: "existing@example.test",
      },
    ];
  const plan = planOperationalCustomers(fixture(), existing, company);
  assert.deepEqual(plan.summary, { source: 5, ready: 1, review: 4 });
  assert.equal(
    plan.records.filter((r) =>
      r.review_reasons.includes("source_duplicate:email"),
    ).length,
    2,
  );
  assert.equal(
    customerMatchKey("phone", "+1 (305) 555-0123"),
    customerMatchKey("phone", "3055550123"),
  );
  assert.equal(customerMatchKey("full_name", "  A   CLIENT  "), "a client");
  assert.throws(
    () => planOperationalCustomers(fixture(), existing, randomUUID()),
    /wrong_company/,
  );
});

test("operational customer import preserves records, rejects races and enforces access", async (t) => {
  const { db } = await fullDatabase(),
    owner = randomUUID(),
    other = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  try {
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
    const existingId = randomUUID();
    await db.query("select public.save_customer($1,$2,0,$3)", [
      company,
      existingId,
      JSON.stringify({
        ...client("existing", "existing@example.test"),
        status: "active",
      }),
    ]);
    await as(other);
    await db.query("select public.create_company($1,'Company B')", [foreign]);
    await db.exec("reset role");
    const existing = (
      await db.query<{ value: unknown }>(
        "select to_jsonb(c) value from public.customers c where company_id=$1 order by id",
        [company],
      )
    ).rows.map((r) => r.value);
    const payload = historicalBusinessPayload(fixture(), company);
    await db.query("select app_private.import_historical_business($1,$2,$3)", [
      company,
      payload.snapshotSha256,
      JSON.stringify(payload.records),
    ]);
    const plan = planOperationalCustomers(fixture(), existing, company);
    const load = (records = plan.records, expected: unknown = existing) =>
      db.query<{ result: unknown }>(
        "select app_private.import_operational_customers($1,$2,$3,$4,$5) result",
        [
          company,
          owner,
          plan.snapshotSha256,
          JSON.stringify(expected),
          JSON.stringify(records),
        ],
      );
    await t.test(
      "changed destination and tampered source abort atomically",
      async () => {
        await assert.rejects(
          load(plan.records, []),
          /customer_destination_changed/,
        );
        const altered = structuredClone(plan.records);
        altered[0].data!.notes = "Changed";
        await assert.rejects(load(altered), /invalid_customer_copy/);
        const late = structuredClone(plan.records);
        late[4].source_sha256 = "0".repeat(64);
        await assert.rejects(load(late), /customer_source_changed/);
        assert.equal(
          (await db.query("select * from public.customers")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.historical_customer_migrations",
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "duplicate bypass is rejected on the database boundary",
      async () => {
        const altered = structuredClone(plan.records),
          r = altered[1];
        r.state = "imported";
        r.review_reasons = [];
        const original = payload.records.find(
          (p) => p.id === r.historical_id,
        )!.original;
        const { external_id: ignored, ...fields } = original;
        void ignored;
        r.data = { ...fields, status: "active" } as typeof r.data;
        await assert.rejects(
          load(altered),
          /customer_duplicate_requires_review/,
        );
      },
    );
    await t.test(
      "copies only clean source and preserves current customer and history",
      async () => {
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 1,
          review: 4,
          unchanged: 0,
        });
        const preserved = (
          await db.query<{ value: unknown }>(
            "select to_jsonb(c) value from public.customers c where id=$1",
            [existingId],
          )
        ).rows[0].value;
        assert.deepEqual(preserved, existing[0]);
        const imported = (
          await db.query<{ value: Record<string, unknown> }>(
            "select to_jsonb(c) value from public.customers c join public.historical_customer_migrations m on m.customer_id=c.id",
          )
        ).rows[0].value;
        for (const [key, value] of Object.entries(plan.records[0].data!))
          assert.equal(imported[key], value === "" ? null : value);
        assert.equal(
          (
            await db.query(
              "select * from app_private.historical_business_sources",
            )
          ).rows.length,
          5,
        );
        for (const table of ["projects", "invoices", "payments"])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        await db.query(
          "update public.customers set notes='Later user edit' where id=$1",
          [imported.id],
        );
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 0,
          review: 0,
          unchanged: 5,
        });
        assert.equal(
          (
            await db.query<{ notes: string }>(
              "select notes from public.customers where id=$1",
              [imported.id],
            )
          ).rows[0].notes,
          "Later user edit",
        );
      },
    );
    await t.test(
      "company and module permissions protect mappings and private import",
      async () => {
        await as(owner);
        assert.equal(
          (
            await db.query(
              "select * from public.historical_customer_migrations",
            )
          ).rows.length,
          5,
        );
        await assert.rejects(load(), /permission denied/);
        await assert.rejects(
          db.query("select * from app_private.operational_customer_imports"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("delete from public.historical_customer_migrations"),
          /permission denied/,
        );
        await as(other);
        assert.equal(
          (
            await db.query(
              "select * from public.historical_customer_migrations",
            )
          ).rows.length,
          0,
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,'{}')",
          [company, staff],
        );
        await as(staff);
        assert.equal(
          (
            await db.query(
              "select * from public.historical_customer_migrations",
            )
          ).rows.length,
          0,
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [company, staff, JSON.stringify({ clientes: ["read"] })],
        );
        await as(staff);
        assert.equal(
          (
            await db.query(
              "select * from public.historical_customer_migrations",
            )
          ).rows.length,
          5,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(
          db.query("select * from public.historical_customer_migrations"),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
