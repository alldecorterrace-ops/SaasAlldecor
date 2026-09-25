"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { isRecordConflict } from "@/lib/database-errors";
import type { ActionState } from "@/components/action-form";
export async function saveCenter(
  companyId: string,
  zip: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await requireModule(companyId, "mapazonas", "write");
  const parsed = z
    .object({
      zip: z.string().regex(/^\d{5}$/),
      city: z.string().trim().max(118),
      latitude: z.coerce
        .number()
        .min(-90)
        .max(90)
        .refine((v) => v !== 0),
      longitude: z.coerce
        .number()
        .min(-180)
        .max(180)
        .refine((v) => v !== 0),
      version: z.coerce.number().int().min(0),
    })
    .safeParse({
      zip,
      city: form.get("city"),
      latitude: form.get("latitude"),
      longitude: form.get("longitude"),
      version: form.get("version"),
    });
  if (!parsed.success)
    return {
      error:
        "Revisa la ciudad y las coordenadas: latitud −90 a 90, longitud −180 a 180, ambas distintas de cero.",
    };
  const v = parsed.data;
  const { error } = await db.rpc("save_postal_center", {
    p_company: companyId,
    p_zip: zip,
    p_lat: v.latitude,
    p_lng: v.longitude,
    p_city: v.city,
    p_version: v.version,
  });
  if (error)
    return {
      error: isRecordConflict(error.code)
        ? "La ubicación cambió. Recarga la página antes de guardar."
        : "No se pudo guardar la ubicación. Revisa tus permisos y vuelve a intentarlo.",
    };
  const base = `/app/${companyId}/mapa-zonas`;
  revalidatePath(base);
  redirect(`${base}?saved=1`);
}
