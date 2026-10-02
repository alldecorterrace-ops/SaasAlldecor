import { jpeg, webpLossy, webpLossless } from "./product-raster-fixtures";
export const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=";
const url = "https://example.test/photo.png";
export const productDetailsCases: { name: string; input: unknown }[] = [
  { name: "defaults", input: {} },
  {
    name: "integer text retains full digits",
    input: { sku: 1000000000000000 },
  },
  {
    name: "JPEG and both WebP formats",
    input: { images: [jpeg, webpLossy, webpLossless] },
  },
  {
    name: "all fields and unchanged descriptive dimensions",
    input: {
      sku: "  QA-1  ",
      brand: "Marca",
      model: "Modelo",
      description: "Descripción Peña & <material>",
      material: "Aluminio",
      finish: "Blanco",
      warranty: "12 meses",
      leadTime: "Dos semanas",
      includes: "Tornillos",
      care: "Paño",
      dimensions: {
        length: "24",
        width: "6",
        height: "6",
        thickness: ".125",
        weight: "45.5",
        unit: "ft",
        weightUnit: "lb",
      },
      images: [png, url, png],
    },
  },
  {
    name: "scalar values",
    input: { sku: 42, brand: true, model: false, description: null },
  },
  {
    name: "zero text and weight excluded from summary",
    input: {
      brand: "0",
      sku: "Hidden",
      warranty: "Not in summary",
      dimensions: { weight: 2, weightUnit: "kg" },
    },
  },
  {
    name: "PHP whitespace only",
    input: { brand: "\u00a0Marca\u00a0", model: "\t Modelo \r\n" },
  },
  { name: "Unicode code point limit", input: { brand: "😀".repeat(120) } },
  { name: "Unicode too long", input: { brand: "😀".repeat(121) } },
  {
    name: "dimension boundaries and precision",
    input: {
      dimensions: {
        length: 1000000,
        width: "  +1.25e2 ",
        height: 0.000001,
        thickness: 0.1234567890123456,
        unit: "mm",
      },
    },
  },
  {
    name: "numeric scalar precision",
    input: { brand: 0.1234567890123456, model: 0.0000001 },
  },
  {
    name: "null optional structures",
    input: { dimensions: null, images: null },
  },
  { name: "empty array dimensions", input: { dimensions: [] } },
  ...[0, -1, "NaN", "Infinity", true, " ", "1,5", "1000001", {}, "1e999"].map(
    (v) => ({
      name: `invalid dimension ${JSON.stringify(v)}`,
      input: { dimensions: { length: v } },
    }),
  ),
  { name: "unknown measure unit", input: { dimensions: { unit: "yards" } } },
  { name: "invalid text object", input: { brand: { name: "x" } } },
  {
    name: "truncated PNG",
    input: { images: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="] },
  },
  {
    name: "valid raster with other allowed prefix",
    input: { images: [png.replace("image/png", "image/jpeg")] },
  },
  { name: "invalid base64", input: { images: [png.replace("CAQ", "?AQ")] } },
  {
    name: "valid unpadded base64",
    input: { images: [png.replace(/=+$/, "")] },
  },
  {
    name: "Unicode hostname rejected",
    input: { images: ["https://mañana.test/photo.png"] },
  },
  {
    name: "escaped hostname rejected",
    input: { images: ["https://%65xample.test/photo.png"] },
  },
  {
    name: "empty user rejected",
    input: { images: ["https://@example.test/photo.png"] },
  },
  {
    name: "leading dash hostname rejected",
    input: { images: ["https://-example.test/photo.png"] },
  },
  {
    name: "SVG rejected",
    input: { images: ["data:image/svg+xml;base64,PHN2Zy8+"] },
  },
  { name: "http rejected", input: { images: ["http://example.test/a.png"] } },
  { name: "javascript rejected", input: { images: ["javascript:alert(1)"] } },
  {
    name: "credential URL rejected",
    input: { images: ["https://user:pass@example.test/a.png"] },
  },
  {
    name: "control character URL rejected",
    input: { images: ["https://example.test/a\n.png"] },
  },
  {
    name: "allowed legacy relative paths",
    input: { images: ["/adt/files/qa.png", "/sites/default/files/qa.png"] },
  },
  {
    name: "unrelated relative path rejected",
    input: { images: ["/private/qa.png"] },
  },
  {
    name: "six images",
    input: { images: Array.from({ length: 6 }, (_, i) => url + "?n=" + i) },
  },
  {
    name: "seven images",
    input: { images: Array.from({ length: 7 }, (_, i) => url + "?n=" + i) },
  },
  {
    name: "duplicate budget counted before deduplication",
    input: { images: Array(3).fill(url + "?" + "a".repeat(1400000)) },
  },
  {
    name: "single image byte limit",
    input: { images: [url + "?" + "a".repeat(1600000)] },
  },
];
