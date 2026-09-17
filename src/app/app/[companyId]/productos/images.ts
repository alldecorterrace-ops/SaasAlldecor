"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { imageFormat } from "@/lib/image-validation";
import { commercialError } from "@/lib/commercial";
import type { CommercialState } from "../leads/actions";
export async function setProductImage(
  companyId: string,
  productId: string,
  version: number,
  _: CommercialState,
  form: FormData,
): Promise<CommercialState> {
  const { db } = await requireModule(companyId, "productos", "write");
  if (
    !uuid.safeParse(productId).success ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    return { error: "Guarda primero el producto." };
  let path: string | null = null;
  if (form.get("remove") !== "true") {
    const file = form.get("image");
    if (!(file instanceof File) || !file.size || file.size > 1500000)
      return {
        error: "Selecciona una imagen PNG, JPG o WebP de hasta 1.5 MB.",
      };
    const bytes = new Uint8Array(await file.arrayBuffer()),
      format = imageFormat(bytes);
    if (!format)
      return {
        error:
          "El contenido del archivo no corresponde a una imagen PNG, JPG o WebP.",
      };
    path = `${companyId}/${productId}/${randomUUID()}.${format.extension}`;
    const { error } = await db.storage
      .from("product-images")
      .upload(path, bytes, {
        contentType: format.contentType,
        upsert: false,
        cacheControl: "60",
      });
    if (error)
      return {
        error:
          "No se pudo subir la imagen. Revisa tu acceso e inténtalo de nuevo.",
      };
  }
  const { error } = await db.rpc("set_product_image", {
    p_company: companyId,
    p_product: productId,
    p_version: version,
    p_path: path,
  });
  if (error) return { error: commercialError(error.code) };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/productos/${productId}?saved=1`);
}
