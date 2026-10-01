import { writeFileSync } from "node:fs";
import {
  compareReceipt,
  type ReceiptExtraction,
  type ReceiptReviewContext,
} from "../src/lib/receipt-review";
const project = "11111111-1111-4111-8111-111111111111";
const base: ReceiptExtraction = {
  es_recibo: true,
  legible: true,
  comercio: "QA Merchant",
  direccion_comercio: "Synthetic address",
  fecha: "2026-10-01",
  total: 100,
  subtotal: 90,
  impuesto: 10,
  moneda: "USD",
  numero_factura: "QA-123",
  metodo_pago: "cash",
  tarjeta_ult4: "",
};
const declaration: ReceiptReviewContext = {
  amount: 100,
  expense_date: "2026-10-01",
  project_id: project,
  pay_method: "propio",
  worked_projects: [{ id: project, name: "Synthetic project" }],
};
const cases: {
  name: string;
  data: ReceiptExtraction;
  context: ReceiptReviewContext;
  actual: ReturnType<typeof compareReceipt>;
}[] = [];
function add(
  name: string,
  data: Partial<ReceiptExtraction> = {},
  context: Partial<ReceiptReviewContext> = {},
) {
  const d = { ...base, ...data },
    c = { ...declaration, ...context };
  cases.push({ name, data: d, context: c, actual: compareReceipt(d, c) });
}
add("all data match");
for (const total of [null, 98.99, 99, 100, 101, 101.01, 0, -100])
  add("100 total " + total, { total });
for (const total of [989.99, 990, 1000, 1010, 1010.01])
  add("1000 total " + total, { total }, { amount: 1000 });
for (const total of [19799.99, 19800, 20000, 20200, 20200.01])
  add("20000 total " + total, { total }, { amount: 20000 });
for (const total of [1.005, 20.005, 120.225, -1.005, -120.225])
  add("rounding " + total, { total, subtotal: total, impuesto: total });
add("not receipt", { es_recibo: false });
add("not legible", { legible: false });
add("invalid date", { fecha: "2026-02-31" });
add("date absent", { fecha: "" });
add("date differs", { fecha: "2026-09-30" });
add("merchant absent", { comercio: " " });
add("invoice absent", { numero_factura: "" });
add("card last4 absent", { metodo_pago: "credit card" });
add("card last4 present", {
  metodo_pago: "credit card",
  tarjeta_ult4: "**** 1234",
});
add("card number only last4", {
  metodo_pago: "tarjeta",
  tarjeta_ult4: "0000 0000 0000 1234",
});
add(
  "cash payer card receipt",
  { metodo_pago: "debit card", tarjeta_ult4: "1234" },
  { pay_method: "efectivo_empresa" },
);
add(
  "card payer cash receipt",
  { metodo_pago: "EFECTIVO" },
  { pay_method: "empresa" },
);
add(
  "unknown legacy payer",
  { metodo_pago: "card", tarjeta_ult4: "1234" },
  { pay_method: null },
);
add("no workday", {}, { worked_projects: [] });
add(
  "different workday project",
  {},
  {
    worked_projects: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Other synthetic project",
      },
    ],
  },
);
add("bad image no workday", { es_recibo: false }, { worked_projects: [] });
add(
  "several workday projects",
  {},
  {
    worked_projects: [
      ...declaration.worked_projects,
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Other synthetic project",
      },
    ],
  },
);
add("currency absent", { moneda: "" });
add("currency sanitization", { moneda: "u.s.d." });
add("currency has no verdict rule", {
  moneda: "EUR",
  subtotal: 1,
  impuesto: 1,
});
add("short invoice no fingerprint", { numero_factura: "12" });
add("fingerprint punctuation", {
  comercio: "  qa-merchant  ",
  numero_factura: "qa 123",
});
add("unicode", {
  comercio: "Peña QA",
  direccion_comercio: "Calle Ñ, Miami",
  numero_factura: "Peña-123",
});
writeFileSync(".local/receipt-reference-input.json", JSON.stringify(cases));
console.log(
  "Prepared independent PHP comparison for " +
    cases.length +
    " synthetic cases.",
);
