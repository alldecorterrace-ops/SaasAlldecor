import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { authStorageContract } from "../tests/helpers/auth-storage-contract";
import { syntheticManagerFixtures } from "../tests/helpers/synthetic-managers";
import { stagingBootstrap } from "./ops/staging-bootstrap";
import { inventoryPermissionsFromForm } from "../src/lib/inventory-permissions";

async function main() {
  const url = new URL(process.env.INVENTORY_TEST_DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/saas_inventory_test"
  )
    throw new Error(
      "Se requiere una base de inventario de prueba local y dedicada",
    );
  const pool = new Pool({
    connectionString: url.href,
    statement_timeout: 30000,
  });
  const a = id(),
    b = id(),
    ownerA = id(),
    ownerB = id(),
    receiver = id();
  const wh = id(),
    shop = id(),
    extra = id(),
    variant = id(),
    sku = "PER-01";
  const transaction = async <T>(
    run: (c: PoolClient) => Promise<T>,
    user?: string,
  ) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      if (user) {
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          user,
        ]);
        await c.query("set local role authenticated");
      }
      const value = await run(c);
      await c.query("commit");
      return value;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  const as = (user: string, sql: string, args: unknown[] = []) =>
    transaction(async (c) => (await c.query(sql, args)).rows, user);
  const seedLegacy = async (
    company: string,
    actor: string,
    code: string,
    loc: string,
    qty: string,
  ) => {
    const item = id();
    await as(actor, "select save_work_record($1,$2,0,'inventory',$3)", [
      company,
      item,
      {
        name: "Artículo de ensayo",
        status: "ACTIVO",
        data: {
          sku: code,
          location: loc,
          unit: "unidad",
          minimum: "0",
          unit_cost: "88.88",
        },
      },
    ]);
    if (qty !== "0")
      await as(actor, "select record_inventory_movement($1,$2,$3,1,$4)", [
        company,
        id(),
        item,
        {
          movement_date: "2026-11-02",
          quantity: qty,
          reason: "Entrada de ensayo",
        },
      ]);
    return item;
  };
  const legacyImage = async () =>
    (
      await pool.query(`
    select (select jsonb_agg(to_jsonb(w) order by company_id,id) from public.work_records w) items,
           (select jsonb_agg(to_jsonb(m) order by company_id,id) from public.inventory_movements m) movements,
           (select jsonb_agg(to_jsonb(e) order by id) from public.audit_events e) audit`)
    ).rows[0];

  try {
    assert.equal(
      (await pool.query("select to_regclass('public.companies') present"))
        .rows[0].present,
      null,
      "usar una base vacía",
    );
    await pool.query(authStorageContract);
    const dir = new URL("../supabase/migrations/", import.meta.url);
    const files = await Promise.all(
      (await readdir(dir))
        .filter((x) => x.endsWith(".sql"))
        .sort()
        .map(async (name) => ({
          name,
          sql: await readFile(new URL(name, dir), "utf8"),
        })),
    );
    const start = "202611020097";
    await pool.query(stagingBootstrap(files.filter((x) => x.name < start)));
    await pool.query(syntheticManagerFixtures);
    for (const user of [ownerA, ownerB, receiver])
      await pool.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [user, user + "@example.test"],
      );
    await as(ownerA, "select create_company($1,'Empresa de ensayo A')", [a]);
    await as(ownerB, "select create_company($1,'Empresa de ensayo B')", [b]);
    await as(ownerA, "select add_company_member($1,$2)", [
      a,
      receiver + "@example.test",
    ]);
    const itemA = await seedLegacy(a, ownerA, sku, "Central", "7");
    const needsMapping = await seedLegacy(a, ownerA, "OTRO", "Central", "3");
    const zero = await seedLegacy(a, ownerA, "YA-AGOTADO", "", "0");
    await seedLegacy(b, ownerB, sku, "Central", "12");
    const before = await legacyImage();
    for (const f of files.filter((x) => x.name >= start))
      await pool.query(f.sql);
    assert.deepEqual(
      await legacyImage(),
      before,
      "cantidades, historial y auditoría anteriores se conservaron íntegros",
    );
    console.log(
      "PASS actualización desde inventario con existencias e historial en dos empresas",
    );

    for (const cid of [a, b]) {
      // Reuse IDs deliberately: no join may rely on a UUID without its company.
      await pool.query(
        "insert into app_private.inventory_locations(company_id,id,kind,name) values($1,$2,'ALMACEN','Central')",
        [cid, wh],
      );
      const family = id();
      await pool.query(
        "insert into app_private.inventory_families(company_id,id,code,name,unit) values($1,$2,'P-1','Perfil','UNIDAD')",
        [cid, family],
      );
      await pool.query(
        "insert into app_private.inventory_variants(company_id,id,family_id,unit,sku,name) values($1,$2,$3,'UNIDAD',$4,'Perfil simple')",
        [cid, variant, family, sku],
      );
    }
    await pool.query(
      "insert into app_private.inventory_locations(company_id,id,kind,name) values($1,$2,'TIENDA','C en tral'),($1,$3,'ALMACEN','Norte')",
      [a, shop, extra],
    );
    await assert.rejects(
      pool.query(
        "insert into app_private.inventory_locations(company_id,kind,name) values($1,'ALMACEN',' CEN TRAL ')",
        [a],
      ),
      /unique/i,
    );
    let review = await as(
      ownerA,
      "select * from inventory_opening_review($1)",
      [a],
    );
    assert.equal(
      review.find((r) => r.item_id === itemA)?.review_status,
      "UBICACION_AMBIGUA",
    );
    assert.equal(review.find((r) => r.item_id === itemA)?.location_id, null);
    assert.equal(
      review.find((r) => r.item_id === zero)?.review_status,
      "SIN_SALDO",
    );
    assert.equal(
      review.find((r) => r.item_id === needsMapping)?.review_status,
      "REVISAR_VARIANTE",
    );
    await assert.rejects(
      as(ownerA, "select * from inventory_opening_manifest($1)", [a]),
      /inventory_opening_needs_review/,
    );
    await assert.rejects(
      as(ownerA, "select * from inventory_opening_review($1)", [b]),
      /permission_denied/,
    );
    await assert.rejects(
      as(ownerB, "select map_inventory_opening_item($1,$2,$3,$4)", [
        b,
        itemA,
        variant,
        wh,
      ]),
      /inventory_item_unavailable/,
    );
    for (const item of [itemA, needsMapping])
      await as(ownerA, "select map_inventory_opening_item($1,$2,$3,$4)", [
        a,
        item,
        variant,
        wh,
      ]);
    const manifest = (cid: string, user: string) =>
      as(user, "select * from inventory_opening_manifest($1)", [cid]);
    const expected = (cid: string, qty: string) => [
      {
        lot_id: cid,
        lot_kind: "ANTERIOR",
        variant_id: variant,
        location_id: wh,
        quantity: qty,
        unit_cost: null,
      },
    ];
    assert.deepEqual(await manifest(a, ownerA), expected(a, "10.000"));
    assert.deepEqual(await manifest(b, ownerB), expected(b, "12.000"));
    assert.deepEqual(await manifest(a, ownerA), expected(a, "10.000"));
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from app_private.inventory_levels",
        )
      ).rows[0].n,
      0,
    );
    assert.deepEqual(await legacyImage(), before);
    // Simulate inconsistent old data: refuse the complete opening, even for otherwise valid rows.
    await pool.query(
      "update public.work_records set stock=8 where company_id=$1 and id=$2",
      [a, itemA],
    );
    review = await as(ownerA, "select * from inventory_opening_review($1)", [
      a,
    ]);
    assert.equal(
      review.find((r) => r.item_id === itemA)?.review_status,
      "HISTORIAL_NO_CUADRA",
    );
    await assert.rejects(manifest(a, ownerA), /inventory_opening_needs_review/);
    const invalidItem = await seedLegacy(a, ownerA, "FRACCION", "Norte", "1.5");
    await as(ownerA, "select map_inventory_opening_item($1,$2,$3,$4)", [
      a,
      invalidItem,
      variant,
      extra,
    ]);
    assert.equal(
      (
        await as(
          ownerA,
          "select review_status from inventory_opening_review($1) where item_id=$2",
          [a, invalidItem],
        )
      )[0].review_status,
      "CANTIDAD_FRACCIONARIA",
    );
    await pool.query(
      "update public.work_records set stock=7,data=jsonb_set(data,'{location}',to_jsonb('Nuevo sitio'::text)) where company_id=$1 and id=$2",
      [a, itemA],
    );
    assert.equal(
      (
        await as(
          ownerA,
          "select review_status from inventory_opening_review($1) where item_id=$2",
          [a, itemA],
        )
      )[0].review_status,
      "MAPEO_DESACTUALIZADO",
    );
    await assert.rejects(manifest(a, ownerA), /inventory_opening_needs_review/);
    console.log(
      "PASS lote anterior único, costo pendiente, consolidación y bloqueo de saldos ambiguos, cambiados o descuadrados",
    );

    const supplier = id(),
      purchase = id(),
      line = id(),
      lot = id();
    const family = id(),
      color = id(),
      red = id(),
      redVariant = id();
    await pool.query(
      "insert into app_private.inventory_families(company_id,id,code,name,unit) values($1,$2,'COL-1','Pintura','LITRO')",
      [a, family],
    );
    await pool.query(
      "insert into app_private.inventory_attributes(company_id,id,name) values($1,$2,'Color')",
      [a, color],
    );
    await pool.query(
      "insert into app_private.inventory_attribute_options(company_id,id,attribute_id,name) values($1,$2,$3,'Rojo')",
      [a, red, color],
    );
    await pool.query(
      "insert into app_private.inventory_family_attributes(company_id,family_id,attribute_id) values($1,$2,$3)",
      [a, family, color],
    );
    const newVariant =
      "insert into app_private.inventory_variants(company_id,id,family_id,unit,sku,name,option_ids) values($1,$2,$3,'LITRO',$4,'Pintura roja',$5)";
    await assert.rejects(
      pool.query(newVariant, [a, redVariant, family, "PT-ROJ", [red]]),
      /inventory_variant_options_mismatch/,
    );
    await transaction(async (c) => {
      await c.query(newVariant, [a, redVariant, family, "PT-ROJ", [red]]);
      await c.query(
        "insert into app_private.inventory_variant_options(company_id,variant_id,family_id,attribute_id,option_id) values($1,$2,$3,$4,$5)",
        [a, redVariant, family, color, red],
      );
    });
    await assert.rejects(
      pool.query(newVariant, [a, id(), family, "OTRO-ROJ", [red]]),
      /unique/i,
    );
    await assert.rejects(
      pool.query(newVariant, [b, id(), family, "PT-ROJ", [red]]),
      /foreign key/i,
    );
    console.log(
      "PASS combinaciones de variantes únicas, coherentes y exclusivas de su empresa",
    );
    await pool.query(
      "insert into app_private.inventory_suppliers(company_id,id,name) values($1,$2,'Proveedor de ensayo')",
      [a, supplier],
    );
    const purchaseSql =
      "insert into app_private.inventory_documents(company_id,id,kind,request_id,request_payload,business_date,created_by,location_id,supplier_id,tax_usd) values($1,$2,'COMPRA',$3,'{}',date '2026-11-02',$4,$5,$6,6.00)";
    await assert.rejects(
      pool.query(purchaseSql, [a, id(), id(), ownerA, shop, supplier]),
      /inventory_active_warehouse_required/,
    );
    await assert.rejects(
      pool.query(purchaseSql, [b, id(), id(), ownerB, wh, supplier]),
      /inventory_active_supplier_required|foreign key/i,
    );
    await pool.query(purchaseSql, [a, purchase, id(), ownerA, wh, supplier]);
    await pool.query(
      "insert into app_private.inventory_document_lines(company_id,id,document_id,document_kind,variant_id,unit,quantity,unit_cost) values($1,$2,$3,'COMPRA',$4,'UNIDAD',10,10)",
      [a, line, purchase, variant],
    );
    await pool.query(
      "insert into app_private.inventory_lots(company_id,id,document_id,kind) values($1,$2,$3,'COMPRA')",
      [a, lot, purchase],
    );
    await pool.query(
      "insert into app_private.inventory_lot_items(company_id,lot_id,variant_id,unit_cost) values($1,$2,$3,10)",
      [a, lot, variant],
    );
    await assert.rejects(
      pool.query(
        "insert into app_private.inventory_levels(company_id,location_id,variant_id,unit,quantity) values($1,$2,$3,'UNIDAD',0.5)",
        [a, wh, variant],
      ),
      /check constraint/i,
    );
    await assert.rejects(
      pool.query(
        "insert into app_private.inventory_levels(company_id,location_id,variant_id,unit,quantity) values($1,$2,$3,'UNIDAD',10)",
        [a, wh, variant],
      ),
      /inventory_lot_balance_mismatch/,
    );
    const ledgerSql =
      "insert into app_private.inventory_ledger(company_id,line_id,document_kind,variant_id,location_id,unit,kind,quantity,balance,business_date,created_by) values($1,$2,'COMPRA',$3,$4,'UNIDAD','COMPRA',10,10,date '2026-11-02',$5) returning id";
    const ledgerArgs = [a, line, variant, wh, ownerA];
    await assert.rejects(
      pool.query(ledgerSql, ledgerArgs),
      /inventory_lot_parts_mismatch/,
    );
    const movement = await transaction(async (c) => {
      await c.query(
        "insert into app_private.inventory_levels(company_id,location_id,variant_id,unit,quantity) values($1,$2,$3,'UNIDAD',10)",
        [a, wh, variant],
      );
      await c.query(
        "insert into app_private.inventory_lot_levels(company_id,lot_id,location_id,variant_id,unit,quantity) values($1,$2,$3,$4,'UNIDAD',10)",
        [a, lot, wh, variant],
      );
      const m = (await c.query(ledgerSql, ledgerArgs)).rows[0].id;
      await c.query(
        "insert into app_private.inventory_ledger_parts(company_id,movement_id,variant_id,lot_id,unit,quantity,unit_cost) values($1,$2,$3,$4,'UNIDAD',10,10)",
        [a, m, variant, lot],
      );
      return m;
    });
    assert.equal(
      (
        await pool.query(
          "select (p.quantity*p.unit_cost)::numeric(16,2) value,d.tax_usd from app_private.inventory_ledger_parts p join app_private.inventory_documents d on d.company_id=p.company_id and d.id=$1 where p.company_id=$2 and p.movement_id=$3",
          [purchase, a, movement],
        )
      ).rows[0].value,
      "100.00",
    );
    assert.equal(
      (
        await pool.query(
          "select tax_usd from app_private.inventory_documents where company_id=$1 and id=$2",
          [a, purchase],
        )
      ).rows[0].tax_usd,
      "6.00",
    );
    await assert.rejects(
      pool.query(
        "update app_private.inventory_ledger_parts set unit_cost=12 where company_id=$1 and movement_id=$2",
        [a, movement],
      ),
      /immutable/,
    );
    await assert.rejects(
      pool.query(
        "insert into app_private.inventory_part_valuations(company_id,movement_id,lot_id,unit_cost,recorded_by) values($1,$2,$3,0,$4)",
        [a, movement, lot, ownerA],
      ),
      /already_valued/,
    );
    await assert.rejects(
      pool.query(
        "update app_private.inventory_documents set notes='cambio' where company_id=$1 and id=$2",
        [a, purchase],
      ),
      /immutable/,
    );
    await assert.rejects(
      pool.query(
        "update app_private.inventory_locations set active=false,deleted_at=now() where company_id=$1 and id=$2",
        [a, wh],
      ),
      /inventory_location_has_stock/,
    );
    await pool.query(
      "update app_private.inventory_locations set active=false,deleted_at=now() where company_id=$1 and id=$2",
      [a, extra],
    );
    await assert.rejects(
      pool.query(
        "insert into app_private.inventory_levels(company_id,location_id,variant_id,unit,quantity) values($1,$2,$3,'UNIDAD',1)",
        [a, extra, variant],
      ),
      /inventory_location_removed/,
    );
    console.log(
      "PASS compras solo en almacén, cantidades enteras, sumas de lotes al confirmar, impuesto separado e historial inmutable",
    );

    const amounts = "select * from inventory_location_stock($1,$2)";
    const costs = "select * from inventory_location_costs($1,$2)";
    const grant = "select set_inventory_location_access($1,$2,$3,$4)";
    await assert.rejects(
      as(receiver, grant, [a, receiver, wh, []]),
      /permission_denied/,
    );
    await as(ownerA, grant, [a, receiver, wh, ["purchases.create"]]);
    assert.deepEqual(await as(receiver, amounts, [a, wh]), [
      { variant_id: variant, quantity: "10.000" },
    ]);
    await assert.rejects(as(receiver, amounts, [a, shop]), /permission_denied/);
    await assert.rejects(as(receiver, amounts, [b, wh]), /permission_denied/);
    await assert.rejects(as(receiver, costs, [a, wh]), /permission_denied/);
    await assert.rejects(
      as(receiver, "select * from app_private.inventory_lot_items"),
      /permission denied/i,
    );
    await assert.rejects(
      as(receiver, "select * from app_private.inventory_audit"),
      /permission denied/i,
    );
    await assert.rejects(
      as(receiver, "select * from inventory_opening_manifest($1)", [a]),
      /permission_denied/,
    );
    await as(ownerA, "select set_member_access($1,$2,'member',true,$3)", [
      a,
      receiver,
      { "inv-costos": ["read"] },
    ]);
    assert.deepEqual(await as(receiver, costs, [a, wh]), [
      {
        variant_id: variant,
        lot_id: lot,
        quantity: "10.000",
        unit_cost: "10.0000",
      },
    ]);
    await assert.rejects(as(receiver, costs, [a, extra]), /permission_denied/);
    await as(ownerA, grant, [a, receiver, wh, null]);
    await assert.rejects(as(receiver, costs, [a, wh]), /permission_denied/);
    await as(ownerA, grant, [a, receiver, wh, []]);
    const invited = id();
    const form = new FormData();
    for (const key of [
      "read:inv-costos",
      "read:inv-catalogo",
      "read:inv-precios",
      "write:inventado",
    ])
      form.set(key, "on");
    await as(ownerA, "select invite_company_user($1,$2,$3,'member',$4)", [
      a,
      invited,
      "invited-inventory@example.test",
      inventoryPermissionsFromForm(form),
    ]);
    const invitation = await pool.query(
      "select permissions from public.company_invitations where company_id=$1 and id=$2",
      [a, invited],
    );
    assert.deepEqual(invitation.rows[0].permissions, {
      "inv-costos": ["read"],
      "inv-catalogo": ["read"],
    });
    await as(ownerA, "select set_member_access($1,$2,'member',false,$3)", [
      a,
      receiver,
      { "inv-costos": ["read"] },
    ]);
    await assert.rejects(as(receiver, amounts, [a, wh]), /permission_denied/);
    assert.deepEqual(
      (
        await pool.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='app_private' and c.relkind='r' and c.relname like 'inventory_%' and
      (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon',c.oid,'SELECT'))`)
      ).rows,
      [],
    );
    console.log(
      "PASS acceso por empresa y almacén, costos separados, revocación y cuenta suspendida",
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
