import { z } from "zod";
import { decimal, priceBases } from "./commercial";
import { paymentTermsInput } from "./payment-terms";
export const estimateStatuses = {
  ENVIADO: "Enviado",
  PENDIENTE_ENVIO: "Envío pendiente",
  ERROR_ENVIO: "Error de envío",
  APROBADO: "Aprobado",
  BORRADOR: "Borrador",
  PENDIENTE: "Pendiente",
  RECHAZADO: "Rechazado",
  ANULADA: "Anulado",
} as const;
const measure = z
  .string()
  .regex(
    /^\d{1,6}(\.\d{1,3})?$/,
    "Usa una medida positiva con hasta tres decimales.",
  );
export const estimateItemSchema = z
  .object({
    product_id: z.uuid().nullable(),
    name: z.string().trim().min(1).max(255),
    description: z
      .string()
      .refine(
        (s) => [...s].length <= 10000,
        "La descripción supera 10000 caracteres.",
      ),
    base: z.enum(
      Object.keys(priceBases) as [
        keyof typeof priceBases,
        ...(keyof typeof priceBases)[],
      ],
    ),
    unit_price: decimal,
    qty: measure,
    length: measure,
    width: measure,
    height: measure,
    manual_total: decimal,
  })
  .superRefine((v, ctx) => {
    const needed = [
      "qty",
      ...(v.base === "linear_ft"
        ? ["length"]
        : v.base === "area_ft2"
          ? ["length", "width"]
          : v.base === "volume_ft3"
            ? ["length", "width", "height"]
            : []),
    ];
    for (const key of needed)
      if (Number(v[key as "qty"]) <= 0)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            "La cantidad y las medidas utilizadas deben ser mayores que cero.",
        });
  });
export const estimateSchema = z
  .object({
    customer_id: z.uuid(),
    estimate_date: z.iso.date(),
    valid_until: z.iso.date().nullable(),
    status: z.enum([
      "BORRADOR",
      "PENDIENTE",
      "RECHAZADO",
      "ANULADA",
      "APROBADO",
      "ENVIADO",
      "ERROR_ENVIO",
      "PENDIENTE_ENVIO",
    ]),
    notes: z.string().max(10000),
    commercial_terms: paymentTermsInput.nullable().optional(),
    discount: decimal,
    taxes: decimal,
    tax_pct: z.enum(["0", "7"]).nullable().optional(),
    items: z.array(estimateItemSchema).min(1).max(100),
  })
  .refine((x) => !x.valid_until || x.valid_until >= x.estimate_date, {
    message: "La vigencia debe ser posterior o igual a la fecha del estimado.",
  });
export type EstimateInput = z.infer<typeof estimateSchema>;
export type EstimateItem = z.infer<typeof estimateItemSchema>;
export const emptyItem: EstimateItem = {
  product_id: null,
  name: "",
  description: "",
  base: "fixed",
  unit_price: "0.00",
  qty: "1",
  length: "0",
  width: "0",
  height: "0",
  manual_total: "0.00",
};
// ADT's non-configurator estimate editor copies the catalog base price only.
// Option adjustments and descriptive product dimensions are not applied here.
export function catalogEstimateItem(p: {
  id: string;
  name: string;
  description: string;
  base: string;
  unit_price: string | number;
}): EstimateItem {
  return {
    ...emptyItem,
    product_id: p.id,
    name: p.name,
    description: p.description,
    base: p.base as EstimateItem["base"],
    unit_price: String(p.unit_price),
  };
}
export function scaled(s: string, digits: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid decimal");
  const [a, b = ""] = s.split(".");
  if (b.length > digits) throw new Error("Excess precision");
  return BigInt(a + b.padEnd(digits, "0"));
}
export function lineCents(i: EstimateItem): bigint {
  if (i.base === "manual") return scaled(i.manual_total, 2);
  let n = scaled(i.unit_price, 2) * scaled(i.qty, 3),
    d = 1000n;
  const dims =
    i.base === "linear_ft"
      ? [i.length]
      : i.base === "area_ft2"
        ? [i.length, i.width]
        : i.base === "volume_ft3"
          ? [i.length, i.width, i.height]
          : [];
  for (const value of dims) {
    n *= scaled(value, 3);
    d *= 1000n;
  }
  return (n + d / 2n) / d;
}
export function centsText(n: bigint) {
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
type EstimateAmounts = Pick<EstimateInput, "items" | "discount" | "taxes"> &
  Pick<EstimateInput, "tax_pct">;
export function estimateTaxes(v: EstimateAmounts): string {
  if (v.tax_pct == null) return centsText(scaled(v.taxes, 2));
  if (v.tax_pct !== "0" && v.tax_pct !== "7")
    throw new Error("Invalid tax rate");
  const subtotal = v.items.reduce((sum, i) => sum + lineCents(i), 0n),
    discount = scaled(v.discount, 2);
  if (discount > subtotal) throw new Error("El descuento supera el subtotal.");
  return centsText(((subtotal - discount) * BigInt(v.tax_pct) + 50n) / 100n);
}
// ADT's editor sends min(requested discount, rounded line subtotal).
// Capture only the new input; existing revisions are never rewritten.
export function captureEstimateInput(v: EstimateInput): EstimateInput {
  const subtotal = v.items.reduce((sum, item) => sum + lineCents(item), 0n),
    requested = scaled(v.discount, 2);
  const captured = {
    ...v,
    discount: centsText(requested > subtotal ? subtotal : requested),
  };
  return { ...captured, taxes: estimateTaxes(captured) };
}
export function moveEstimateItem(
  items: EstimateItem[],
  index: number,
  direction: -1 | 1,
) {
  const target = index + direction;
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= items.length ||
    target < 0 ||
    target >= items.length
  )
    return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
export function duplicateEstimateItem(items: EstimateItem[], index: number) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= items.length ||
    items.length >= 100
  )
    return items;
  return [
    ...items.slice(0, index + 1),
    { ...items[index] },
    ...items.slice(index + 1),
  ];
}
export function estimateTotals(v: EstimateAmounts) {
  const subtotal = v.items.reduce((sum, i) => sum + lineCents(i), 0n),
    discount = scaled(v.discount, 2),
    taxes = scaled(estimateTaxes(v), 2);
  if (discount > subtotal) throw new Error("El descuento supera el subtotal.");
  const total = subtotal - discount + taxes;
  if (total > 99999999999999n)
    throw new Error("El importe supera el límite admitido.");
  return { subtotal: centsText(subtotal), total: centsText(total) };
}
