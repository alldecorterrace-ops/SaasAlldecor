import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { printedPages } from "./helpers/pdf-printed-pages";
import { renderCommercialPdf } from "../src/lib/commercial-pdf";
import { storedCommercialDocument } from "../src/lib/commercial-documents";

test("commercial PDF headings remain with saved content at page boundaries", async (t) => {
  const record = {
    number: "EST-2026-0009",
    version: 2,
    status: "PENDIENTE",
    customer_snapshot: {
      full_name: "QA-COMERCIAL-20261002",
      email: "qa-comercial-20261002@saasalldecor.invalid",
      phone: "+1 555 010 2300",
      address: "QA Dirección sintética, sin entrega",
      city: "QA Peña",
      postal_code: "33198",
    },
    estimate_date: "2026-10-02",
    valid_until: null,
    items: [
      {
        name: "QA-TAX-20261002 copia editada",
        description: "",
        qty: "3.125",
        base: "linear_ft",
        unit_price: "13.37",
        line_total: "219.35",
        length: "5.25",
        width: "0",
        height: "0",
      },
      {
        name: "QA-TAX-20261002 lineal Peña",
        description: "",
        qty: "3.125",
        base: "linear_ft",
        unit_price: "12.37",
        line_total: "202.95",
        length: "5.25",
        width: "0",
        height: "0",
      },
    ],
    subtotal: "422.30",
    discount: "33.33",
    taxes: "27.23",
    tax_pct: 7,
    total: "416.20",
    notes:
      "QA-TAX-20261002. Prueba sintética de impuesto 7% tras descuento y copia/orden; no enviar.",
    commercial_terms: {
      percentages: ["10.00", "50.00", "30.00", "10.00"],
      amounts: ["41.62", "208.10", "124.86", "41.62"],
      delivery_date: null as string | null,
      conditions: "",
    },
  };
  for (const scenario of ["notes", "conditions", "long content"]) {
    await t.test(scenario, async () => {
      const saved = structuredClone(record);
      if (scenario === "conditions") {
        saved.commercial_terms.conditions =
          "Entrega sintética según revisión guardada.\nSegunda condición con Peña y cifras $416.20.";
        saved.commercial_terms.delivery_date = "2026-10-24";
      }
      if (scenario === "long content") {
        saved.items = saved.items.map((item, i) => ({
          ...item,
          name: `Partida extensa ${i + 1}`,
          description: "Especificación guardada con acentos y cifras. ".repeat(
            12,
          ),
        }));
        saved.notes = "Nota guardada, multilínea, sin sustituciones.\n".repeat(
          40,
        );
      }
      const doc = storedCommercialDocument.parse({
        id: randomUUID(),
        company_id: randomUUID(),
        record_id: randomUUID(),
        customer_id: randomUUID(),
        kind: "estimate",
        record_version: 2,
        number: record.number,
        state: "pending",
        sha256: null,
        bytes: null,
        created_at: "2026-10-02T12:00:00Z",
        snapshot: {
          company: {
            name: "QA Mapa Presentacion 20260926",
            timezone: "America/New_York",
          },
          record: saved,
        },
      });
      const bytes = await renderCommercialPdf(doc, true),
        pages = await printedPages(bytes);
      const headings = [
        "Notas",
        "Condiciones particulares",
        "Calendario de pagos",
        ...saved.items.map((x, i) => `${i + 1}. ${x.name}`),
      ];
      for (const page of pages)
        for (let i = 0; i < page.length; i++)
          if (headings.includes(page[i].text)) {
            assert.ok(
              page[i + 1],
              `${page[i].text} must share a page with its saved body`,
            );
            assert.ok(
              page[i + 1].y < page[i].y,
              "Body follows heading without overlap",
            );
          }
      const allText = pages
        .flat()
        .map((x) => x.text)
        .join("\n");
      assert.match(allText, /Impuestos \(7%\): \$27.23/);
      assert.match(allText, /Total: \$416.20/);
      assert.match(allText, /Peña/);
      assert.deepEqual(
        await renderCommercialPdf(doc, true),
        bytes,
        "Rendering the same captured revision stays deterministic",
      );
      await mkdir(".local/closure-20261002", { recursive: true });
      await writeFile(
        `.local/closure-20261002/pagination-${scenario.replaceAll(" ", "-")}.pdf`,
        bytes,
      );
    });
  }
});
