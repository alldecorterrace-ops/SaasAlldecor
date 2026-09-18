import { z } from "zod";
export const archiveKinds = ["documents", "contracts"] as const;
export const archiveKindSchema = z.enum(archiveKinds);
export const archiveLabels = {
  documents: "Documentos",
  contracts: "Contratos",
} as const;
export const historicalDocumentSchema = z
  .object({
    title: z.string().max(500),
    original_type: z.string().max(100),
    original_status: z.string().max(100),
    original_date: z.string().max(100),
    signed_date: z.string().max(100),
    customer_name: z.string().max(500),
    amount_cents: z
      .string()
      .regex(/^-?\d{1,16}$/)
      .nullable(),
    has_signed_content: z.boolean(),
    has_signature: z.boolean(),
    relation_state: z.enum(["linked", "review"]),
    review_reasons: z.array(z.string().max(100)).max(100),
  })
  .strict();
export type HistoricalDocument = z.infer<typeof historicalDocumentSchema>;
export const fileStateSchema = z.enum([
  "available",
  "missing",
  "invalid",
  "no_source",
]);
export const fileStateLabels = {
  available: "PDF conservado",
  missing: "PDF no encontrado en el origen",
  invalid: "Archivo pendiente de revisión",
  no_source: "Sin PDF indicado en el registro original",
} as const;
export function archiveReview(reason: string) {
  if (reason.startsWith("missing:"))
    return "Una referencia original no tiene un destino disponible en el respaldo.";
  if (reason.includes("conflict"))
    return "Las referencias originales no coinciden en el cliente; el registro quedó sin adjuntar.";
  if (reason === "invalid_money")
    return "El importe original necesita revisión.";
  if (reason === "file_size_mismatch")
    return "El tamaño del archivo encontrado difiere del tamaño guardado.";
  return "Hay una referencia original pendiente de revisión.";
}
