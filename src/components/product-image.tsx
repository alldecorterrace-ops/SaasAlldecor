"use client";
import Image from "next/image";
import { useActionState } from "react";
import { setProductImage } from "@/app/app/[companyId]/productos/images";
import type { CommercialState } from "@/app/app/[companyId]/leads/actions";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function ProductImage({
  companyId,
  id,
  version,
  url,
  readOnly,
}: {
  companyId: string;
  id: string;
  version: number;
  url: string | null;
  readOnly: boolean;
}) {
  const [state, action] = useActionState(
    setProductImage.bind(null, companyId, id, version),
    {} as CommercialState,
  );
  return (
    <section className="card max-w-5xl mt-6">
      <h2 className="font-semibold">Imagen del producto</h2>
      {url ? (
        <div className="relative mt-4 h-60 max-w-md rounded-xl overflow-hidden bg-accent">
          <Image
            src={url}
            alt="Imagen del producto"
            fill
            unoptimized
            className="object-contain"
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Sin imagen.</p>
      )}
      {!readOnly && (
        <form action={action} className="mt-5 space-y-4">
          <Feedback error={state.error} />
          <label className="field">
            Subir o reemplazar imagen
            <input
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
            />
            <small>
              PNG, JPG o WebP, hasta 1.5 MB. Guarda los cambios de la ficha
              antes de subir una imagen.
            </small>
          </label>
          <label className="flex gap-2 text-sm items-center">
            <input type="checkbox" name="remove" value="true" /> Quitar la
            imagen actual de la ficha
          </label>
          <SubmitButton>Guardar imagen</SubmitButton>
        </form>
      )}
    </section>
  );
}
