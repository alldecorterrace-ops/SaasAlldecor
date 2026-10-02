import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyProduct, productSchema } from "../src/lib/commercial";
import { emptyItem, estimateItemSchema, lineCents } from "../src/lib/estimates";
import {
  normalizeProductDetails,
  productDetailsSummary,
  productImageAllowed,
} from "../src/lib/product-details";
import { productDetailsCases, png } from "./helpers/product-details-cases";

test("product summary preserves source fields, Unicode and descriptive dimensions without changing prices", () => {
  const d = normalizeProductDetails({
    description: "Peña & <pieza>",
    brand: "Marca",
    model: "M-1",
    material: "Aluminio",
    finish: "Blanco",
    dimensions: {
      length: "24",
      width: "6",
      height: "6",
      thickness: ".125",
      weight: "45",
      unit: "ft",
    },
    includes: "Tornillos",
    sku: "Not quoted",
    warranty: "Not quoted",
    images: [png, png],
  });
  assert.equal(
    productDetailsSummary(d),
    "Peña & <pieza> · Marca: Marca · Modelo: M-1 · Material: Aluminio · Acabado: Blanco · Largo: 24 ft · Ancho: 6 ft · Alto: 6 ft · Espesor: 0.125 ft · Incluye: Tornillos",
  );
  assert.equal(d.images.length, 1);
  const item = {
    ...emptyItem,
    name: "Artículo",
    description: productDetailsSummary(d),
    base: "unit" as const,
    unit_price: "100.10",
  };
  assert.equal(lineCents(estimateItemSchema.parse(item)), 10010n);
  assert.equal(item.length, "0");
  assert.equal(item.width, "0");
  assert.equal(item.height, "0");
  const legacy = productSchema.parse({
    ...emptyProduct,
    name: "Legacy fields",
    specs: [{ label: "Extra", unit: "", value: "V", legacyKey: "preserved" }],
    options: [
      {
        label: "Option",
        kind: "color",
        legacyKey: "preserved",
        choices: [
          {
            label: "White",
            add: "0",
            addType: "base",
            colorHex: "#ffffff",
            legacyKey: "preserved",
          },
        ],
      },
    ],
  });
  assert.equal(legacy.specs[0].legacyKey, "preserved");
  assert.equal(legacy.options[0].legacyKey, "preserved");
  assert.equal(legacy.options[0].choices[0].legacyKey, "preserved");
  assert.throws(() => normalizeProductDetails({ dimensions: { length: 0 } }));
  assert.equal(
    productImageAllowed("https://user:pass@example.test/p.png"),
    false,
  );
  assert.equal(productImageAllowed("data:image/png;base64,AAAA"), false);
});

