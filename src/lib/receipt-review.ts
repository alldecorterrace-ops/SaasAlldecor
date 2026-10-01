import { createHash } from "node:crypto";
import { z } from "zod";

// Extract independently: the declaration is never sent to the model.
export const receiptPromptVersion = "receipt-v4";
export const receiptExtractionSchema = z.strictObject({
  es_recibo: z.boolean(),
  legible: z.boolean(),
  comercio: z.string().max(4000),
  direccion_comercio: z.string().max(4000),
  fecha: z.string().max(100),
  total: z.number().finite().nullable(),
  subtotal: z.number().finite().nullable(),
  impuesto: z.number().finite().nullable(),
  moneda: z.string().max(100),
  numero_factura: z.string().max(4000),
  metodo_pago: z.string().max(4000),
  tarjeta_ult4: z.string().max(100),
});
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;
export const receiptReviewContextSchema = z.object({
  amount: z.number().finite(),
  expense_date: z.iso.date(),
  project_id: z.uuid(),
  pay_method: z.enum(["propio", "empresa", "efectivo_empresa"]).nullable(),
  worked_projects: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type ReceiptReviewContext = z.infer<typeof receiptReviewContextSchema>;

// Match ADT's byte limits without splitting a UTF-8 character.
function text(value: string, bytes: number) {
  let result = "";
  for (const char of value.trim()) {
    if (Buffer.byteLength(result + char, "utf8") > bytes) break;
    result += char;
  }
  return result;
}
function amount(value: number | null) {
  if (value === null) return null;
  return (
    (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100)) /
    100
  );
}
export function receiptInvoiceFingerprint(merchant: string, invoice: string) {
  const m = merchant
    .replace(/[a-z]/g, (c) => c.toUpperCase())
    .replace(/[^A-Z0-9]+/g, "");
  const i = invoice
    .replace(/[a-z]/g, (c) => c.toUpperCase())
    .replace(/[^A-Z0-9]+/g, "");
  return m.length >= 3 && i.length >= 3
    ? createHash("sha256")
        .update(m + "|" + i)
        .digest("hex")
    : "";
}
export function compareReceipt(
  input: ReceiptExtraction,
  declared: ReceiptReviewContext,
) {
  const data = receiptExtractionSchema.parse(input);
  const context = receiptReviewContextSchema.parse(declared);
  const merchant = text(data.comercio, 140),
    address = text(data.direccion_comercio, 255);
  const date = z.iso.date().safeParse(data.fecha.trim()).success
    ? data.fecha.trim()
    : "";
  const total = amount(data.total),
    subtotal = amount(data.subtotal),
    tax = amount(data.impuesto);
  let currency = data.moneda.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (currency.length !== 3) currency = "";
  const invoice = text(data.numero_factura, 100),
    method = text(data.metodo_pago, 40);
  const digits = data.tarjeta_ult4.replace(/[^0-9]/g, ""),
    last4 = digits.length >= 4 ? digits.slice(-4) : "";
  const value = amount(context.amount)!;
  let state: "OK" | "DUDA" | "MAL" = "OK";
  const reasons: string[] = [];
  const number = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (!data.es_recibo) {
    state = "MAL";
    reasons.push("La imagen no parece ser un recibo.");
  } else if (!data.legible) {
    state = "MAL";
    reasons.push("El recibo no es suficientemente legible.");
  } else {
    if (total === null) {
      state = "DUDA";
      reasons.push("No se pudo leer el total.");
    }
    // Integer cents avoid noise at the exact tolerance boundary.
    else if (
      Math.abs(Math.round(total * 100) - Math.round(value * 100)) >
      Math.max(100, Math.abs(Math.round(value * 100)) / 100)
    ) {
      state = "DUDA";
      reasons.push(
        "Monto declarado $" +
          number(value) +
          "; recibo $" +
          number(total) +
          ".",
      );
    }
    if (!date) {
      state = "DUDA";
      reasons.push("No se pudo leer la fecha.");
    } else if (date !== context.expense_date) {
      state = "DUDA";
      reasons.push(
        "Fecha declarada " + context.expense_date + "; recibo " + date + ".",
      );
    }
    if (!merchant) {
      state = "DUDA";
      reasons.push("No se pudo identificar el proveedor.");
    }
    if (!invoice) {
      state = "DUDA";
      reasons.push(
        "No se pudo leer un numero de factura, recibo o transaccion.",
      );
    }
    const card = /tarjet|card|credit|debit/.test(method.toLowerCase()),
      cash = /efect|cash/.test(method.toLowerCase());
    if (!last4 && card) {
      state = "DUDA";
      reasons.push(
        "La compra parece ser con tarjeta, pero no se pudieron leer los ultimos 4 digitos.",
      );
    }
    if (
      (context.pay_method === "efectivo_empresa" && card) ||
      (context.pay_method === "empresa" && cash)
    ) {
      state = "DUDA";
      reasons.push(
        "El metodo de pago elegido no coincide con lo que muestra el recibo.",
      );
    }
  }
  const projectDate = date || context.expense_date;
  const expected = text(
    context.worked_projects.map((p) => p.name || p.id).join(", "),
    500,
  );
  const match = context.worked_projects.some(
    (p) => p.id === context.project_id,
  );
  if (!context.worked_projects.length) {
    if (state !== "MAL") state = "DUDA";
    reasons.push(
      "No se encontro una jornada del trabajador el " +
        projectDate +
        " para confirmar la obra.",
    );
  } else if (!match) {
    if (state !== "MAL") state = "DUDA";
    reasons.push(
      "La obra del gasto no coincide con la jornada. Ese dia marco en: " +
        expected +
        ".",
    );
  }
  if (!reasons.length)
    reasons.push(
      "Factura legible: proveedor, fecha, total, numero y obra coinciden.",
    );
  return {
    state,
    note: text(reasons.join(" "), 400),
    merchant,
    merchant_address: address,
    date,
    total,
    subtotal,
    tax,
    currency,
    invoice,
    card_last4: last4,
    payment_method: method,
    invoice_fingerprint: receiptInvoiceFingerprint(merchant, invoice),
    project_match: match,
    expected_projects: expected,
  };
}
export type ReceiptVerdict = ReturnType<typeof compareReceipt>;
export const receiptReviewFormSchema = z.object({
  id: z.uuid(),
  request: z.uuid(),
  version: z.coerce.number().int().positive(),
});
export const receiptConfirmationSchema = receiptReviewFormSchema.extend({
  job: z.uuid(),
  note: z.string().trim().min(5).max(500),
});

export const receiptReviewHistorySchema = z.array(
  z.object({
    id: z.uuid(),
    expense_id: z.uuid(),
    receipt_id: z.uuid(),
    receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    expense_version: z.number().int(),
    prompt_version: z.string(),
    status: z.enum(["RUNNING", "DONE", "ERROR", "STALE"]),
    current: z.boolean(),
    actor_id: z.uuid(),
    created_at: z.string(),
    completed_at: z.string().nullable(),
    lease_until: z.string(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    error_code: z.string().nullable(),
    result: z
      .object({
        state: z.enum(["OK", "DUDA", "MAL"]),
        note: z.string(),
        merchant: z.string(),
        date: z.string(),
        total: z.number().nullable(),
        currency: z.string(),
        invoice: z.string(),
        card_last4: z.string().regex(/^([0-9]{4})?$/),
        payment_method: z.string(),
        project_match: z.boolean(),
        expected_projects: z.string(),
        duplicate_of: z.uuid().nullable(),
      })
      .nullable(),
  }),
);
export type ReceiptReviewHistory = z.infer<typeof receiptReviewHistorySchema>;
