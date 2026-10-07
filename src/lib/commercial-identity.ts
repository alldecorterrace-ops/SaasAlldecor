import { z } from "zod";
const field = (max: number, multiline = false) =>
  z
    .string()
    .transform((s) =>
      s.replace(/\r\n?/g, "\n").replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, ""),
    )
    .pipe(
      z
        .string()
        .max(max)
        .refine(
          (s) =>
            !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(s) &&
            (multiline || !/[\n\t]/.test(s)),
          "Texto inválido",
        ),
    );
export const commercialIdentity = z
  .object({
    legal_name: field(160),
    tagline: field(255),
    address: field(1000, true),
    phone: field(64),
    email: field(254).refine(
      (s) => !s || z.email().safeParse(s).success,
      "Correo inválido",
    ),
    website: field(500).refine((s) => {
      if (!s) return true;
      try {
        const u = new URL(s);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          !/[\s@]/.test(u.host)
        );
      } catch {
        return false;
      }
    }, "Usa una dirección HTTPS sin credenciales"),
    license: field(500),
    payment_instructions: field(2000, true),
    footer: field(2000, true),
  })
  .strict();
export type CommercialIdentity = z.infer<typeof commercialIdentity>;
export const commercialIdentityFields = [
  ["legal_name", "Nombre legal o comercial", 160],
  ["tagline", "Descripción de la empresa", 255],
  ["address", "Dirección comercial", 1000],
  ["phone", "Teléfono comercial", 64],
  ["email", "Correo comercial", 254],
  ["website", "Sitio web HTTPS", 500],
  ["license", "Licencia o acreditación confirmada", 500],
  ["payment_instructions", "Métodos e instrucciones de pago (Facturas)", 2000],
  ["footer", "Pie comercial", 2000],
] as const;
export const emptyCommercialIdentity: CommercialIdentity = {
  legal_name: "",
  tagline: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  license: "",
  payment_instructions: "",
  footer: "",
};
export const capturedCommercialIdentity = commercialIdentity.extend({
  version: z.number().int().positive(),
});
export type CommercialCompany = {
  name: string;
  commercial?: z.infer<typeof capturedCommercialIdentity> | null;
};
export function commercialCompanyName(company: CommercialCompany) {
  return company.commercial?.legal_name || company.name;
}
export function commercialContactLines(company: CommercialCompany) {
  const c = company.commercial;
  return c
    ? [
        c.tagline,
        c.address,
        [c.phone, c.email].filter(Boolean).join(" · "),
        c.website,
        c.license,
      ].filter(Boolean)
    : [];
}
export function commercialFooterLines(company: CommercialCompany) {
  return company.commercial?.footer ? [company.commercial.footer] : [];
}
