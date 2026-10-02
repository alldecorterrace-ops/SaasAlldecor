import { z } from "zod";

export const productTextLimits = {
  sku: 100,
  brand: 120,
  model: 120,
  description: 6000,
  material: 180,
  finish: 180,
  warranty: 1500,
  leadTime: 180,
  includes: 2000,
  care: 1500,
} as const;
export const productMeasureKeys = [
  "length",
  "width",
  "height",
  "thickness",
  "weight",
] as const;
export type ProductDetails = Record<keyof typeof productTextLimits, string> & {
  dimensions: Record<(typeof productMeasureKeys)[number], number | ""> & {
    unit: "in" | "ft" | "mm" | "cm" | "m";
    weightUnit: "lb" | "kg";
  };
  images: string[];
  version: 1;
};
export type ProductDetailsDraft = Omit<ProductDetails, "dimensions"> & {
  dimensions: Omit<
    ProductDetails["dimensions"],
    (typeof productMeasureKeys)[number]
  > &
    Record<(typeof productMeasureKeys)[number], string | number>;
};
const phpTrim = (s: string) =>
  s.replace(/^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g, "");
const scalar = (v: unknown): string => {
  if (v == null || v === false) return "";
  if (v === true) return "1";
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v))
    return Number.isSafeInteger(v) ? String(v) : phpFloat(v);
  throw new Error("Campo de producto inválido.");
};
// PHP's default precision=14 is also used by the frozen ADT summary.
export function phpFloat(v: number): string {
  if (v === 0) return "0";
  const [coefficient, exponent] = v.toExponential(13).split("e");
  const exp = Number(exponent),
    clean = coefficient.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (exp < -4 || exp >= 14)
    return `${clean.includes(".") ? clean : clean + ".0"}E${exp >= 0 ? "+" : ""}${exp}`;
  return Number(v.toPrecision(14)).toString();
}
const numeric =
  /^[ \t\n\r\f\v]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[ \t\n\r\f\v]*$/;

