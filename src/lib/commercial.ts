import { z } from "zod";
import { isRecordConflict } from "./database-errors";
import { customerSchema } from "./validation";
export const leadStatuses = [
  "NUEVO",
  "CONTACTADO",
  "COTIZANDO",
  "GANADO",
  "PERDIDO",
  "CLIENTE",
  "DESCARTADO",
  "FUERA_AREA",
] as const;
export const leadLabels: Record<string, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  COTIZANDO: "Cotizando",
  GANADO: "Ganado",
  PERDIDO: "Perdido",
  CLIENTE: "Cliente",
  DESCARTADO: "Descartado",
  FUERA_AREA: "Fuera de área",
};
export const priceBases = {
  area_ft2: "Área (ft²)",
  linear_ft: "Lineal (ft)",
  volume_ft3: "Volumen (ft³)",
  unit: "Por unidad",
  fixed: "Precio fijo",
  manual: "Precio manual",
} as const;
export const leadSchema = customerSchema
  .omit({ client_date: true, notes: true, status: true })
  .extend({
    message: z.string().max(10000),
    contact_preference: z.string().trim().max(60),
    appointment_date: z.iso.date().nullable(),
    lead_date: z.iso.date(),
    source: z.string().trim().min(1).max(120),
    status: z.enum(leadStatuses),
    archived: z.boolean(),
  });
export const decimal = z
  .string()
  .regex(
    /^\d{1,9}(\.\d{1,2})?$/,
    "Usa un importe positivo con hasta dos decimales.",
  );
const signedDecimal = z
  .string()
  .regex(/^-?\d{1,9}(\.\d{1,2})?$/, "Usa un importe con hasta dos decimales.");
export const productSchema = z.object({
  name: z.string().trim().min(2).max(255),
  category: z.string().trim().min(1).max(128),
  base: z.enum([
    "area_ft2",
    "linear_ft",
    "volume_ft3",
    "unit",
    "fixed",
    "manual",
  ]),
  unit_price: decimal,
  active: z.boolean(),
  specs: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        unit: z.string().trim().max(24),
      }),
    )
    .max(30),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        choices: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(120),
              add: signedDecimal,
              addType: z.enum(["base", "flat", "percent"]),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .max(20),
});
export type LeadInput = z.infer<typeof leadSchema>;
export type Lead = LeadInput & {
  id: string;
  version: number;
  customer_id: string | null;
};
export type ProductInput = z.infer<typeof productSchema>;
export type Product = ProductInput & { id: string; version: number };
export function todayInTimezone(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function emptyLead(timezone: string): LeadInput {
  return {
    full_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    service: "",
    message: "",
    contact_preference: "",
    appointment_date: null,
    lead_date: todayInTimezone(timezone),
    source: "panel",
    status: "NUEVO",
    archived: false,
  };
}
export const emptyProduct: ProductInput = {
  name: "",
  category: "Pérgola",
  base: "area_ft2",
  unit_price: "0.00",
  active: true,
  specs: [],
  options: [],
};
export function commercialError(code?: string) {
  return isRecordConflict(code)
    ? "Este registro cambió mientras lo editabas. Copia tus cambios y vuelve a abrir la ficha para revisar la última versión."
    : code === "23505"
      ? "Esta solicitud ya se guardó. Vuelve al listado para consultar el registro."
      : "No pudimos guardar. Revisa los campos y tu acceso e inténtalo de nuevo.";
}
