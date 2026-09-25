import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManualPrint } from "../src/components/manual-print";

test("manual print retains long saved instructions and escapes document content", () => {
  const steps = Array.from(
    { length: 120 },
    (_, i) => `Paso ${i + 1}: comprobar ejemplo sintético.`,
  ).join("\n");
  const html = renderToStaticMarkup(
    createElement(ManualPrint, {
      record: {
        name: "Manual <QA>",
        status: "ARCHIVADO",
        version: 9,
        updated_at: "2026-09-25T15:00:00Z",
        data: {
          measurements: "10 x 12 ft",
          materials: "<script>alert(1)</script>",
          steps,
        },
      },
      companyName: "QA",
      timezone: "America/Chicago",
      projectName: "Proyecto vinculado",
      documents: ["Plano <QA>.pdf"],
    }),
  );
  assert.ok(html.includes(steps));
  assert.match(html, /Archivado · Revisión 9/);
  assert.match(html, /no está aprobada para fabricación/);
  assert.match(html, /Proyecto vinculado/);
  assert.match(html, /Plano &lt;QA&gt;\.pdf/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<(textarea|input|form|script)\b/);
});