export function productRasterFormat(
  bytes: Uint8Array,
): "png" | "jpeg" | "webp" | null {
  const b = bytes,
    ascii = (at: number, s: string) =>
      [...s].every((ch, i) => b[at + i] === ch.charCodeAt(0));
  if (
    b.length >= 24 &&
    b[0] === 137 &&
    ascii(1, "PNG\r\n\x1a\n") &&
    ascii(12, "IHDR")
  )
    return "png";
  if (b.length >= 4 && b[0] === 255 && b[1] === 216) {
    let at = 2;
    while (at + 3 < b.length) {
      if (b[at++] !== 255) return null;
      while (b[at] === 255) at++;
      const marker = b[at++];
      if (marker === 0xd9 || marker === 0xda) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = (b[at] << 8) | b[at + 1];
      if (length < 2 || at + length > b.length) return null;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      )
        return length >= 7 ? "jpeg" : null;
      at += length;
    }
  }
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) {
    if (b.length >= 30 && ascii(12, "VP8X")) return "webp";
    if (b.length >= 25 && ascii(12, "VP8L") && b[20] === 47) return "webp";
    if (
      b.length >= 30 &&
      ascii(12, "VP8 ") &&
      b[23] === 157 &&
      b[24] === 1 &&
      b[25] === 42
    )
      return "webp";
  }
  return null;
}
export function productImageAllowed(image: string): boolean {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    image,
  );
  if (match) {
    try {
      const decoded = atob(match[2]);
      return (
        productRasterFormat(
          Uint8Array.from(decoded, (c) => c.charCodeAt(0)),
        ) !== null
      );
    } catch {
      return false;
    }
  }
  if (/^https:\/\/[^\x00-\x20\x7f<>"\t\n\r\f\v]+$/.test(image)) {
    try {
      const url = new URL(image);
      const authority = image.slice(8).split(/[/?#]/, 1)[0];
      return (
        !!url.hostname &&
        !url.username &&
        !url.password &&
        /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\[[A-Fa-f0-9:.]+\])(?::[0-9]+)?$/.test(
          authority,
        ) &&
        !/(?:^|\.)-|-(?:\.|:|$)|\.\./.test(authority)
      );
    } catch {
      return false;
    }
  }
  return /^\/(?:adt\/|sites\/default\/files\/)[^\x00-\x20<>"\t\n\r\f\v]+$/.test(
    image,
  );
}
export function normalizeProductDetails(raw: unknown): ProductDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("La ficha del producto no es válida.");
  const input = raw as Record<string, unknown>,
    result: Record<string, unknown> = {};
  for (const [key, limit] of Object.entries(productTextLimits)) {
    const value = phpTrim(scalar(input[key]));
    if ([...value].length > limit)
      throw new Error(`El campo ${key} supera ${limit} caracteres.`);
    result[key] = value;
  }
  const rawDims = input.dimensions ?? {};
  if (typeof rawDims !== "object" || rawDims === null)
    throw new Error("Las medidas no son válidas.");
  const dims = (Array.isArray(rawDims) ? {} : rawDims) as Record<
      string,
      unknown
    >,
    normalized: Record<string, unknown> = {};
  for (const key of productMeasureKeys) {
    const v = dims[key] ?? "";
    if (v === "") normalized[key] = "";
    else {
      if (
        (typeof v !== "number" &&
          (typeof v !== "string" || !numeric.test(v))) ||
        !Number.isFinite(Number(v)) ||
        Number(v) <= 0 ||
        Number(v) > 1000000
      )
        throw new Error(
          "Las medidas y el peso deben ser mayores que cero y como máximo 1000000.",
        );
      normalized[key] = Number(v);
    }
  }
  normalized.unit = scalar(dims.unit ?? "in");
  normalized.weightUnit = scalar(dims.weightUnit ?? "lb");
  if (
    !["in", "ft", "mm", "cm", "m"].includes(String(normalized.unit)) ||
    !["lb", "kg"].includes(String(normalized.weightUnit))
  )
    throw new Error("Selecciona una unidad válida.");
  const images = input.images ?? [];
  if (!Array.isArray(images) || images.length > 6)
    throw new Error("Puedes agregar hasta 6 imágenes.");
  let bytes = 0;
  for (const image of images) {
    if (
      typeof image !== "string" ||
      new TextEncoder().encode(image).length > 1600000 ||
      !productImageAllowed(image)
    )
      throw new Error("Imagen inválida. Usa JPG, PNG, WebP o una URL HTTPS.");
    bytes += new TextEncoder().encode(image).length;
  }
  if (bytes > 4000000)
    throw new Error(
      "La galería supera el tamaño permitido. Reduce las imágenes.",
    );
  result.dimensions = normalized;
  result.images = [...new Set(images)];
  result.version = 1;
  return result as ProductDetails;
}
export const productDetailsSchema = z
  .unknown()
  .transform((input, ctx): ProductDetails => {
    try {
      return normalizeProductDetails(input);
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        message: e instanceof Error ? e.message : "Ficha inválida.",
      });
      return z.NEVER;
    }
  });
export function productDetailsSummary(d: ProductDetails): string {
  const parts: string[] = [],
    nonempty = (s: string) => s !== "" && s !== "0";
  if (nonempty(d.description)) parts.push(d.description);
  for (const [key, label] of [
    ["brand", "Marca"],
    ["model", "Modelo"],
    ["material", "Material"],
    ["finish", "Acabado"],
  ] as const)
    if (nonempty(d[key])) parts.push(`${label}: ${d[key]}`);
  for (const [key, label] of [
    ["length", "Largo"],
    ["width", "Ancho"],
    ["height", "Alto"],
    ["thickness", "Espesor"],
  ] as const)
    if (d.dimensions[key] !== "")
      parts.push(
        `${label}: ${phpFloat(d.dimensions[key])} ${d.dimensions.unit}`,
      );
  if (nonempty(d.includes)) parts.push(`Incluye: ${d.includes}`);
  return parts.join(" · ");
}