test("product metadata RPC is additive, isolated, versioned and preserves quote snapshots across catalog edits", async (t) => {
  const { db } = await fullDatabase(),
    owner = randomUUID(),
    foreign = randomUUID(),
    staff = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    product = randomUUID(),
    customer = randomUUID(),
    estimate = randomUUID();
  const as = async (id: string, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  };
  const details = normalizeProductDetails({
    description: "A".repeat(2500),
    brand: "Peña",
    dimensions: { length: 24, unit: "ft" },
    images: [png],
  });
  const payload = {
    ...emptyProduct,
    name: "QA metadata",
    base: "unit",
    unit_price: "100.10",
    details,
    specs: [{ label: "Carga", value: "120", unit: "lb" }],
    options: [
      {
        kind: "color",
        label: "Colores",
        choices: [
          {
            label: "Blanco",
            add: "0.00",
            addType: "base",
            colorHex: "#ffffff",
          },
        ],
      },
    ],
  };
  const save = (version: number, data: unknown = payload, company = a) =>
    db.query("select save_product($1,$2,$3,$4)", [
      company,
      product,
      version,
      JSON.stringify(data),
    ]);
  const row = async () =>
    (
      await db.query<{
        details: typeof details;
        unit_price: string;
        version: number;
        specs: unknown;
        options: unknown;
      }>(
        "select details,unit_price,version,specs,options from products where company_id=$1 and id=$2",
        [a, product],
      )
    ).rows[0];
  try {
    for (const id of [owner, foreign, staff])
      await db.query(
        "insert into auth.users values($1,'synthetic-product@example.test',now())",
        [id],
      );
    await as(owner);
    await db.query("select create_company($1,'Synthetic A')", [a]);
    await as(foreign);
    await db.query("select create_company($1,'Synthetic B')", [b]);
    await as(owner);
    await save(0);
    await t.test(
      "DTO and direct SQL retain values, colors and current permissions",
      async () => {
        const dto = productSchema.parse(payload);
        assert.deepEqual(dto.details, details);
        assert.equal(dto.specs[0].value, "120");
        const saved = await row();
        assert.deepEqual(saved.details, details);
        assert.equal(saved.unit_price, "100.10");
        assert.deepEqual(saved.options, payload.options);
        await as(foreign);
        assert.equal(
          (await db.query("select * from products where id=$1", [product])).rows
            .length,
          0,
        );
        await assert.rejects(save(1), /permission_denied/);
        await as("", "anon");
        await assert.rejects(save(1), /permission denied/);
        await as(owner);
        await db.exec("reset role");
        await db.query(
          "insert into memberships(company_id,user_id,email,role) values($1,$2,'synthetic-staff@example.test','member')",
          [a, staff],
        );
        await as(owner);
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          a,
          staff,
          JSON.stringify({ productos: ["read"] }),
        ]);
        await as(staff);
        assert.equal((await row()).unit_price, "100.10");
        await assert.rejects(save(1), /permission_denied/);
        await as(owner);
      },
    );
    await t.test(
      "legacy edits omit metadata and preserve gallery, stale writers change nothing",
      async () => {
        const { details: _, ...legacy } = payload;
        void _;
        await save(1, { ...legacy, name: "Legacy edit" });
        assert.deepEqual((await row()).details, details);
        await assert.rejects(
          save(1, {
            ...payload,
            details: normalizeProductDetails({ brand: "stale" }),
          }),
          (e) =>
            typeof e === "object" &&
            e !== null &&
            "code" in e &&
            e.code === "PT409",
        );
        assert.equal((await row()).version, 2);
        assert.deepEqual((await row()).details, details);
      },
    );
    await t.test(
      "invalid direct metadata and structured options cannot mutate the product",
      async () => {
        for (const patch of [
          { details: { dimensions: { length: 0 } } },
          { details: { images: ["javascript:alert(1)"] } },
          { details: { images: ["data:image/png;base64,AAAA"] } },
          { details: { brand: "x".repeat(121) } },
          { details: { images: Array(7).fill(png) } },
          { specs: [{ label: "X", unit: "", value: [] }] },
          {
            options: [
              {
                label: "X",
                kind: "bad",
                choices: [{ label: "X", add: "0", addType: "base" }],
              },
            ],
          },
        ])
          await assert.rejects(save(2, { ...payload, ...patch }));
        assert.deepEqual((await row()).details, details);
        assert.equal((await row()).version, 2);
      },
    );
    await t.test(
      "summary survives saving, approval and a later catalog change without multiplying metadata",
      async () => {
        await db.query("select save_customer($1,$2,0,$3)", [
          a,
          customer,
          JSON.stringify({ full_name: "Synthetic only", status: "active" }),
        ]);
        const item = {
          ...emptyItem,
          product_id: product,
          name: payload.name,
          description: productDetailsSummary(details),
          base: "unit",
          unit_price: "100.10",
        };
        await db.query("select save_estimate($1,$2,0,$3)", [
          a,
          estimate,
          JSON.stringify({
            customer_id: customer,
            status: "PENDIENTE",
            estimate_date: "2026-10-02",
            valid_until: null,
            discount: "0",
            taxes: "0",
            tax_pct: "0",
            notes: "Synthetic only",
            items: [item],
          }),
        ]);
        const before = (
          await db.query<{
            items: { description: string; length: string }[];
            total: string;
          }>("select items,total from estimates where id=$1", [estimate])
        ).rows[0];
        assert.equal(before.total, "100.10");
        assert.equal(before.items[0].description, item.description);
        assert.equal(Number(before.items[0].length), 0);
        await save(2, {
          ...payload,
          unit_price: "300.10",
          details: normalizeProductDetails({
            brand: "Changed later",
            dimensions: { length: 999 },
          }),
        });
        assert.deepEqual(
          (
            await db.query("select items,total from estimates where id=$1", [
              estimate,
            ])
          ).rows[0],
          before,
        );
        const inv = (
          await db.query<{ id: string }>(
            "select approve_estimate($1,$2,1,'2026-10-02','Synthetic only','Synthetic approval') id",
            [a, estimate],
          )
        ).rows[0].id;
        const invoice = (
          await db.query<{ items: { description: string }[]; total: string }>(
            "select items,total from invoices where id=$1",
            [inv],
          )
        ).rows[0];
        assert.equal(invoice.total, "100.10");
        assert.equal(invoice.items[0].description, item.description);
      },
    );
    await t.test(
      "database and application agree on normal metadata and malicious gallery inputs",
      async () => {
        await db.exec("reset role");
        for (const c of productDetailsCases.filter(
          (c) => c.name !== "numeric scalar precision",
        )) {
          let normalized;
          try {
            normalized = normalizeProductDetails(c.input);
          } catch {}
          if (normalized)
            assert.deepEqual(
              (
                await db.query<{ d: unknown }>(
                  "select app_private.normalize_product_metadata($1) d",
                  [JSON.stringify(c.input)],
                )
              ).rows[0].d,
              normalized,
              c.name,
            );
          else
            await assert.rejects(
              db.query("select app_private.normalize_product_metadata($1)", [
                JSON.stringify(c.input),
              ]),
              c.name,
            );
        }
      },
    );
  } finally {
    await db.close();
  }
});
