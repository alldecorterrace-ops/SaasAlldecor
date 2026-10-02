import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { catalogEstimateItem } from "../src/lib/estimates";
import { priceBases } from "../src/lib/commercial";
const require = createRequire(import.meta.url);
test("catalog insertion matches the current ADT non-configurator editor: base price and zero measures, independent of stored variants", async () => {
  const path = new URL(
    "./reference/catalog-estimate-source.cjs",
    import.meta.url,
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    "b56ec22b7695b8f123c156a363d286b29537f24f5483894c912a4374b47b0ec3",
  );
  const reference = require(path.pathname.replace(/^\/([A-Z]:\/)/, "$1"));
  for (const base of Object.keys(priceBases))
    for (const addType of ["base", "flat", "percent"]) {
      const p = {
        id: "10000000-0000-4000-8000-000000000001",
        name: "QA catalog",
        base,
        unit_price: "100.10",
        unitPrice: "100.10",
        description: "Descriptive length: 24 ft",
        options: [
          {
            label: "QA option",
            choices: [{ label: "QA expensive", add: 900, addType }],
          },
        ],
        details: { dimensions: { length: 24, width: 6, height: 6 } },
      };
      const actual = catalogEstimateItem(p),
        source = reference(p);
      assert.equal(actual.product_id, source.product_external_id);
      assert.equal(actual.name, source.name);
      assert.equal(actual.base, source.base);
      assert.equal(Number(actual.unit_price), source.unit_price);
      assert.equal(Number(actual.qty), source.qty);
      assert.equal(Number(actual.length), source.largo);
      assert.equal(Number(actual.width), source.ancho);
      assert.equal(Number(actual.height), source.alto);
      assert.equal(Number(actual.manual_total), source.line_total);
      assert.equal(actual.description, p.description);
    }
});
