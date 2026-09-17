import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  emptyItem,
  lineCents,
  centsText,
  estimateTotals,
  estimateSchema,
  type EstimateItem,
} from "../src/lib/estimates";
test("Estimate decimal arithmetic matches ADT bases without floating point drift", () => {
  const cases: [Partial<EstimateItem>, string][] = [
    [
      {
        base: "area_ft2",
        unit_price: "12.35",
        qty: "2",
        length: "12",
        width: "10",
      },
      "2964.00",
    ],
    [
      { base: "linear_ft", unit_price: "1.25", qty: "2", length: "10.5" },
      "26.25",
    ],
    [
      {
        base: "volume_ft3",
        unit_price: "2",
        qty: "1",
        length: "2.5",
        width: "3",
        height: "4",
      },
      "60.00",
    ],
    [{ base: "unit", unit_price: "0.10", qty: "3" }, "0.30"],
    [{ base: "fixed", unit_price: "1.005" }, "error"],
    [{ base: "fixed", unit_price: "1.01", qty: "0.5" }, "0.51"],
    [
      { base: "manual", manual_total: "123.45", qty: "99", unit_price: "900" },
      "123.45",
    ],
  ];
  for (const [patch, total] of cases) {
    const i = { ...emptyItem, ...patch };
    if (total === "error") assert.throws(() => lineCents(i));
    else assert.equal(centsText(lineCents(i)), total);
  }
  assert.deepEqual(
    estimateTotals({
      items: [{ ...emptyItem, unit_price: "0.10", qty: "3" }],
      discount: "0.10",
      taxes: "0.01",
    }),
    { subtotal: "0.30", total: "0.21" },
  );
  assert.throws(() =>
    estimateTotals({ items: [], discount: "0.01", taxes: "0" }),
  );
});

