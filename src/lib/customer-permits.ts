import { z } from "zod";
const relation = {
  id: z.uuid(),
  name: z.string(),
  project_id: z.uuid(),
  project_name: z.string(),
};
export const customerPermitsSchema = z.object({
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  rows: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          ...relation,
          kind: z.literal("permit"),
          status: z.enum([
            "PENDIENTE",
            "EN_REVISION",
            "APROBADO",
            "RECHAZADO",
            "VENCIDO",
          ]),
          authority: z.string(),
          number: z.string(),
          submitted_date: z.iso.date().nullable(),
          approved_date: z.iso.date().nullable(),
          expiration_date: z.iso.date().nullable(),
          documents: z.number().int().nonnegative(),
        }),
        z.object({
          ...relation,
          kind: z.literal("document"),
          permit_id: z.uuid(),
          permit_name: z.string(),
          created_at: z.iso.datetime({ offset: true }),
        }),
      ]),
    )
    .max(20),
});
export type CustomerPermitsResult = z.infer<typeof customerPermitsSchema>;
