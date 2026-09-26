import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { initialDesign, rateLabels } from "../src/lib/designs";

test("ADT permit minimum survives persistence, estimate normalization and upgrades", async (t) => {
  const { db } = await fullDatabase();
  const owner = id(),
    outsider = id(),
    staff = id(),
    company = id(),
    foreign = id(),
    customer = id();
  const rates = {
    ...Object.fromEntries(Object.keys(rateLabels).map((k) => [k, "2"])),
    permit_fixed: "100",
    permit_area: "5",
    permit_threshold: "10",
  };
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202609260033_design_permit_floor.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const save = (
    design: string,
    kind: string,
    length: string,
    version = 0,
    refresh = false,
    permit = true,
    target = company,
  ) =>
    db.query("select public.save_design($1,$2,$3,$4,$5,$6)", [
      target,
      design,
      version,
      kind,
      JSON.stringify({
        name: "Synthetic permit test",
        customer_id: customer,
        spec: { ...initialDesign, length, width: "1", permit },
      }),
      refresh,
    ]);
  type Line = {
    name: string;
    base: string;
    unit_price: string;
    line_total: string;
  };
  const row = async (design: string) =>
    (
      await db.query<{
        version: number;
        price_version: number;
        items: Line[];
        total: string;
      }>(
        "select version,price_version,items,total from public.designs where id=$1",
        [design],
      )
    ).rows[0];
  const permitLine = (r: { items: Line[] }) =>
    r.items.find((i) => i.name === "Permiso");
  try {
    await db.query(
      "insert into auth.users values($1,'permit-owner@saasalldecor.invalid',now()),($2,'permit-outsider@saasalldecor.invalid',now()),($3,'permit-staff@saasalldecor.invalid',now())",
      [owner, outsider, staff],
    );
    await as(outsider);
    await db.query(
      "select public.create_company($1,'Synthetic foreign permits')",
      [foreign],
    );
    await as(owner);
    await db.query(
      "select public.create_company($1,'Synthetic permit floor')",
      [company],
    );
    await db.query(
      "select public.add_company_member($1,'permit-staff@saasalldecor.invalid')",
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
      "both configurators match independently recorded ADT boundary values",
      async () => {
        // ADT motor-costo.js / permisoDeArea, synthetic fixed=100, area=5, threshold=10.
        // Expected constants come from the source engine, not the SQL implementation.
        const cases = [
          { area: "9.999", amount: 100, base: "fixed" },
          { area: "10", amount: 100, base: "fixed" },
          { area: "11", amount: 100, base: "fixed" },
          { area: "20", amount: 100, base: "fixed" },
          { area: "20.01", amount: 100.05, base: "area_ft2" },
          { area: "21", amount: 105, base: "area_ft2" },
        ];
        for (const kind of ["pergolamotor", "nuevo3d"]) {
          for (const fixture of cases) {
            const design = id();
            await save(design, kind, fixture.area);
            const stored = await row(design),
              line = permitLine(stored);
            assert.equal(
              Number(line?.line_total),
              fixture.amount,
              `${kind}: ${fixture.area}`,
            );
            assert.equal(line?.base, fixture.base);
            assert.equal(
              Number(stored.total),
              Math.round((Number(fixture.area) * 2 + fixture.amount) * 100) /
                100,
            );
          }
        }
      },
    );
    await t.test("permit disabled adds no line", async () => {
      const design = id();
      await save(design, "pergolamotor", "11", 0, false, false);
      const stored = await row(design);
      assert.equal(permitLine(stored), undefined);
      assert.equal(Number(stored.total), 22);
    });
    await t.test(
      "estimate recalculation and idempotent conversion preserve the fixed floor",
      async () => {
        const design = id(),
          estimate = id();
        await save(design, "pergolamotor", "11");
        const convert = (target: string) =>
          db.query<{ result: string }>(
            "select public.design_to_estimate($1,$2,1,$3) result",
            [company, design, target],
          );
        assert.equal((await convert(estimate)).rows[0].result, estimate);
        assert.equal((await convert(id())).rows[0].result, estimate);
        const result = (
          await db.query<{ items: Line[]; total: string }>(
            "select items,total from public.estimates where id=$1",
            [estimate],
          )
        ).rows[0];
        assert.equal(Number(result.total), 122);
        assert.equal(Number(permitLine(result)?.line_total), 100);
        assert.equal(permitLine(result)?.base, "fixed");
      },
    );
    await t.test(
      "saved rates require explicit refresh and stale edits remain rejected",
      async () => {
        const design = id();
        await save(design, "nuevo3d", "11");
        await db.query("select public.save_price_book($1,1,$2)", [
          company,
          JSON.stringify({ ...rates, permit_fixed: "200" }),
        ]);
        await save(design, "nuevo3d", "11", 1, false);
        assert.equal(Number(permitLine(await row(design))?.line_total), 100);
        assert.equal((await row(design)).price_version, 1);
        await assert.rejects(save(design, "nuevo3d", "11", 1, true), {
          code: "PT409",
        });
        await save(design, "nuevo3d", "11", 2, true);
        assert.equal(Number(permitLine(await row(design))?.line_total), 200);
        assert.equal((await row(design)).price_version, 2);
      },
    );
    await t.test(
      "permissions and foreign companies remain rejected",
      async () => {
        await as(staff);
        await assert.rejects(save(id(), "pergolamotor", "11"), {
          code: "42501",
        });
        await as(outsider);
        await assert.rejects(save(id(), "nuevo3d", "11"), { code: "42501" });
        await as(owner);
        await assert.rejects(
          save(id(), "pergolamotor", "11", 0, false, true, foreign),
          { code: "42501" },
        );
      },
    );
    await t.test(
      "migration and reapplication preserve existing financial records and function privileges",
      async () => {
        // Create an old-rule document before applying the new function, as in an upgrade.
        await db.exec("reset role");
        const previous = await readFile(
          new URL(
            "../supabase/migrations/202609240028_business_conflicts.sql",
            import.meta.url,
          ),
          "utf8",
        );
        const start = previous.indexOf(
          "CREATE OR REPLACE FUNCTION public.save_design(",
        );
        const end =
          previous.indexOf("end;$function$;", start) + "end;$function$;".length;
        assert.ok(start >= 0 && end > start);
        await db.exec(previous.slice(start, end));
        await as(owner);
        const legacy = id(),
          estimate = id();
        await save(legacy, "pergolamotor", "11");
        assert.equal(Number(permitLine(await row(legacy))?.line_total), 55);
        await db.query("select public.design_to_estimate($1,$2,1,$3)", [
          company,
          legacy,
          estimate,
        ]);
        await db.exec("reset role");
        const snapshot = async () => ({
          designs: (await db.query("select * from public.designs order by id"))
            .rows,
          estimates: (
            await db.query("select * from public.estimates order by id")
          ).rows,
          audit: (
            await db.query("select * from public.audit_events order by id")
          ).rows,
          access: (
            await db.query(
              "select oid,proacl::text,prosecdef,proconfig from pg_proc where oid='public.save_design(uuid,uuid,integer,text,jsonb,boolean)'::regprocedure",
            )
          ).rows,
        });
        const before = await snapshot();
        await db.exec(migration);
        await db.exec(migration);
        assert.deepEqual(await snapshot(), before);
        await as(owner);
        assert.equal(Number(permitLine(await row(legacy))?.line_total), 55);
        const corrected = id();
        await save(corrected, "pergolamotor", "11");
        assert.equal(Number(permitLine(await row(corrected))?.line_total), 200);
      },
    );
  } finally {
    await db.close();
  }
});
