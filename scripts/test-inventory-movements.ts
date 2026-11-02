import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";

const url = new URL(process.env.INVENTORY_TEST_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/saas_inventory_test"
)
  throw new Error("Se requiere la base local de pruebas de inventario");
const pool = new Pool({
  connectionString: url.href,
  max: 10,
  statement_timeout: 15000,
});
const owner = id(),
  employee = id(),
  colleague = id(),
  outsider = id(),
  company = id(),
  other = id();
const store = id(),
  warehouse = id(),
  remote = id(),
  item = id(),
  spare = id(),
  family = id(),
  supplierA = id(),
  supplierB = id();
const date = "2026-11-02";
async function tx<T>(actor: string, run: (client: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      actor,
    ]);
    await c.query("set local role authenticated");
    const r = await run(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
const call = (actor: string, sql: string, args: unknown[] = []) =>
  tx(actor, async (c) => (await c.query(sql, args)).rows);
const postSql = "select inventory_post_document($1,$2,$3) id";
const post = async (body: object, req = id(), actor = owner) =>
  (await call(actor, postSql, [company, req, body]))[0].id as string;
const purchase = (
  variant: string,
  qty: number,
  cost: number | null,
  supplier = supplierA,
) => ({
  kind: "COMPRA",
  location: warehouse,
  supplier,
  date,
  lines: [{ variant, qty, cost }],
});
const transfer = (
  qty: number,
  lot?: string,
  variant = item,
  from = warehouse,
  to = store,
) => ({
  kind: "TRASLADO",
  location: from,
  destination: to,
  date,
  lines: [{ variant, qty, lots: lot ? [{ lot, qty }] : [] }],
});
const adjust = (
  loc: string,
  variant: string,
  qty: number,
  lot?: string,
  reason = "MERMA",
) => ({
  kind: "AJUSTE",
  location: loc,
  reason,
  notes: "Conteo de ensayo",
  date,
  lines: [{ variant, qty, lots: lot ? [{ lot, qty: Math.abs(qty) }] : [] }],
});
const lotOf = async (doc: string) =>
  (
    await pool.query(
      "select id from app_private.inventory_lots where company_id=$1 and document_id=$2",
      [company, doc],
    )
  ).rows[0].id as string;
const qty = async (lot: string, variant: string, loc: string) =>
  Number(
    (
      await pool.query(
        "select coalesce(sum(quantity),0) n from app_private.inventory_lot_levels where company_id=$1 and lot_id=$2 and variant_id=$3 and location_id=$4",
        [company, lot, variant, loc],
      )
    ).rows[0].n,
  );
const voidDoc = async (doc: string, request = id()) =>
  (
    await call(
      owner,
      "select inventory_void_document($1,$2,$3,'Corrección de ensayo') as id",
      [company, request, doc],
    )
  )[0].id;
const value = async (v: string) =>
  Number(
    (
      await pool.query(
        "select sum(s.quantity*i.unit_cost) value from app_private.inventory_lot_levels s join app_private.inventory_lot_items i using(company_id,lot_id,variant_id) where s.company_id=$1 and s.variant_id=$2",
        [company, v],
      )
    ).rows[0].value,
  );
const stockImage = async () =>
  (
    await pool.query(
      `select
 (select count(*) from app_private.inventory_documents where company_id=$1) docs,
 (select count(*) from app_private.inventory_ledger where company_id=$1) movements,
 (select count(*) from app_private.inventory_ledger_parts where company_id=$1) parts,
 (select jsonb_agg(to_jsonb(s) order by variant_id,location_id) from app_private.inventory_levels s where company_id=$1) stock,
 (select jsonb_agg(to_jsonb(s) order by lot_id,variant_id,location_id) from app_private.inventory_lot_levels s where company_id=$1) lots`,
      [company],
    )
  ).rows[0];
async function waitUntilBlocked(holder: number) {
  for (let i = 0; i < 100; i++) {
    const busy = await pool.query(
      "select exists(select from pg_stat_activity where $1=any(pg_blocking_pids(pid))) waiting",
      [holder],
    );
    if (busy.rows[0].waiting) return;
    await delay(25);
  }
  throw new Error("La segunda conexión no llegó a competir por el bloqueo");
}
async function main() {
  try {
    for (const u of [owner, employee, colleague, outsider])
      await pool.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [u, u + "@example.test"],
      );
    await call(owner, "select create_company($1,'Inventario en paralelo')", [
      company,
    ]);
    await call(
      outsider,
      "select create_company($1,'Otra empresa de inventario')",
      [other],
    );
    for (const u of [employee, colleague])
      await call(owner, "select add_company_member($1,$2)", [
        company,
        u + "@example.test",
      ]);
    await pool.query(
      "insert into app_private.inventory_locations(company_id,id,kind,name) values($1,$2,'ALMACEN','Almacén'),($1,$3,'TIENDA','Tienda'),($1,$4,'TIENDA','Otra tienda')",
      [company, warehouse, store, remote],
    );
    await pool.query(
      "insert into app_private.inventory_families(company_id,id,code,name,unit) values($1,$2,'T1','Material','UNIDAD')",
      [company, family],
    );
    for (const [v, code] of [
      [item, "SKU-A"],
      [spare, "SKU-B"],
    ]) {
      const fam = v === item ? family : id();
      if (v !== item)
        await pool.query(
          "insert into app_private.inventory_families(company_id,id,code,name,unit) values($1,$2,'T2','Otro material','UNIDAD')",
          [company, fam],
        );
      await pool.query(
        "insert into app_private.inventory_variants(company_id,id,family_id,unit,sku,name) values($1,$2,$3,'UNIDAD',$4,$4)",
        [company, v, fam, code],
      );
    }
    await pool.query(
      "insert into app_private.inventory_suppliers(company_id,id,name) values($1,$2,'Proveedor A'),($1,$3,'Proveedor B')",
      [company, supplierA, supplierB],
    );
    for (const u of [employee, colleague])
      for (const l of [warehouse, store])
        await call(owner, "select set_inventory_location_access($1,$2,$3,$4)", [
          company,
          u,
          l,
          ["purchases.create", "transfers.create", "adjustments.create"],
        ]);
    const old = id();
    await call(owner, "select save_work_record($1,$2,0,'inventory',$3)", [
      company,
      old,
      {
        name: "Saldo antiguo",
        status: "ACTIVO",
        data: {
          sku: "SKU-B",
          unit: "unidad",
          minimum: "0",
          unit_cost: "99",
          location: "Almacén",
        },
      },
    ]);
    await call(owner, "select record_inventory_movement($1,$2,$3,1,$4)", [
      company,
      id(),
      old,
      { movement_date: date, quantity: "2", reason: "Saldo previo" },
    ]);
    await assert.rejects(
      post(purchase(item, 1, 2)),
      /inventory_opening_required/,
    );
    const stamp = async () =>
      (
        await call(owner, "select inventory_opening_stamp($1) stamp", [company])
      )[0].stamp;
    const first = await stamp(),
      openingRequest = id();
    const opening = () =>
      call(owner, "select inventory_activate($1,$2,$3,$4) id", [
        company,
        openingRequest,
        date,
        first,
      ]);
    // Hold a real old-system write open while the owner attempts to switch.
    let pending!: Promise<unknown>;
    await tx(owner, async (c) => {
      await c.query("select record_inventory_movement($1,$2,$3,2,$4)", [
        company,
        id(),
        old,
        { movement_date: date, quantity: "3", reason: "Recepción en curso" },
      ]);
      pending = assert.rejects(opening(), /inventory_opening_changed/);
      await waitUntilBlocked(
        (await c.query("select pg_backend_pid() pid")).rows[0].pid,
      );
    });
    await pending;
    const fresh = await stamp();
    const open = async () =>
      (
        await call(owner, "select inventory_activate($1,$2,$3,$4) id", [
          company,
          openingRequest,
          date,
          fresh,
        ])
      )[0].id;
    assert.equal(await open(), await open());
    assert.equal(await qty(company, spare, warehouse), 5);
    await assert.rejects(
      call(owner, "select record_inventory_movement($1,$2,$3,3,$4)", [
        company,
        id(),
        old,
        { movement_date: date, quantity: "1", reason: "Intento anterior" },
      ]),
      /inventory_use_lot_ledger/,
    );
    console.log(
      "PASS apertura real, movimiento anterior en vuelo, confirmación obsoleta rechazada y cierre del camino anterior",
    );

    const r = id(),
      body = purchase(item, 100, 10);
    const pair = await Promise.all([post(body, r), post(body, r)]);
    assert.equal(pair[0], pair[1]);
    await assert.rejects(
      post({ ...body, notes: "otro contenido" }, r),
      /inventory_request_conflict/,
    );
    await assert.rejects(post(body, r, employee), /inventory_request_conflict/);
    const lotA = await lotOf(pair[0]),
      b = await post(purchase(item, 100, 12, supplierB)),
      lotB = await lotOf(b);
    assert.equal(await value(item), 2200);
    await assert.rejects(post(transfer(30)), /inventory_choose_lot/);
    const transferred = await post(transfer(30, lotA));
    assert.equal(await value(item), 2200);
    assert.equal(await qty(lotA, item, warehouse), 70);
    assert.equal(await qty(lotA, item, store), 30);
    const loss = await post(adjust(warehouse, item, -5, lotB));
    assert.equal(await value(item), 2140);
    assert.equal(
      Number(
        (
          await pool.query(
            `select sum(p.quantity*p.unit_cost) value from app_private.inventory_ledger_parts p join app_private.inventory_ledger m on (m.company_id,m.id)=(p.company_id,p.movement_id) join app_private.inventory_document_lines l on (l.company_id,l.id)=(m.company_id,m.line_id) where l.company_id=$1 and l.document_id=$2`,
            [company, loss],
          )
        ).rows[0].value,
      ),
      -60,
    );
    const before = await stockImage();
    await assert.rejects(voidDoc(b), /inventory_insufficient/);
    await assert.rejects(
      post({
        ...transfer(1, lotA),
        lines: [
          ...transfer(1, lotA).lines,
          { variant: spare, qty: 7, lots: [{ lot: company, qty: 7 }] },
        ],
      }),
      /inventory_insufficient/,
    );
    assert.deepEqual(await stockImage(), before);
    const voidKey = id();
    assert.equal(
      await voidDoc(transferred, voidKey),
      await voidDoc(transferred, voidKey),
    );
    await assert.rejects(voidDoc(transferred), /inventory_already_void/);
    assert.equal(await qty(lotA, item, warehouse), 100);
    assert.equal(await qty(lotA, item, store), 0);
    console.log(
      "PASS dos proveedores, traslado de valor neutro, pérdida de $60, reintento, anulación única y reversión completa si falla una línea",
    );

    const p = await post(purchase(item, 10, null), id(), employee),
      pendingLot = await lotOf(p);
    await post(adjust(warehouse, item, -4, pendingLot), id(), employee);
    const setCost = (
      n: number,
      reason: string | null,
      request = id(),
      actor = owner,
    ) =>
      call(actor, "select inventory_value_lot($1,$2,$3,$4,$5,$6)", [
        company,
        request,
        pendingLot,
        item,
        n,
        reason,
      ]);
    await assert.rejects(setCost(8, null, id(), employee), /permission_denied/);
    const key = id();
    await setCost(8, null, key);
    await setCost(8, null, key);
    await setCost(9, "Corrección del proveedor");
    assert.equal(await qty(pendingLot, item, warehouse), 6);
    const frozen = (
      await pool.query(
        "select sum(p.quantity*v.unit_cost) n from app_private.inventory_ledger_parts p join app_private.inventory_part_valuations v using(company_id,movement_id,lot_id) where p.company_id=$1 and p.lot_id=$2 and p.quantity<0",
        [company, pendingLot],
      )
    ).rows[0].n;
    assert.equal(Number(frozen), -32);
    const remaining = (
      await pool.query(
        "select s.quantity*i.unit_cost n from app_private.inventory_lot_levels s join app_private.inventory_lot_items i using(company_id,lot_id,variant_id) where s.company_id=$1 and s.lot_id=$2 and s.location_id=$3",
        [company, pendingLot, warehouse],
      )
    ).rows[0].n;
    assert.equal(Number(remaining), 54);
    await assert.rejects(
      post(purchase(item, 1, 0), id(), employee),
      /permission_denied/,
    );
    await assert.rejects(
      post(transfer(1, lotA, item, warehouse, remote), id(), employee),
      /permission_denied/,
    );
    await assert.rejects(
      call(outsider, postSql, [company, id(), purchase(item, 1, 1)]),
      /permission_denied/,
    );
    console.log(
      "PASS recepción sin costos, valoración pendiente, corrección prospectiva y permisos por empresa y ubicación",
    );

    const tiny = await lotOf(await post(purchase(item, 2, 0)));
    const req = adjust(warehouse, item, -2, tiny);
    let competing!: Promise<unknown>;
    await tx(owner, async (c) => {
      await c.query(postSql, [company, id(), req]);
      competing = assert.rejects(
        post(req, id(), colleague),
        /inventory_insufficient_lot/,
      );
      await waitUntilBlocked(
        (await c.query("select pg_backend_pid() pid")).rows[0].pid,
      );
    });
    await competing;
    assert.equal(await qty(tiny, item, warehouse), 0);
    // Opposite transfers contend for the same two locations in a stable order.
    await post(transfer(10, lotA));
    await Promise.all([
      post(transfer(2, lotA)),
      post(transfer(3, lotA, item, store, warehouse)),
    ]);
    assert.equal(
      (await qty(lotA, item, warehouse)) + (await qty(lotA, item, store)),
      100,
    );
    await assert.rejects(
      post(adjust(warehouse, item, 1, undefined, "INVENTARIO_INICIAL")),
      /inventory_initial_period_closed/,
    );
    await post(adjust(remote, spare, 3, undefined, "INVENTARIO_INICIAL"));
    await post(adjust(remote, spare, 1, undefined, "INVENTARIO_INICIAL"));
    const gaps = await pool.query(
      `select s.variant_id from app_private.inventory_levels s left join app_private.inventory_lot_levels t using(company_id,variant_id,location_id)
      where s.company_id=$1 group by s.variant_id,s.location_id,s.quantity having coalesce(sum(t.quantity),0)<>s.quantity or s.quantity<0`,
      [company],
    );
    assert.deepEqual(gaps.rows, []);
    console.log(
      "PASS carrera observada entre dos conexiones, últimos lotes sin negativos, traslados opuestos e inventario inicial",
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
