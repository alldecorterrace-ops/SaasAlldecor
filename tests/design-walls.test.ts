import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import {
  designWalls,
  initialDesign,
  rateLabels,
  type DesignSpec,
} from "../src/lib/designs";

test("independent ADT walls preserve per-wall details, tariff snapshots and aggregate rounding", async (t) => {
  const { db } = await fullDatabase();
  const owner = id(),
    outsider = id(),
    staff = id(),
    company = id(),
    foreign = id(),
    customer = id();
  const rates = {
    ...Object.fromEntries(Object.keys(rateLabels).map((k) => [k, "2"])),
    wall_panel: "3",
    wall_composite: "4",
    wall_aluminum: "5",
    wall_solid31: "6",
    permit_fixed: "100",
    permit_threshold: "10",
    permit_area: "5",
  };
  const walls: NonNullable<DesignSpec["walls"]> = [
    { length: "2", height: "12", model: "panel", color: "Blanco" },
    { length: "1.5", height: "4", model: "composite", color: "Madera" },
    { length: "2", height: "3", model: "aluminum", color: "Negro" },
    { length: "1", height: "1", model: "solid31", color: "Gris" },
  ];
  const spec: DesignSpec = {
    ...initialDesign,
    length: "11",
    width: "1",
    roof_enabled: false,
    walls,
    permit: true,
  };
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const save = (
    key: string,
    version: number,
    s: unknown = spec,
    refresh = false,
    kind = "pergolamotor",
    target = company,
  ) =>
    db.query("select public.save_design($1,$2,$3,$4,$5,$6)", [
      target,
      key,
      version,
      kind,
      JSON.stringify({
        name: "Synthetic independent walls",
        customer_id: customer,
        spec: s,
      }),
      refresh,
    ]);
  type Row = {
    version: number;
    total: string;
    price_version: number;
    spec: DesignSpec;
    rate_snapshot: Record<string, string>;
    items: Array<{
      name: string;
      description: string;
      line_total: string;
      unit_price: string;
      base: string;
    }>;
  };
  const row = async (key: string) =>
    (await db.query<Row>("select * from public.designs where id=$1", [key]))
      .rows[0];
  const convert = async (key: string, version: number) =>
    (
      await db.query<{ result: string }>(
        "select public.design_to_estimate($1,$2,$3,$4) result",
        [company, key, version, id()],
      )
    ).rows[0].result;
  try {
    await db.query(
      "insert into auth.users values($1,'walls-owner@saasalldecor.invalid',now()),($2,'walls-other@saasalldecor.invalid',now()),($3,'walls-staff@saasalldecor.invalid',now())",
      [owner, outsider, staff],
    );
    await as(outsider);
    await db.query("select public.create_company($1,'Synthetic other walls')", [
      foreign,
    ]);
    await as(owner);
    await db.query("select public.create_company($1,'Synthetic walls')", [
      company,
    ]);
    await db.query(
      "select public.add_company_member($1,'walls-staff@saasalldecor.invalid')",
      [company],
    );
    await db.query("select public.save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({ full_name: "Synthetic client", status: "active" }),
    ]);
    await db.query("select public.save_price_book($1,0,$2)", [
      company,
      JSON.stringify(rates),
    ]);
    await t.test(
      "both kinds support four independent models without a roof, preserving details in estimates",
      async () => {
        for (const kind of ["pergolamotor", "nuevo3d"]) {
          const key = id();
          await save(key, 0, spec, false, kind);
          const actual = await row(key);
          // Constants independently evaluated from live ADT tarifaPared and paredesPrecio.
          assert.equal(Number(actual.total), 232);
          assert.deepEqual(actual.spec.walls, walls);
          assert.equal(actual.items.length, 2);
          assert.equal(Number(actual.items[0].line_total), 132);
          assert.equal(actual.items[0].base, "fixed");
          assert.match(actual.items[0].description, /Aluminio Negro.*2×3 ft/);
          assert.match(actual.items[0].description, /Paneles sólido 3×1 Gris/);
          assert.equal(Number(actual.items[1].line_total), 100);
          const estimate = await convert(key, 1);
          assert.equal(await convert(key, 1), estimate);
          const stored = (
            await db.query<{ items: unknown; total: string }>(
              "select items,total from public.estimates where id=$1",
              [estimate],
            )
          ).rows[0];
          assert.equal(Number(stored.total), 232);
          assert.deepEqual(stored.items, actual.items);
        }
      },
    );
    await t.test(
      "walls can exceed structure height and are excluded from permit area",
      async () => {
        const key = id();
        await save(key, 0, { ...spec, roof_enabled: true });
        const actual = await row(key);
        assert.equal(Number(actual.total), 254);
        assert.equal(
          Number(actual.items.find((i) => i.name === "Permiso")?.line_total),
          100,
        );
      },
    );
    await t.test(
      "sums unrounded walls before rounding once, and ignores client-supplied totals",
      async () => {
        const key = id();
        await save(key, 0, {
          ...spec,
          permit: false,
          walls: [
            {
              length: "0.002",
              height: "1",
              model: "panel",
              color: "",
              total: 999,
            },
            { length: "0.002", height: "1", model: "panel", color: "" },
          ],
          total: 999,
        });
        const actual = await row(key);
        assert.equal(Number(actual.total), 0.01);
        assert.equal(actual.items.length, 1);
        assert.equal("total" in (actual.spec.walls?.[0] ?? {}), false);
        assert.equal("total" in actual.spec, false);
        const estimate = await convert(key, 1);
        assert.equal(
          Number(
            (
              await db.query<{ total: string }>(
                "select total from public.estimates where id=$1",
                [estimate],
              )
            ).rows[0].total,
          ),
          0.01,
        );
      },
    );
    await t.test(
      "invalid arrays, options and dimensions fail without partially saving",
      async () => {
        for (const bad of [
          null,
          {},
          Array(11).fill(walls[0]),
          [{ ...walls[0], length: "201" }],
          [{ ...walls[0], height: "-1" }],
          [{ ...walls[0], model: "unknown" }],
          [{ ...walls[0], color: "x".repeat(81) }],
          [null],
        ]) {
          const key = id();
          await assert.rejects(save(key, 0, { ...spec, walls: bad }));
          assert.equal(await row(key), undefined);
        }
        await assert.rejects(
          save(id(), 0, { ...spec, walls: [], permit: false }),
          /empty_design/,
        );
        await assert.rejects(
          save(id(), 0, { ...spec, roof_enabled: "false" }),
          /invalid_walls/,
        );
      },
    );
    await t.test(
      "rejected old clients and stale revisions preserve independent walls",
      async () => {
        const key = id();
        await save(key, 0);
        const before = await row(key);
        await assert.rejects(
          save(key, 1, initialDesign),
          /design_client_outdated/,
        );
        await assert.rejects(save(key, 0), { code: "PT409" });
        assert.deepEqual(await row(key), before);
        await save(key, 1, { ...spec, walls: [walls[0]] });
        assert.equal((await row(key)).spec.walls?.length, 1);
        assert.equal(Number((await row(key)).total), 172);
      },
    );
    await t.test(
      "price edits do not change saved snapshots; older clients preserve new rate keys",
      async () => {
        const key = id();
        await save(key, 0);
        const { wall_aluminum, wall_solid31, ...legacyRates } = rates;
        void wall_aluminum;
        void wall_solid31;
        await db.query("select public.save_price_book($1,1,$2)", [
          company,
          JSON.stringify({ ...legacyRates, wall_panel: "7" }),
        ]);
        const book = (
          await db.query<{ rates: Record<string, string> }>(
            "select rates from public.price_books where company_id=$1",
            [company],
          )
        ).rows[0];
        assert.equal(book.rates.wall_aluminum, "5");
        assert.equal(book.rates.wall_solid31, "6");
        await save(key, 1);
        assert.equal(Number((await row(key)).total), 232);
        assert.equal((await row(key)).price_version, 1);
        await save(key, 2, spec, true);
        assert.equal(Number((await row(key)).total), 328);
        assert.equal((await row(key)).price_version, 2);
      },
    );
    await t.test(
      "zero wall tariffs match ADT defaults and capture the effective amounts",
      async () => {
        await db.query("select public.save_price_book($1,2,$2)", [
          company,
          JSON.stringify({
            ...rates,
            wall_panel: "0",
            wall_composite: "0",
            wall_aluminum: "0",
            wall_solid31: "0",
          }),
        ]);
        const key = id();
        await save(key, 0, { ...spec, permit: false });
        const actual = await row(key);
        assert.equal(Number(actual.total), 990); // 24*25 + 6*30 + 6*30 + 1*30.
        assert.equal(actual.rate_snapshot.wall_panel, "25");
        assert.equal(actual.rate_snapshot.wall_aluminum, "30");
        assert.equal(
          (
            await db.query<{ rate: string }>(
              "select rates->>'wall_panel' rate from public.price_books where company_id=$1",
              [company],
            )
          ).rows[0].rate,
          "0",
        );
      },
    );
    await t.test(
      "legacy single walls render faithfully without rewriting them",
      async () => {
        assert.deepEqual(
          designWalls({
            ...initialDesign,
            wall: "panel",
            wall_length: "4",
            wall_height: "8",
          }),
          [{ length: "4", height: "8", model: "panel", color: "" }],
        );
        assert.deepEqual(
          designWalls({ ...initialDesign, wall: "panel", walls: [] }),
          [],
        );
        const key = id();
        await save(key, 0, {
          ...initialDesign,
          wall: "panel",
          wall_length: "4",
          wall_height: "8",
          permit: false,
        });
        assert.equal(Number((await row(key)).total), 480); // Legacy explicitly zero panel rate remains zero.
      },
    );
    await t.test(
      "permission and tenant boundaries apply before any wall writes",
      async () => {
        await as(staff);
        await assert.rejects(save(id(), 0), { code: "42501" });
        await as(outsider);
        await assert.rejects(save(id(), 0), { code: "42501" });
        await as(owner);
        await assert.rejects(
          save(id(), 0, spec, false, "pergolamotor", foreign),
          { code: "42501" },
        );
      },
    );
    await t.test(
      "reapplying function definitions leaves saved records and privileges unchanged",
      async () => {
        await db.exec("reset role");
        const snapshot = async () => ({
          designs: (await db.query("select * from public.designs order by id"))
            .rows,
          estimates: (
            await db.query("select * from public.estimates order by id")
          ).rows,
          books: (
            await db.query("select * from public.price_books order by id")
          ).rows,
          audit: (
            await db.query("select * from public.audit_events order by id")
          ).rows,
          functions: (
            await db.query(
              "select oid,proacl::text,proowner,prosecdef,proconfig from pg_proc where oid in ('public.save_design(uuid,uuid,integer,text,jsonb,boolean)'::regprocedure,'public.save_price_book(uuid,integer,jsonb)'::regprocedure) order by oid",
            )
          ).rows,
        });
        const before = await snapshot(),
          sql = await readFile(
            new URL(
              "../supabase/migrations/202609260034_independent_design_walls.sql",
              import.meta.url,
            ),
            "utf8",
          );
        await db.exec(sql);
        await db.exec(sql);
        assert.deepEqual(await snapshot(), before);
      },
    );
  } finally {
    await db.close();
  }
});
