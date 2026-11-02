import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  normalizeVariantPrice,
  productAxes,
  variantCombinations,
  type ProductAxis,
} from "../src/lib/inventory-variants";
import type { Master } from "../src/lib/inventory";

test("the shared sale price accepts cents and zero within the inventory money range", () => {
  for (const [entry, price] of [
    ["2200", "2200.00"],
    ["2200,5", "2200.50"],
    ["0", "0.00"],
    [".05", "0.05"],
    ["999999999999.99", "999999999999.99"],
  ])
    assert.equal(normalizeVariantPrice(entry), price);
  for (const entry of [
    "",
    " ",
    "-1",
    "1.234",
    "1,234.00",
    "1e3",
    "1000000000000",
    "NaN",
  ])
    assert.equal(normalizeVariantPrice(entry), null);
});

test("reordering saved characteristics preserves variant identities, excluded combinations and company isolation", async () => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    company = randomUUID(),
    other = randomUUID();
  const color = { name: "Color", values: ["Negro", "Rojo"] };
  const size = { name: "Talla", values: ["M", "S"] };
  try {
    await db.query(
      "insert into auth.users values($1,'axes@example.invalid',now())",
      [owner],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
    await db.query(
      "select public.create_company($1,'Características de prueba')",
      [company],
    );
    const save = async (
      request: string,
      id: string | null,
      version: number,
      data: object,
    ) =>
      (
        await db.query<{ id: string }>(
          "select public.inventory_save_family($1,$2,$3,$4,$5::jsonb) id",
          [company, request, id, version, JSON.stringify(data)],
        )
      ).rows[0].id;
    const read = async (id: string) =>
      (
        await db.query<Master>(
          "select * from public.inventory_master_rows($1,'FAMILY','',$2)",
          [company, id],
        )
      ).rows[0];
    const first = {
      name: "Perfil",
      unit: "UNIDAD",
      attributeLayout: [color, size],
      variants: [
        {
          options: { Color: "Negro", Talla: "M" },
          price: "19.50",
          barcode: "NEG-M",
        },
        {
          options: { Color: "Rojo", Talla: "S" },
          price: "21.75",
          barcode: "ROJ-S",
        },
      ],
    };
    const firstRequest = randomUUID(),
      id = await save(firstRequest, null, 0, first);
    const original = (await read(id)).data.variants!;
    const identity = (v: (typeof original)[number]) => [
      v.id,
      v.sku,
      v.barcode,
      Number(v.price),
      v.options,
    ];
    const reordered = {
      ...first,
      attributeLayout: [size, color],
      variants: original.map((v) => ({
        id: v.id,
        options: v.options,
        barcode: v.barcode,
        price: v.price,
      })),
    };
    const edit = randomUUID();
    assert.equal(await save(edit, id, 1, reordered), id);
    assert.equal(await save(firstRequest, null, 0, first), id);
    const current = (await read(id)).data;
    assert.deepEqual(current.attributeLayout, [size, color]);
    assert.deepEqual(current.variants!.map(identity), original.map(identity));
    assert.ok(
      current.variants!.every(
        (v) =>
          v.name === "Perfil · " + v.options.Talla + " · " + v.options.Color,
      ),
    );
    const axes = productAxes(current.variants!, current.attributeLayout!);
    assert.deepEqual(axes, [size, color]);
    assert.equal(variantCombinations(axes).count, 4);
    assert.equal(current.variants!.length, 2);
    for (const invalid of [
      [size, { ...color, values: ["Negro", "N e g r o"] }],
      [size],
      [size, { ...color, values: ["Verde"] }],
    ]) {
      await assert.rejects(
        save(randomUUID(), id, 2, { ...reordered, attributeLayout: invalid }),
        /inventory_invalid_options/,
      );
    }
    assert.equal((await read(id)).data.version, 2);
    // Older callers do not send layout metadata, including products created before the new editor.
    const legacy = { ...reordered } as { attributeLayout?: ProductAxis[] };
    delete legacy.attributeLayout;
    await save(randomUUID(), id, 2, legacy);
    assert.deepEqual((await read(id)).data.attributeLayout, [size, color]);
    await assert.rejects(
      db.query(
        "select * from public.inventory_master_rows($1,'FAMILY','',$2)",
        [other, id],
      ),
      /permission_denied/,
    );
  } finally {
    await db.close();
  }
});
