import { z } from "zod";
export const uuid = z.uuid();
const optionalText = (max: number) => z.string().trim().max(max);
export const customerSchema = z.object({
  full_name: z.string().trim().min(2, "Escribe el nombre completo.").max(255),
  email: z.union([z.email(), z.literal("")]).transform((s) => s.trim()),
  phone: optionalText(64),
  address: optionalText(255),
  city: optionalText(128),
  postal_code: optionalText(24),
  service: optionalText(255),
  client_date: z.iso.date(),
  notes: optionalText(10000),
  status: z.enum(["active", "archived"]),
});
export const companySchema = z.object({
  name: z.string().trim().min(2).max(160),
});
export type CustomerInput = z.infer<typeof customerSchema>;
export type Customer = CustomerInput & {
  id: string;
  company_id: string;
  version: number;
  created_at: string;
  updated_at: string;
};
export function customerFromForm(form: FormData) {
  return customerSchema.safeParse(
    Object.fromEntries(
      Object.keys(customerSchema.shape).map((k) => [
        k,
        String(form.get(k) ?? "").trim(),
      ]),
    ),
  );
}
