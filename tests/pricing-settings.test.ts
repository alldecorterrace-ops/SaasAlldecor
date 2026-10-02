import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  capturePricingForm,
  effectivePricing,
  pricingForm,
  pricingComponentRates,
  pricingSimulation,
  pricingSimulationDefaults,
  type PricingSettings,
} from "../src/lib/pricing-settings";
import { emptyItem } from "../src/lib/estimates";
import { rateLabels } from "../src/lib/designs";
import { pricingCases } from "./helpers/pricing-cases";

test("ADT pricing capture, effective defaults, first match and percentage rules", () => {
  for (const c of pricingCases())
    if (!("restore" in c)) capturePricingForm(c.input);
  const f = pricingForm(null);
  assert.equal(f.tar.equiposMargen, "20");
  assert.equal(f.ma.cocina, "100");
  assert.equal(f.comp.techo[5].precio, "");
  const captured = capturePricingForm({
    tar: { equiposMargen: "20.5" },
    ma: { techo: "33.3" },
    mk: { techo: "0" },
    comp: {
      techo: [
        { nombre: " Luz (FOCO) ", precio: "" },
        { nombre: "Segundo foco", precio: "123" },
      ],
    },
  });
  const e = effectivePricing(captured),
    rates = pricingComponentRates(e);
  assert.equal(captured.tarifas.equiposMargen, 0.205);
  assert.equal(e.markups.techo, 0);
  assert.equal(e.markups.canal, 33.3 / 100);
  assert.equal(
    e.componentes.techo.filter((r) => r.nombre.toLowerCase() === "luz (foco)")
      .length,
    1,
  );
  assert.equal(rates.foco, undefined);
  assert.deepEqual(e.catalogo, []);
  assert.equal(pricingForm(captured).tar.equiposMargen, "21");
  assert.equal(
    pricingForm(capturePricingForm({ ma: { techo: "-0.5" } })).ma.techo,
    "-1",
  );
});
test("source internal simulator applies area markup and explicit zero override without changing customer tariffs", () => {
  const f = pricingForm(null);
  const original = structuredClone(f.tar);
  const s = pricingSimulation(f, pricingSimulationDefaults);
  assert.equal(s.cost, 22615);
  assert.equal(s.sale, 43305);
  assert.equal(s.gain, 20690);
  assert.equal(s.margin, 48);
  f.mk.equipos = "0";
  assert.equal(
    pricingSimulation(f, pricingSimulationDefaults).rows.find(
      (r) => r.key === "equipos",
    )?.sale,
    6250,
  );
  assert.deepEqual(f.tar, original);
});
test("pricing database enforces roles, tenant isolation, revisions and restoration while preserving legacy commercial snapshots", async (t) => {
  const { db } = await fullDatabase(),
    owner = randomUUID(),
    foreign = randomUUID(),
    reader = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID();
  const as = async (id: string, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  };
  const saved = capturePricingForm(pricingForm(null));
  const save = (version: number, data: unknown = saved, company = a) =>
    db.query<{ id: string }>("select save_pricing_settings($1,$2,$3) id", [
      company,
      version,
      data === null ? null : JSON.stringify(data),
    ]);
  const row = async () =>
    (
      await db.query<{ settings: PricingSettings | null; version: number }>(
        "select * from pricing_settings where company_id=$1",
        [a],
      )
    ).rows[0];
  try {
    for (const id of [owner, foreign, reader])
      await db.query(
        "insert into auth.users values($1,'synthetic-pricing@example.test',now())",
        [id],
      );
    await as(owner);
    await db.query("select create_company($1,'Synthetic pricing A')", [a]);
    await as(foreign);
    await db.query("select create_company($1,'Synthetic pricing B')", [b]);
    await as(owner);
    await db.query("select save_price_book($1,0,$2)", [
      a,
      JSON.stringify(
        Object.fromEntries(Object.keys(rateLabels).map((k) => [k, "100"])),
      ),
    ]);
    await db.query("select save_customer($1,$2,0,$3)", [
      a,
      customer,
      JSON.stringify({ full_name: "Synthetic customer", status: "active" }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
      a,
      estimate,
      JSON.stringify({
        customer_id: customer,
        status: "PENDIENTE",
        estimate_date: "2026-10-02",
        discount: "0",
        taxes: "0",
        notes: "Synthetic",
        items: [{ ...emptyItem, name: "QA", unit_price: "100.10" }],
      }),
    ]);
    const invoice = (
      await db.query<{ id: string }>(
        "select approve_estimate($1,$2,1,'2026-10-02','Synthetic','Synthetic approval') id",
        [a, estimate],
      )
    ).rows[0].id;
    const protectedRows = async () => ({
      book: (
        await db.query("select * from price_books where company_id=$1", [a])
      ).rows,
      estimate: (
        await db.query("select * from estimates where id=$1", [estimate])
      ).rows,
      invoice: (await db.query("select * from invoices where id=$1", [invoice]))
        .rows,
    });
    const before = await protectedRows();
    const id = (await save(0)).rows[0].id;
    await t.test(
      "owner save preserves normalized data and rejects stale writes",
      async () => {
        assert.deepEqual((await row()).settings, saved);
        const first = await row();
        await assert.rejects(
          save(0),
          (e) =>
            typeof e === "object" &&
            e !== null &&
            "code" in e &&
            e.code === "PT409",
        );
        assert.deepEqual(await row(), first);
      },
    );
    await t.test("foreign, anonymous and read-only access", async () => {
      await as(foreign);
      assert.equal(
        (await db.query("select * from pricing_settings where id=$1", [id]))
          .rows.length,
        0,
      );
      await assert.rejects(save(1), /permission_denied/);
      await assert.rejects(
        db.query("select * from record_history($1,'pricing_settings',$2)", [
          a,
          id,
        ]),
        /permission_denied/,
      );
      await as("", "anon");
      await assert.rejects(save(1), /permission denied/);
      await as(owner);
      await db.exec("reset role");
      await db.query(
        "insert into memberships(company_id,user_id,email,role) values($1,$2,'synthetic-reader@example.test','member')",
        [a, reader],
      );
      await as(owner);
      await db.query("select set_member_access($1,$2,'member',true,$3)", [
        a,
        reader,
        JSON.stringify({ "adm-precios": ["read"] }),
      ]);
      await as(reader);
      assert.equal((await row()).version, 1);
      await assert.rejects(save(1), /permission_denied/);
      assert.equal(
        (
          await db.query(
            "select * from record_history($1,'pricing_settings',$2)",
            [a, id],
          )
        ).rows.length,
        1,
      );
      await as(owner);
    });
    await t.test("direct invalid payloads have no effects", async () => {
      const first = await row();
      for (const patch of [
        { unknown: "bad" },
        { tarifas: { evil: 1 } },
        { tarifas: { pergolaBlanco: "45" } },
        { margenArea: [] },
        { catalogo: [{ medida: "missing" }] },
        {
          componentes: {
            ...saved.componentes,
            techo: [{ ...saved.componentes.techo[0], nombre: "x".repeat(61) }],
          },
        },
        { capa2: { demanda: 1e13 } },
      ])
        await assert.rejects(
          save(1, { ...saved, ...patch }),
          /invalid_pricing_settings/,
        );
      await assert.rejects(
        db.query("update pricing_settings set version=99 where id=$1", [id]),
        /permission denied/,
      );
      assert.deepEqual(await row(), first);
    });
    await t.test(
      "save, restore and later save are audited without altering quotes, invoices or legacy rates",
      async () => {
        await save(1, {
          ...saved,
          tarifas: { ...saved.tarifas, pergolaBlanco: 99 },
        });
        await save(2, null);
        assert.equal((await row()).version, 3);
        assert.equal((await row()).settings, null);
        const history = (
          await db.query<{
            before_data: { settings: unknown };
            after_data: { settings: unknown };
          }>("select * from record_history($1,'pricing_settings',$2)", [a, id])
        ).rows;
        assert.equal(history.length, 3);
        assert.equal(history[0].after_data.settings, null);
        assert.equal(
          (history[0].before_data.settings as typeof saved).tarifas
            .pergolaBlanco,
          99,
        );
        await save(3, saved);
        assert.deepEqual(await protectedRows(), before);
      },
    );
  } finally {
    await db.close();
  }
});
