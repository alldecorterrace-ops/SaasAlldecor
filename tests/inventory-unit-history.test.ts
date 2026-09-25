import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { workspaces } from "../src/lib/workspaces";

test("inventory retains the historical unit after the last movement is reversed", async () => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    company = randomUUID(),
    item = randomUUID();
  try {
    await db.query(
      "insert into auth.users values($1,'inventory-owner@saasalldecor.invalid',now())",
      [owner],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
    await db.query("select public.create_company($1,'Synthetic inventory')", [
      company,
    ]);
    const save = (
      version: number,
      unit: string,
      location = "Synthetic shelf",
    ) =>
      db.query("select public.save_work_record($1,$2,$3,'inventory',$4)", [
        company,
        item,
        version,
        JSON.stringify({
          name: "Synthetic profile",
          status: "ACTIVO",
          data: { ...workspaces.inventory.defaults, unit, location },
        }),
      ]);
    await save(0, "unidad");
    await save(1, "ft"); // No ledger exists: correcting the unit is still allowed.
    const entry = randomUUID();
    const movement = (id: string, version: number, data: object) =>
      db.query("select public.record_inventory_movement($1,$2,$3,$4,$5)", [
        company,
        id,
        item,
        version,
        JSON.stringify({
          movement_date: "2026-09-25",
          reason: "Synthetic movement",
          ...data,
        }),
      ]);
    await movement(entry, 2, { quantity: "10.125" });
    await movement(randomUUID(), 3, { reversal_of: entry });
    const records = () =>
      db.query<{ version: number; stock: string; data: Record<string, string> }>(
        "select version,stock,data from public.work_records where id=$1",
        [item],
      );
    const ledger = () =>
      db.query(
        "select * from public.inventory_movements where item_id=$1 order by id",
        [item],
      );
    const history = () =>
      db.query(
        "select * from public.audit_events where company_id=$1 order by id",
        [company],
      );
    const before = {
      record: (await records()).rows,
      ledger: (await ledger()).rows,
      history: (await history()).rows,
    };
    assert.equal(before.record[0].stock, "0.000");
    assert.equal(before.ledger.length, 2);
    for (let attempt = 0; attempt < 2; attempt++)
      await assert.rejects(save(4, "unidad"), /unit_locked/);
    assert.deepEqual((await records()).rows, before.record);
    assert.deepEqual((await ledger()).rows, before.ledger);
    assert.deepEqual((await history()).rows, before.history);
    await save(4, "ft", "Another synthetic shelf");
    const saved = (await records()).rows[0];
    assert.equal(saved.version, 5);
    assert.equal(saved.data.unit, "ft");
    assert.equal(
      saved.data.location,
      "Another synthetic shelf",
    );
    assert.deepEqual((await ledger()).rows, before.ledger);
    await assert.rejects(
      db.exec(
        'update public.work_records set data=data||\'{"unit":"unidad"}\'::jsonb',
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
