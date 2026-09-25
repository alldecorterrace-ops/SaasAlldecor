import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import input from "./fixtures/zone-parity-input.json";
import reference from "./fixtures/zone-parity-reference.json";
import {
  adtPostalCode,
  adtServiceArea,
  analyzeAdtZones,
  visibleZonePoints,
  zonesCsv,
  type ZoneSource,
} from "../src/lib/zone-analysis";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
// Reference hashes were obtained by executing the current ADT PHP methods with
// in-memory database doubles and these synthetic fixtures, without Drupal boot.
// They are not generated from the TypeScript implementation under test.
for (const fixture of input) {
  test(`ADT zone parity: ${fixture.name}`, () => {
    const expected = reference.cases.find((c) => c.name === fixture.name);
    assert.ok(expected);
    const source: ZoneSource = fixture.source;
    const before = JSON.stringify(source);
    const report = analyzeAdtZones(source);
    assert.deepEqual(report.resumen, expected.summary);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(canonical(report)))
      .digest("hex");
    assert.equal(
      fingerprint,
      expected.sha256,
      "Full report differs from ADT PHP reference",
    );
    assert.equal(
      JSON.stringify(source),
      before,
      "Calculation must not change source records",
    );
  });
}

test("ADT ZIP extraction and Florida prefixes retain the original edge cases", () => {
  assert.equal(adtPostalCode(" FL 33101-1234 "), "33101");
  assert.equal(adtPostalCode("331011111"), "33101");
  assert.equal(adtPostalCode("12345 Sample St, FL 33101"), "12345");
  assert.equal(adtPostalCode("No location"), "");
  assert.equal(adtServiceArea("34001"), true);
  assert.equal(adtServiceArea("90210"), false);
  assert.equal(adtServiceArea(""), false);
});

test("map layers only filter points; totals and CSV remain unchanged", () => {
  const report = analyzeAdtZones(input[1].source);
  const before = JSON.stringify(report);
  const csv = zonesCsv(report);
  const categories = ["lead", "estimado", "activo", "terminado"] as const;
  assert.ok(
    visibleZonePoints(report, [...categories], true).length >
      visibleZonePoints(report, [...categories]).length,
  );
  assert.ok(
    visibleZonePoints(report, ["lead"]).every(
      (p) => p.t === "lead" && p.f === 0,
    ),
  );
  assert.deepEqual(visibleZonePoints(report, []), []);
  assert.equal(zonesCsv(report), csv);
  assert.equal(JSON.stringify(report), before);
});

test("customers sharing contact details remain separate and void invoices contribute nothing", () => {
  const report = analyzeAdtZones(input[1].source);
  const zip = report.zonas.find((z) => z.zip === "33101")!;
  assert.equal(zip.activo, 1);
  assert.equal(zip.terminado, 1);
  assert.equal(zip.estimado, 2);
  assert.equal(zip.lead, 1);
  assert.equal(zip.ingresos, 380.4);
  assert.equal(zip.cerrados, 2);
  assert.equal(zip.cierre, 40);
  assert.equal(zip.ticket, 190.2);
});

test("CSV retains columns and safely quotes spreadsheet formulas without changing calculations", () => {
  const report = analyzeAdtZones(input[1].source);
  report.zonas[0].ciudad = '  =HYPERLINK("https://example.invalid")';
  const csv = zonesCsv(report);
  assert.ok(csv.includes('"\'  =HYPERLINK(""https://example.invalid"")"'));
  assert.ok(
    csv.startsWith(
      '"Codigo postal","Ciudad","Leads","Estimados","Activos","Terminados","Contactos","Cerrados","Cierre %","Ingresos","Ticket promedio"',
    ),
  );
});

test("malformed monetary input fails instead of turning an unavailable figure into zero", () => {
  const source = structuredClone(input[1].source);
  source.invoices[0].paid_amount = "not an amount";
  assert.throws(() => analyzeAdtZones(source), /Invalid zone source amount/);
});
