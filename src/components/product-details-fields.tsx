"use client";
import { useState } from "react";
import Image from "next/image";
import {
  productTextLimits,
  productMeasureKeys,
  productImageAllowed,
  type ProductDetailsDraft,
} from "@/lib/product-details";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

async function readProductPhoto(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 15000000
  )
    throw new Error("Usa imágenes JPG, PNG o WebP de hasta 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`No se pudo abrir ${file.name}.`));
      image.src = url;
    });
    const ratio = Math.min(1, 1280 / image.width, 1280 / image.height),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la foto.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.82);
    if (data.length > 1600000)
      throw new Error(
        "La foto sigue siendo muy grande. Usa una versión más pequeña.",
      );
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
const textLabels: Record<keyof typeof productTextLimits, string> = {
  sku: "SKU / código del producto",
  brand: "Marca",
  model: "Modelo / referencia",
  description: "Descripción del producto",
  material: "Material",
  finish: "Acabado",
  warranty: "Garantía",
  leadTime: "Disponibilidad / plazo de entrega",
  includes: "Qué incluye",
  care: "Cuidado y mantenimiento",
};
const measureLabels = {
  length: "Largo",
  width: "Ancho",
  height: "Alto",
  thickness: "Espesor",
  weight: "Peso",
};
export function ProductDetailsFields({
  value,
  change,
  readOnly,
  onUploading,
}: {
  value: ProductDetailsDraft;
  change: (patch: Partial<ProductDetailsDraft>) => void;
  readOnly: boolean;
  onUploading: (busy: boolean) => void;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const field = (key: keyof typeof productTextLimits) => {
    const long = ["description", "includes", "warranty", "care"].includes(key);
    return (
      <label className={`field ${long ? "md:col-span-2" : ""}`} key={key}>
        {textLabels[key]}
        {long ? (
          <textarea
            rows={key === "description" ? 4 : 2}
            maxLength={productTextLimits[key]}
            value={value[key]}
            onChange={(e) => change({ [key]: e.target.value })}
          />
        ) : (
          <Input
            maxLength={productTextLimits[key]}
            value={value[key]}
            onChange={(e) => change({ [key]: e.target.value })}
          />
        )}
      </label>
    );
  };
  async function photos(files: File[]) {
    if (!files.length || busy) return;
    setError("");
    if (files.length + value.images.length > 6) {
      setError("Puedes agregar hasta 6 fotos por producto.");
      return;
    }
    setBusy(true);
    onUploading(true);
    try {
      const additions: string[] = [];
      for (const file of files) additions.push(await readProductPhoto(file));
      const images = [...value.images, ...additions];
      if (images.join("").length > 4000000)
        throw new Error(
          "La galería supera el tamaño permitido. Reduce las imágenes.",
        );
      change({ images: [...new Set(images)] });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron preparar las fotos.",
      );
    } finally {
      setBusy(false);
      onUploading(false);
    }
  }
  return (
    <>
      <section className="border-t border-border pt-5 space-y-4">
        <h2 className="font-semibold">Información del producto</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {(
            [
              "sku",
              "brand",
              "model",
              "description",
              "includes",
              "leadTime",
              "warranty",
              "care",
            ] as const
          ).map(field)}
        </div>
      </section>
      <section className="border-t border-border pt-5 space-y-4">
        <h2 className="font-semibold">Medidas y materiales</h2>
        <p className="text-sm text-muted-foreground">
          Dimensiones físicas del artículo. La cantidad a cobrar se define al
          cotizar.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {field("material")}
          {field("finish")}
          <label className="field">
            Unidad de las medidas
            <select
              value={value.dimensions.unit}
              onChange={(e) =>
                change({
                  dimensions: {
                    ...value.dimensions,
                    unit: e.target
                      .value as ProductDetailsDraft["dimensions"]["unit"],
                  },
                })
              }
            >
              {[
                ["in", "Pulgadas (in)"],
                ["ft", "Pies (ft)"],
                ["mm", "Milímetros (mm)"],
                ["cm", "Centímetros (cm)"],
                ["m", "Metros (m)"],
              ].map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Unidad del peso
            <select
              value={value.dimensions.weightUnit}
              onChange={(e) =>
                change({
                  dimensions: {
                    ...value.dimensions,
                    weightUnit: e.target.value as "lb" | "kg",
                  },
                })
              }
            >
              <option value="lb">Libras (lb)</option>
              <option value="kg">Kilogramos (kg)</option>
            </select>
          </label>
          {productMeasureKeys.map((key) => (
            <label className="field" key={key}>
              {measureLabels[key]} (
              {key === "weight"
                ? value.dimensions.weightUnit
                : value.dimensions.unit}
              )
              <Input
                type="number"
                step="any"
                min="0.000001"
                max="1000000"
                value={value.dimensions[key]}
                onChange={(e) =>
                  change({
                    dimensions: { ...value.dimensions, [key]: e.target.value },
                  })
                }
                placeholder="Opcional"
              />
            </label>
          ))}
        </div>
      </section>
      <section className="border-t border-border pt-5 space-y-4">
        <h2 className="font-semibold">Fotos · {value.images.length}/6</h2>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {value.images.map((src, i) => (
            <figure
              className="rounded-xl border border-border p-3 min-w-0"
              key={src}
            >
              <div className="relative h-40">
                <Image
                  src={src}
                  alt={`Foto ${i + 1} del producto`}
                  fill
                  unoptimized
                  referrerPolicy="no-referrer"
                  className="object-contain"
                />
              </div>
              <figcaption className="mt-2 text-sm">
                {i === 0 ? "Foto principal" : `Foto ${i + 1}`}
              </figcaption>
              {!readOnly && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || i === 0}
                    onClick={() =>
                      change({
                        images: [
                          src,
                          ...value.images.filter((_, n) => n !== i),
                        ],
                      })
                    }
                  >
                    Usar como principal
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Quitar foto ${i + 1}`}
                    onClick={() =>
                      change({ images: value.images.filter((_, n) => n !== i) })
                    }
                  >
                    Quitar
                  </Button>
                </div>
              )}
            </figure>
          ))}
        </div>
        {!readOnly && (
          <div className="space-y-4">
            <label className="field">
              Agregar fotos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy || value.images.length >= 6}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void photos(files);
                }}
              />
              <small>
                JPG, PNG o WebP, hasta 15 MB por archivo. Se optimizan a 1280
                píxeles para la ficha.
              </small>
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="field flex-1 min-w-0">
                URL HTTPS de una foto
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  disabled={busy}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busy || value.images.length >= 6}
                onClick={() => {
                  const image = url.trim();
                  if (
                    !image.startsWith("https://") ||
                    !productImageAllowed(image) ||
                    new TextEncoder().encode(value.images.join("") + image)
                      .length > 4000000 ||
                    image.length > 1600000
                  ) {
                    setError("Usa una URL HTTPS válida y sin credenciales.");
                    return;
                  }
                  change({ images: [...new Set([...value.images, image])] });
                  setUrl("");
                  setError("");
                }}
              >
                Agregar URL
              </Button>
            </div>
          </div>
        )}
        {busy && <p role="status">Preparando fotos…</p>}
      </section>
    </>
  );
}
