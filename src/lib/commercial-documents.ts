import { z } from "zod";
const money = z.union([
  z.number().finite().nonnegative(),
  z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
]);
const text = z.string().max(10000);
export const commercialKind = z.enum(["estimate", "invoice"]);
export const commercialSnapshot = z.object({
  company: z.object({ name: z.string(), timezone: z.string() }),
  record: z.object({
    number: z.string(),
    version: z.number().int().positive(),
    status: z.string(),
    customer_snapshot: z.object({
      full_name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      address: z.string().nullable(),
      city: z.string().nullable(),
      postal_code: z.string().nullable(),
    }),
    estimate_date: z.iso.date().optional(),
    invoice_date: z.iso.date().optional(),
    valid_until: z.iso.date().nullable().optional(),
    due_date: z.iso.date().nullable().optional(),
    items: z
      .array(
        z.object({
          name: text,
          description: text,
          qty: z.union([z.string(), z.number()]),
          base: z.string(),
          unit_price: money,
          line_total: money,
          length: z.union([z.string(), z.number()]),
          width: z.union([z.string(), z.number()]),
          height: z.union([z.string(), z.number()]),
        }),
      )
      .min(1)
      .max(200),
    subtotal: money,
    discount: money,
    taxes: money,
    total: money,
    notes: text,
    paid_amount: money.optional(),
    balance_due: money.optional(),
  }),
});
export const storedCommercialDocument = z
  .object({
    id: z.uuid(),
    company_id: z.uuid(),
    kind: commercialKind,
    record_id: z.uuid(),
    customer_id: z.uuid(),
    record_version: z.number().int().positive(),
    number: z.string(),
    state: z.enum(["pending", "ready"]),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    bytes: z.number().int().positive().max(5000000).nullable(),
    created_at: z.iso.datetime({ offset: true }),
    snapshot: commercialSnapshot,
  })
  .refine(
    (d) =>
      d.state === "ready"
        ? d.sha256 !== null && d.bytes !== null
        : d.sha256 === null && d.bytes === null,
    "Invalid PDF state",
  );
export type StoredCommercialDocument = z.infer<typeof storedCommercialDocument>;
export const commercialDocumentList = z.object({
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  rows: z
    .array(
      z.object({
        id: z.uuid(),
        kind: commercialKind,
        record_id: z.uuid(),
        record_version: z.number().int().positive(),
        number: z.string(),
        ready_at: z.iso.datetime({ offset: true }),
      }),
    )
    .max(20),
});
export type CommercialDocumentList = z.infer<typeof commercialDocumentList>;
export const commercialModule = (kind: "estimate" | "invoice") =>
  kind === "estimate" ? "fin-estimados" : "fin-invoices";
