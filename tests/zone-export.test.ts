import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exportCommercialZones,
  type ZoneExportClient,
} from "../src/lib/zone-export";
import { analyzeAdtZones, zonesCsv } from "../src/lib/zone-analysis";
import { zoneTableMoney, zoneTableTicket } from "../src/lib/zone-presentation";
import input from "./fixtures/zone-parity-input.json";

const company = "d2c95582-757c-4233-a742-d29cbd98f824";
const client = (changes: Partial<ZoneExportClient> = {}): ZoneExportClient => ({
  auth: {
    getUser: async () => ({ data: { user: { id: "synthetic" } }, error: null }),
  },
  rpc: async () => ({ data: input[1].source, error: null }),
  ...changes,
});
test("map table matches ADT whole-dollar display without rounding report or CSV", () => {
  assert.equal(zoneTableMoney(100.25), "$100");
  assert.equal(zoneTableMoney(1234.5), "$1,235");
  assert.equal(zoneTableMoney(-1.5), "$-2");
  assert.equal(zoneTableMoney(0), "$0");
  assert.equal(zoneTableTicket(50.13), "$50");
  assert.equal(zoneTableTicket(0), "-");
  assert.equal(zoneTableTicket(-1), "-");
  const report = analyzeAdtZones(input[1].source);
  const before = JSON.stringify(report),
    csv = zonesCsv(report);
  report.zonas.forEach((z) => {
    zoneTableMoney(z.ingresos);
    zoneTableTicket(z.ticket);
  });
  assert.equal(JSON.stringify(report), before);
  assert.equal(zonesCsv(report), csv);
  assert.ok(csv.includes('"380.4","190.2"'));
});
test("CSV response preserves exact UTF-8 bytes, fractions and download protections", async () => {
  const source = structuredClone(input[1].source);
  source.customers[0].city = 'Peña, "Árbol"';
  const response = await exportCommercialZones(company, async () =>
    client({
      rpc: async (name, args) => {
        assert.equal(name, "commercial_zone_source");
        assert.deepEqual(args, { p_company: company });
        return { data: source, error: null };
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(
    response.headers.get("Content-Disposition"),
    'attachment; filename="zonas-saas.csv"',
  );
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Content-Security-Policy"), "sandbox");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual(
    bytes,
    new TextEncoder().encode(zonesCsv(analyzeAdtZones(source))),
  );
  assert.ok(
    new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .includes('"Peña, ""Árbol"""'),
  );
});
test("CSV validates identity before querying and never exposes failures as downloads", async () => {
  let connects = 0,
    reads = 0;
  const connect = async () => {
    connects++;
    return client({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      rpc: async () => {
        reads++;
        throw new Error("must not read");
      },
    });
  };
  assert.equal((await exportCommercialZones("bad-id", connect)).status, 404);
  assert.equal(connects, 0);
  assert.equal((await exportCommercialZones(company, connect)).status, 401);
  assert.equal(reads, 0);
  for (const [code, status] of [
    ["42501", 403],
    ["XX000", 503],
  ] as const) {
    const response = await exportCommercialZones(company, async () =>
      client({ rpc: async () => ({ data: null, error: { code } }) }),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Content-Disposition"), null);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), {
      error: "Exportación no disponible.",
    });
  }
  const malformed = structuredClone(input[1].source);
  malformed.invoices[0].paid_amount = "broken";
  for (const data of [null, malformed])
    assert.equal(
      (
        await exportCommercialZones(company, async () =>
          client({ rpc: async () => ({ data, error: null }) }),
        )
      ).status,
      503,
    );
  assert.equal(
    (
      await exportCommercialZones(company, async () => {
        throw new Error("private connection details");
      })
    ).status,
    503,
  );
});