test("PostgreSQL estimates: totals, immutable history, numbering and isolation", async (t) => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222",
    staff = "33333333-3333-4333-8333-333333333333";
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    customer = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    product = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    estimate = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    foreign = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const f of [
    "202609170001_foundation.sql",
    "202609170002_commercial.sql",
    "202609170004_estimates.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + f, import.meta.url),
        "utf8",
      ),
    );
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [other, "other@example.test"],
    [staff, "staff@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
  async function as(id: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  }
  const item = {
    ...emptyItem,
    product_id: product,
    name: "Pérgola",
    base: "area_ft2" as const,
    unit_price: "12.35",
    qty: "2",
    length: "12",
    width: "10",
    description: "Medidas y acabado conservados",
  };
  const input = {
    customer_id: customer,
    estimate_date: "2026-09-17",
    valid_until: "2026-10-17",
    status: "BORRADOR",
    notes: "Condiciones originales",
    discount: "64.00",
    taxes: "10.15",
    items: [item],
  };
  const save = (
    version = 0,
    data: unknown = input,
    id = estimate,
    company = a,
  ) =>
    db.query("select public.save_estimate($1,$2,$3,$4)", [
      company,
      id,
      version,
      JSON.stringify(data),
    ]);
  const grant = async (permissions: unknown) => {
    await as(owner);
    await db.query("select public.set_member_access($1,$2,$3,true,$4)", [
      a,
      staff,
      "member",
      JSON.stringify(permissions),
    ]);
    await as(staff);
  };
  try {
    await as(owner);
    await db.query("select public.create_company($1,$2)", [a, "Empresa A"]);
    await db.query("select public.save_customer($1,$2,0,$3)", [
      a,
      customer,
      JSON.stringify({ full_name: "Cliente original", status: "active" }),
    ]);
    await db.query("select public.save_product($1,$2,0,$3)", [
      a,
      product,
      JSON.stringify({
        name: "Pérgola",
        category: "Pérgola",
        base: "area_ft2",
        unit_price: "12.35",
        specs: [],
        options: [],
        active: true,
      }),
    ]);
    await db.query("select public.add_company_member($1,$2)", [
      a,
      "staff@example.test",
    ]);
    await as(other);
    await db.query("select public.create_company($1,$2)", [b, "Empresa B"]);
    await db.query("select public.save_customer($1,$2,0,$3)", [
      b,
      foreign,
      JSON.stringify({ full_name: "Cliente B", status: "active" }),
    ]);
    await as(owner);
    await t.test(
      "validation rejects impossible dates and zero dimensions",
      () => {
        assert.equal(
          estimateSchema.safeParse({ ...input, valid_until: "2026-09-01" })
            .success,
          false,
        );
        assert.equal(
          estimateSchema.safeParse({
            ...input,
            items: [{ ...item, length: "0" }],
          }).success,
          false,
        );
      },
    );
    await t.test("anonymous access denied", async () => {
      await as("", "anon");
      await assert.rejects(save(), /permission denied/);
      await assert.rejects(
        db.query("select * from public.estimates"),
        /permission denied/,
      );
      await as(owner);
    });
    await t.test(
      "server ignores forged totals, number, version and customer snapshot",
      async () => {
        await save(0, {
          ...input,
          total: 1,
          subtotal: 1,
          number: "FAKE",
          version: 50,
          customer_snapshot: { full_name: "Fake" },
        });
        const r = (
          await db.query<{
            total: string;
            subtotal: string;
            number: string;
            version: number;
            customer_snapshot: { full_name: string };
            items: { line_total: string }[];
          }>("select * from public.estimates")
        ).rows[0];
        assert.equal(r.total, "2910.15");
        assert.equal(r.subtotal, "2964.00");
        assert.equal(r.number, "EST-2026-0001");
        assert.equal(r.version, 1);
        assert.equal(r.customer_snapshot.full_name, "Cliente original");
        assert.equal(r.items[0].line_total, "2964.00");
      },
    );
    await t.test(
      "duplicate creation cannot duplicate document or consume a number",
      async () => {
        await assert.rejects(save(), /duplicate/);
        await save(0, input, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef");
        const rows = (
          await db.query<{ number: string }>(
            "select number from public.estimates order by number",
          )
        ).rows;
        assert.deepEqual(
          rows.map((x) => x.number),
          ["EST-2026-0001", "EST-2026-0002"],
        );
      },
    );
    await t.test("cross-company access and references fail", async () => {
      await assert.rejects(
        save(1, { ...input, customer_id: foreign }),
        /customer_unavailable/,
      );
      await as(other);
      assert.equal(
        (await db.query("select * from public.estimates")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select * from public.estimate_revisions")).rows.length,
        0,
      );
      await assert.rejects(save(1), /permission_denied/);
      await as(owner);
    });
    await t.test(
      "direct updates and history writes cannot bypass validation",
      async () => {
        await assert.rejects(
          db.query("update public.estimates set total=0"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("delete from public.estimate_revisions"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "server rejects invalid money, dimensions, dates, empty items and unsupported status",
      async () => {
        for (const data of [
          { ...input, discount: "99999" },
          { ...input, items: [] },
          { ...input, status: "APROBADO" },
          { ...input, valid_until: "2026-01-01" },
          { ...input, items: [{ ...item, unit_price: "12.345" }] },
          { ...input, items: [{ ...item, qty: "0" }] },
        ])
          await assert.rejects(save(1, data));
        assert.equal(
          (
            await db.query<{ version: number }>(
              "select version from public.estimates where id=$1",
              [estimate],
            )
          ).rows[0].version,
          1,
        );
      },
    );
    await t.test(
      "server and preview agree for every basis and rounding edge",
      async () => {
        for (const patch of [
          {
            base: "linear_ft",
            qty: "1.5",
            length: "3.333",
            unit_price: "0.05",
          },
          {
            base: "volume_ft3",
            qty: "2",
            length: "2.5",
            width: "3",
            height: "4",
            unit_price: "2",
          },
          { base: "unit", qty: "3", unit_price: "0.10" },
          { base: "fixed", qty: "0.5", unit_price: "1.01" },
          { base: "manual", manual_total: "123.45", qty: "3" },
        ]) {
          const line = { ...item, ...patch, product_id: null } as EstimateItem;
          const v = (
            await db.query<{ version: number }>(
              "select version from public.estimates where id=$1",
              [estimate],
            )
          ).rows[0].version;
          await save(v, { ...input, discount: "0", taxes: "0", items: [line] });
          assert.equal(
            (
              await db.query<{ total: string }>(
                "select total from public.estimates where id=$1",
                [estimate],
              )
            ).rows[0].total,
            centsText(lineCents(line)),
          );
        }
      },
    );
    await t.test(
      "old revisions keep original client and line prices after edits",
      async () => {
        await db.query("select public.save_customer($1,$2,1,$3)", [
          a,
          customer,
          JSON.stringify({ full_name: "Cliente cambiado", status: "active" }),
        ]);
        await save(6, {
          ...input,
          notes: "Nueva nota",
          items: [{ ...item, unit_price: "15" }],
        });
        const old = (
          await db.query<{
            snapshot: {
              notes: string;
              customer_snapshot: { full_name: string };
              total: number;
            };
          }>(
            "select snapshot from public.estimate_revisions where estimate_id=$1 and version=1",
            [estimate],
          )
        ).rows[0].snapshot;
        assert.equal(old.notes, "Condiciones originales");
        assert.equal(old.customer_snapshot.full_name, "Cliente original");
        assert.equal(Number(old.total), 2910.15);
        assert.equal(
          (
            await db.query<{ customer_snapshot: { full_name: string } }>(
              "select customer_snapshot from public.estimates where id=$1",
              [estimate],
            )
          ).rows[0].customer_snapshot.full_name,
          "Cliente original",
        );
        await assert.rejects(save(6), /record_conflict/);
      },
    );
    await t.test("read-only estimator cannot write", async () => {
      await grant({ "fin-estimados": ["read"] });
      assert.equal(
        (await db.query("select * from public.estimates")).rows.length,
        2,
      );
      await assert.rejects(save(7), /permission_denied/);
    });
    await t.test(
      "editor can retain historical references but needs customer/catalog access for new ones",
      async () => {
        await grant({ "fin-estimados": ["write"] });
        await save(7, { ...input, notes: "Edición permitida" });
        await assert.rejects(
          save(0, input, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea"),
          /customer_access_required/,
        );
      },
    );
    await t.test(
      "annulment is preserved, revisioned and locks future edits",
      async () => {
        await as(owner);
        await save(8, { ...input, status: "ANULADA" });
        await assert.rejects(save(9, input), /estimate_voided/);
        assert.equal(
          (
            await db.query(
              "select * from public.estimate_revisions where estimate_id=$1",
              [estimate],
            )
          ).rows.length,
          9,
        );
      },
    );
    await t.test(
      "activity exposes estimate metadata only to authorized readers",
      async () => {
        await grant({ activity: ["read"], "fin-estimados": ["read"] });
        const rows = (
          await db.query<{ entity: string }>(
            "select * from public.activity_feed($1)",
            [a],
          )
        ).rows;
        assert.ok(rows.length);
        assert.ok(rows.every((x) => x.entity === "estimates"));
        await grant({ activity: ["read"] });
        assert.equal(
          (await db.query("select * from public.activity_feed($1)", [a])).rows
            .length,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
