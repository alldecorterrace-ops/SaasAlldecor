import { z } from "zod";
import { paymentSchema, projectSchema } from "./finance";
const reason = z.string().trim().min(3).max(2000);
const voidReason = z.string().trim().min(1).max(2000);
const invoiceData = z.object({ date: z.iso.date(), due: z.iso.date().nullable(), notes: z.string().max(10000) });
const dataSchemas = {
  approve: z.object({ date: z.iso.date(), name: z.string().trim().min(2).max(255), note: reason }),
  payment: paymentSchema.extend({ payment_id: z.uuid() }),
  "void-payment": z.object({ reason: voidReason }),
  invoice: invoiceData.refine(v => !v.due || v.due >= v.date),
  "void-invoice": invoiceData.extend({ reason: voidReason }).refine(v => !v.due || v.due >= v.date),
  project: projectSchema,
};
export const financeOperations = Object.keys(dataSchemas) as Array<keyof typeof dataSchemas>;
export function parseFinanceRequest(form: FormData) {
  const envelope = z.object({
    operation: z.enum(["approve", "payment", "void-payment", "invoice", "void-invoice", "project"]),
    id: z.uuid(), request: z.uuid(), version: z.coerce.number().int().positive(),
  }).safeParse(Object.fromEntries(form));
  if (!envelope.success) return { success: false as const, error: "Vuelve a abrir el documento para preparar la solicitud." };
  const values: Record<string, unknown> = Object.fromEntries(form);
  for (const key of ["due", "start_date", "end_date"]) values[key] = values[key] || null;
  const parsed = dataSchemas[envelope.data.operation].safeParse(values);
  if (!parsed.success) return { success: false as const, error: "Revisa los campos: " + parsed.error.issues[0]?.message };
  return { success: true as const, data: { ...envelope.data, payload: parsed.data } };
}
export const financeRequestResult = z.object({
  id: z.uuid(), version: z.number().int().positive(),
  operation: z.enum(["approve", "payment", "void-payment", "invoice", "void-invoice", "project"]),
});
