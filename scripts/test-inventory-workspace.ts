import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { Pool } from "pg";
import { PDFDocument } from "pdf-lib";
import { inventoryCountPdf } from "../src/lib/inventory-count-pdf";
const url = new URL(process.env.INVENTORY_TEST_DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/saas_inventory_test"
)
  throw new Error("Se requiere PostgreSQL local de ensayo");
const pool = new Pool({ connectionString: url.href, statement_timeout: 20000 });
const company = id(),
  owner = id(),
  seller = id(),
  buyer = id(),
  foreign = id(),
  other = id(),
  date = "2026-11-02";
async function query(user: string, sql: string, args: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await c.query("set local role authenticated");
    const rows = (await c.query(sql, args)).rows;
    await c.query("commit");
    return rows;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
const q = (sql: string, args: unknown[] = []) => query(owner, sql, args);
const master = async (kind: string, data: object) =>
  (
    await q("select inventory_save_master($1,$2,$3,null,0,$4) id", [
      company,
      id(),
      kind,
      data,
    ])
  )[0].id;
async function main() {
  try {
    for (const u of [owner, seller, buyer, foreign])
      await pool.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [u, u + "@example.test"],
      );
    await q("select create_company($1,'Catálogo de ensayo')", [company]);
    await query(foreign, "select create_company($1,'Empresa ajena')", [other]);
    for (const u of [seller, buyer])
      await q("select add_company_member($1,$2)", [
        company,
        u + "@example.test",
      ]);
    await q("select set_member_access($1,$2,'member',true,$3)", [
      company,
      seller,
      { "inv-catalogo": ["read"] },
    ]);
    await q("select set_member_access($1,$2,'member',true,$3)", [
      company,
      buyer,
      {
        "inv-catalogo": ["read"],
        "inv-proveedores": ["write"],
        "inv-costos": ["write"],
      },
    ]);
    const wh = await master("LOCATION", {
        name: "Almacén QA",
        kind: "ALMACEN",
      }),
      store = await master("LOCATION", { name: "Tienda QA", kind: "TIENDA" });
    const supplier = await master("SUPPLIER", {
      name: "Proveedor privado ensayo",
      email: "proveedor@example.test",
    });
    await q("select set_inventory_location_access($1,$2,$3,$4)", [
      company,
      seller,
      store,
      [],
    ]);
    await q("select set_inventory_location_access($1,$2,$3,$4)", [
      company,
      buyer,
      wh,
      ["purchases.create", "purchases.void"],
    ]);
    const famData = {
      name: "Pérgola física",
      unit: "UNIDAD",
      category: "Materiales",
      variants: [
        {
          options: { Acabado: "Níquel" },
          barcode: "BAR-PRUEBA-001",
          price: "30.00",
        },
        { options: { Acabado: "Negro" }, price: null },
      ],
    };
    const key = id(),
      family = (
        await q("select inventory_save_family($1,$2,null,0,$3) id", [
          company,
          key,
          famData,
        ])
      )[0].id;
    assert.equal(
      (
        await q("select inventory_save_family($1,$2,null,0,$3) id", [
          company,
          key,
          famData,
        ])
      )[0].id,
      family,
    );
    const catalog = (
      await q(
        "select * from inventory_master_rows($1,'FAMILY','BAR-PRUEBA-001')",
        [company],
      )
    )[0];
    assert.equal(catalog.id, family);
    assert.equal(catalog.data.variants.length, 2);
    const v = catalog.data.variants.find(
      (r: { barcode: string }) => r.barcode === "BAR-PRUEBA-001",
    );
    assert.equal(
      (
        await q(
          "select * from inventory_search_variants($1,'pergola fisica',$2,null)",
          [company, wh],
        )
      ).length,
      2,
    );
    assert.equal(
      (
        await q(
          "select * from inventory_search_variants($1,'BAR-PRUEBA-001',$2,null)",
          [company, wh],
        )
      )[0].id,
      v.id,
    );
    const basic = { name: "Base", unit: "KG", variants: [{ options: {} }] };
    await q("select inventory_save_family($1,$2,null,0,$3)", [
      company,
      id(),
      basic,
    ]);
    await assert.rejects(
      query(seller, "select inventory_save_family($1,$2,null,0,$3)", [
        company,
        id(),
        basic,
      ]),
      /permission_denied/,
    );
    const rev = await q("select * from inventory_opening_page($1,false,1)", [
      company,
    ]);
    const stamp = rev[0].inventory_opening_page.stamp;
    await q("select inventory_activate($1,$2,$3,$4)", [
      company,
      id(),
      date,
      stamp,
    ]);
    const post = async (data: object, actor = owner) =>
      (
        await query(actor, "select inventory_post_document($1,$2,$3) id", [
          company,
          id(),
          data,
        ])
      )[0].id;
    const purchase = await post(
      {
        kind: "COMPRA",
        location: wh,
        supplier,
        date,
        tax: "6",
        lines: [
          { variant: v.id, qty: "2", cost: "10" },
          { variant: v.id, qty: "8", cost: "10" },
        ],
      },
      buyer,
    );
    const read = (actor: string, s: string, arg: unknown[] = []) =>
      query(actor, s, [company, ...arg]);
    const doc = (
      await read(
        owner,
        "select * from inventory_document_rows($1,'COMPRA',$2)",
        [purchase],
      )
    )[0];
    assert.equal(doc.data.value, 100);
    assert.equal(doc.data.tax, 6);
    assert.equal(doc.data.lines.length, 1);
    assert.equal(doc.data.lines[0].qty, 10);
    const move = await post({
      kind: "TRASLADO",
      location: wh,
      destination: store,
      date,
      lines: [{ variant: v.id, qty: 3 }],
    });
    assert.equal(
      (
        await read(
          owner,
          "select * from inventory_document_rows($1,'TRASLADO',$2)",
          [move],
        )
      )[0].data.value,
      30,
    );
    assert.equal(
      (
        await read(
          owner,
          "select * from inventory_master_rows($1,'SUPPLIER','',$2)",
          [supplier],
        )
      )[0].data.total,
      100,
    );
    const stock = (
      await read(seller, "select * from inventory_stock_rows($1,'pergola')")
    )[0];
    assert.equal(stock.data.qty, 3);
    assert.deepEqual(
      Object.keys(stock.data.variants[0]).sort(),
      ["id", "name", "sku", "unit", "qty", "locations"].sort(),
    );
    const lots = (
      await read(seller, "select * from inventory_remaining_lots($1,$2)", [
        v.id,
      ])
    )[0];
    assert.equal(lots.quantity, "3.000");
    assert.deepEqual(
      Object.keys(lots.detail).sort(),
      ["location", "product", "sku", "date"].sort(),
    );
    assert.ok(lots.label.startsWith("Compra del"));
    const sellerHistory = await read(
      seller,
      "select * from inventory_history($1,$2)",
      [v.id],
    );
    assert.equal(sellerHistory.length, 1);
    assert.equal(sellerHistory[0].data.kind, "TRASLADO_ENTRADA");
    assert.ok(!("value" in sellerHistory[0].data));
    assert.ok(!("cost" in sellerHistory[0].data.lots[0]));
    assert.ok(!("document" in sellerHistory[0].data));
    await assert.rejects(
      read(seller, "select inventory_stock_total($1)"),
      /permission_denied/,
    );
    assert.equal(
      (await read(owner, "select inventory_stock_total($1) total"))[0].total
        .value,
      100,
    );
    assert.deepEqual(
      await read(
        seller,
        "select * from inventory_document_rows($1,'COMPRA',$2)",
        [purchase],
      ),
      [],
    );
    await assert.rejects(
      read(seller, "select * from inventory_master_rows($1,'SUPPLIER')"),
      /permission_denied/,
    );
    await assert.rejects(
      query(foreign, "select * from inventory_count_rows($1,'',$2)", [
        company,
        wh,
      ]),
      /permission_denied/,
    );
    const sheet = (
      await read(owner, "select inventory_count_sheet($1,'',$2,false) sheet", [
        store,
      ])
    )[0].sheet;
    assert.equal(sheet.rows.length, 1);
    assert.deepEqual(
      Object.keys(sheet.rows[0]).sort(),
      ["sku", "product", "location", "qty", "unit"].sort(),
    );
    const pdf = await inventoryCountPdf(
      "Empresa de prueba",
      "America/New_York",
      sheet,
    );
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
    const lot = doc.data.lotId;
    await q("select inventory_value_lot($1,$2,$3,$4,12,'Costo corregido')", [
      company,
      id(),
      lot,
      v.id,
    ]);
    await post({
      kind: "AJUSTE",
      location: store,
      date,
      reason: "MERMA",
      notes: "Conteo",
      lines: [{ variant: v.id, qty: -1 }],
    });
    const history = await read(
      owner,
      "select * from inventory_history($1,$2,$3)",
      [v.id, store],
    );
    assert.equal(history[0].data.value, -12);
    assert.equal(history[0].data.balanceValue, 24);
    assert.equal(history[1].data.balanceValue, 30);
    const returned = await post({
      kind: "TRASLADO",
      location: store,
      destination: wh,
      date,
      lines: [{ variant: v.id, qty: 1 }],
    });
    await q(
      "select inventory_value_lot($1,$2,$3,$4,13,'Corrección posterior al traslado')",
      [company, id(), lot, v.id],
    );
    await q("select inventory_void_document($1,$2,$3,'Retirar traslado')", [
      company,
      id(),
      returned,
    ]);
    const reversed = (
      await read(owner, "select * from inventory_history($1,$2,$3)", [
        v.id,
        store,
      ])
    )[0].data;
    assert.equal(
      reversed.value,
      12,
      "la anulación conserva el valor del traslado",
    );
    assert.equal(
      reversed.balanceValue,
      26,
      "las dos unidades que quedan tienen costo vigente de 13",
    );
    const otherVariant = catalog.data.variants.find(
      (x: { id: string }) => x.id !== v.id,
    ).id;
    const chargeDoc = await post({
      kind: "COMPRA",
      location: wh,
      supplier,
      date,
      tax: 6,
      lines: [
        { variant: v.id, qty: 2, cost: 10 },
        { variant: otherVariant, qty: 1, cost: 20 },
      ],
    });
    const preview = (
      await q("select inventory_charge_preview($1,$2,4) p", [
        company,
        chargeDoc,
      ])
    )[0].p;
    assert.deepEqual(
      preview.lines.map((x: { share: number }) => x.share),
      [2, 2],
    );
    const chargeRequest = id(),
      book = () =>
        q(
          "select inventory_add_purchase_charge($1,$2,$3,'FLETE',4,'Entrega proveedor',$4) id",
          [company, chargeRequest, chargeDoc, preview.stamp],
        );
    assert.equal((await book())[0].id, (await book())[0].id);
    const after = (
      await read(
        owner,
        "select * from inventory_document_rows($1,'COMPRA',$2)",
        [chargeDoc],
      )
    )[0].data;
    assert.equal(after.value, 44);
    assert.equal(after.tax, 6);
    assert.deepEqual(
      after.lines
        .map((x: { unitCost: number }) => x.unitCost)
        .sort((a: number, b: number) => a - b),
      [11, 22],
    );
    assert.equal(
      (
        await read(owner, "select * from inventory_purchase_charges($1,$2)", [
          chargeDoc,
        ])
      ).length,
      1,
    );
    await assert.rejects(
      read(seller, "select inventory_charge_preview($1,$2,4)", [chargeDoc]),
      /permission_denied/,
    );
    const pending = await post({
      kind: "COMPRA",
      location: wh,
      supplier,
      date,
      lines: [{ variant: v.id, qty: 1 }],
    });
    await assert.rejects(
      read(owner, "select inventory_charge_preview($1,$2,2)", [pending]),
      /inventory_charge_needs_base_costs/,
    );
    const bulk = await post({
      kind: "COMPRA",
      location: wh,
      supplier,
      date,
      lines: [{ variant: otherVariant, qty: 10000, cost: 1 }],
    });
    await assert.rejects(
      read(owner, "select inventory_charge_preview($1,$2,.01)", [bulk]),
      /inventory_charge_precision/,
    );
    await q("select inventory_set_minimum($1,$2,$3,'VARIANT',$4,4)", [
      company,
      id(),
      store,
      v.id,
    ]);
    await q("select inventory_set_minimum($1,$2,$3,'FAMILY',$4,2)", [
      company,
      id(),
      store,
      family,
    ]);
    const alerts = await read(
      seller,
      "select * from inventory_minimum_rows($1)",
    );
    assert.equal(alerts.length, 1);
    assert.equal(Number(alerts[0].quantity), 2);
    assert.equal(Number(alerts[0].minimum), 4);
    const losses = await read(
      owner,
      "select * from inventory_cost_report($1,'PERDIDAS','LOCATION',$2,$2,$3)",
      [date, store],
    );
    assert.equal(Number(losses[0].known_value), 12);
    assert.equal(
      Number(
        (
          await read(
            owner,
            "select * from inventory_cost_report($1,'VALOR','CATEGORY',null,null,$2)",
            [store],
          )
        )[0].known_value,
      ),
      26,
    );
    await assert.rejects(
      read(
        seller,
        "select * from inventory_cost_report($1,'PERDIDAS','LOCATION')",
      ),
      /permission_denied/,
    );
    console.log(
      "PASS anulación a costo original con saldo actual, reparto de flete, rechazo de redondeo inconciliable, mínimos e informes por ubicación",
    );
    console.log(
      "PASS catálogo con variantes, búsquedas por tildes y barras, compra consolidada, saldo valorizado y PDF físico sin importes",
    );
    console.log(
      "PASS vendedor sin costos ni proveedores, historial y stock por ubicación, otra empresa bloqueada",
    );
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
