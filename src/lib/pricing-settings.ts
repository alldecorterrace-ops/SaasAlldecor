import { z } from "zod";
import defaults from "./pricing-defaults.json";

export const pricingAreas = {
  techo: "Techo",
  estructura: "Estructura",
  pared: "Pared decorativa",
  cocina: "Cocina",
} as const;
export type PricingArea = keyof typeof pricingAreas;
export const pricingAreaKeys = {
  techo: ["techo", "canal", "fascia", "composite_mad"],
  estructura: ["estructura", "cimentacion", "herraje", "torn"],
  pared: ["pared"],
  cocina: ["cocina", "equipos"],
} as const;
export const pricingItemLabels = {
  techo: "Techo (paneles)",
  canal: "Canal",
  fascia: "Fascia",
  composite_mad: "Composite madera",
  estructura: "Estructura aluminio",
  cimentacion: "Cimentación",
  herraje: "Herraje",
  torn: "Tornillería",
  pared: "Pared decorativa",
  cocina: "Cocina (estructura + piedra)",
  equipos: "Equipos (Blaze)",
} as const;
export const pricingTariffLabels = {
  pergolaBlanco: "Pérgola blanco · USD/ft²",
  pergolaCert: "Pérgola certificado · USD/ft²",
  pergolaComposite: "Pérgola composite · USD/ft²",
  paredPanel: "Pared panel + tablitas · USD/ft²",
  paredComposite: "Pared composite · USD/ft²",
  cocinaPorFt: "Cocina · USD/ft lineal",
  equiposMargen: "Equipos (margen) · %",
  permisoFijo: "Permiso fijo · USD",
  permisoUmbralFt2: "Permiso: umbral · ft²",
  permisoPorFt2: "Permiso: sobre umbral · USD/ft²",
  heavyPorPieza: 'Material 1/4" · USD/pieza',
} as const;
export const pricingLayerLabels = {
  demanda: "Recargo por demanda · %",
  demandaUmbral: "Umbral de demanda",
  zonaDefault: "Zona (default) · %",
  zonaFueraMiami: "Zona fuera Miami · %",
  zonaFueraFL: "Zona fuera Florida · %",
} as const;
export const pricingSuppliers = [
  "Classic Metals",
  "Florida Aluminum (FAS)",
  "V&C",
  "Luces Poliled",
  "Home Depot",
  "American Fasteners",
  "Brazilian Lumber",
  "Jegam Stones",
  "Above Ground (Blaze)",
  "— servicio —",
];
export const pricingRules = [
  "por proyecto",
  "por área de techo",
  "por área de pared",
  "por área de piedra",
  "por panel",
  "por viga/columna",
  "por ft lineal",
  "cada 2 ft (lado mayor)",
  "por perímetro ÷ 20",
  "por perímetro ÷ 24",
  "manual (cliente)",
  "según diseño",
];
export const pricingUnits = [
  "$/ft",
  "$/ft²",
  "c/u",
  "losa",
  "corte",
  "lote",
  "rollo",
  "caja",
  "tornillo",
  "panel",
  "tramo",
  "saco",
  "ft",
  "ft²",
];
export const pricingColors = [
  "Bronce",
  "Blanco",
  "Mil finish",
  "White stucco",
  "KWILA (madera)",
  "CARPINO (madera)",
];
const areas = Object.keys(pricingAreas) as PricingArea[];
const generalKeys = [
  "markup",
  "markupProducto",
  "overhead",
  "permisoCosto",
  "diaTrabajoExtra",
  "columnasBase",
] as const;
const layerKeys = Object.keys(pricingLayerLabels);
const tariffKeys = Object.keys(pricingTariffLabels);
const itemKeys = Object.keys(pricingItemLabels);
const bounded = z.number().finite().min(-1e12).max(1e12);
const maybeNumber = z
  .union([bounded, z.literal("").transform(() => null)])
  .nullable();
const text = (max: number) => z.string().refine((s) => [...s].length <= max);
const record = (keys: readonly string[]) =>
  z
    .record(z.string(), bounded)
    .refine((v) => Object.keys(v).every((k) => keys.includes(k)));
export const pricingComponentSchema = z
  .object({
    nombre: text(60),
    tipo: z.enum(["material", "servicio"]),
    proveedor: text(60),
    regla: text(40),
    cant: maybeNumber,
    unidad: text(16),
    precio: maybeNumber,
    detalle: text(120),
  })
  .strict();
export const pricingProfileSchema = z
  .object({
    medida: text(32),
    calibre: text(16),
    color: text(40),
    proveedor: text(60),
    largo: maybeNumber,
    precio: maybeNumber,
  })
  .strict();
export const pricingSettingsSchema = z
  .object({
    markup: bounded.optional(),
    markupProducto: bounded.optional(),
    overhead: bounded.optional(),
    permisoCosto: bounded.optional(),
    diaTrabajoExtra: bounded.optional(),
    columnasBase: bounded.optional(),
    capa2: record(layerKeys).optional(),
    tarifas: record(tariffKeys),
    margenArea: record(areas),
    markupsOverride: record(itemKeys),
    catalogo: z.array(pricingProfileSchema).max(500),
    componentes: z
      .object({
        techo: z.array(pricingComponentSchema).max(100),
        estructura: z.array(pricingComponentSchema).max(100),
        pared: z.array(pricingComponentSchema).max(100),
        cocina: z.array(pricingComponentSchema).max(100),
      })
      .strict(),
  })
  .strict();
export type PricingSettings = z.infer<typeof pricingSettingsSchema>;
export type PricingComponent = z.infer<typeof pricingComponentSchema>;
export type PricingProfile = z.infer<typeof pricingProfileSchema>;
export type PricingForm = {
  p: Record<string, string>;
  c2: Record<string, string>;
  tar: Record<string, string>;
  ma: Record<string, string>;
  mk: Record<string, string>;
  cat: Record<string, string>[];
  comp: Record<PricingArea, Record<string, string>[]>;
};
const raw = z.union([z.string().max(2000), z.number().finite(), z.null()]);
const rawRow = z.record(z.string().max(64), raw);
const formSchema = z.object({
  p: rawRow.default({}),
  c2: rawRow.default({}),
  tar: rawRow.default({}),
  ma: rawRow.default({}),
  mk: rawRow.default({}),
  cat: z.array(rawRow).max(500).default([]),
  comp: z
    .object({
      techo: z.array(rawRow).max(100).default([]),
      estructura: z.array(rawRow).max(100).default([]),
      pared: z.array(rawRow).max(100).default([]),
      cocina: z.array(rawRow).max(100).default([]),
    })
    .default({ techo: [], estructura: [], pared: [], cocina: [] }),
});
const trim = (v: unknown) =>
  String(v ?? "").replace(/^[ \t\n\r\v\0]+|[ \t\n\r\v\0]+$/g, "");
const cut = (v: unknown, n: number) => [...trim(v)].slice(0, n).join("");
function number(v: unknown): number | null {
  if (
    typeof v !== "number" &&
    (typeof v !== "string" ||
      !/^[ \t\n\r\v\f]*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[ \t\n\r\v\f]*$/i.test(
        v,
      ))
  )
    return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12)
    throw new Error("El número supera el límite admitido.");
  return n;
}
function numericMap(
  v: Record<string, unknown>,
  keys: readonly string[],
  percentage: readonly string[] = [],
) {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const n = number(v[k]);
    if (n !== null) out[k] = percentage.includes(k) ? n / 100 : n;
  }
  return out;
}
// ADT guardar(): blank amounts become null, unnamed components are omitted,
// names are truncated by Unicode code point, percentages are divided by 100.
export function capturePricingForm(input: unknown): PricingSettings {
  const f = formSchema.parse(input);
  const componentes = Object.fromEntries(
    areas.map((a) => [
      a,
      f.comp[a]
        .filter((r) => trim(r.nombre) !== "")
        .map((r) => ({
          nombre: cut(r.nombre, 60),
          tipo: r.tipo === "servicio" ? "servicio" : "material",
          proveedor: cut(r.proveedor, 60),
          regla: cut(r.regla, 40),
          cant: number(r.cant),
          unidad: cut(r.unidad, 16),
          precio: number(r.precio),
          detalle: cut(r.detalle, 120),
        })),
    ]),
  );
  const catalogo = f.cat
    .filter((r) => trim(r.medida) !== "" || number(r.precio) !== null)
    .map((r) => ({
      medida: cut(r.medida, 32),
      calibre: cut(r.calibre, 16),
      color: cut(r.color, 40),
      proveedor: cut(r.proveedor, 60),
      largo: number(r.largo),
      precio: number(r.precio),
    }));
  const capa2 = numericMap(f.c2, layerKeys, [
    "demanda",
    "zonaDefault",
    "zonaFueraMiami",
    "zonaFueraFL",
  ]);
  return pricingSettingsSchema.parse({
    ...numericMap(f.p, generalKeys, ["markup", "markupProducto"]),
    ...(Object.keys(capa2).length ? { capa2 } : {}),
    catalogo,
    componentes,
    margenArea: numericMap(f.ma, areas, areas),
    markupsOverride: numericMap(f.mk, itemKeys, itemKeys),
    tarifas: numericMap(f.tar, tariffKeys, ["equiposMargen"]),
  });
}
const factory = pricingSettingsSchema.parse({
  ...defaults,
  markupsOverride: {},
});
// ADT effective(): replace profiles/overrides, append missing factory components
// by case-insensitive name, merge scalar settings and resolve item overrides.
export function effectivePricing(saved: PricingSettings | null) {
  const d = structuredClone(factory);
  if (saved) {
    for (const k of generalKeys) if (saved[k] !== undefined) d[k] = saved[k];
    d.tarifas = { ...d.tarifas, ...saved.tarifas };
    d.capa2 = { ...d.capa2, ...saved.capa2 };
    d.margenArea = { ...d.margenArea, ...saved.margenArea };
    d.catalogo = structuredClone(saved.catalogo);
    d.markupsOverride = { ...saved.markupsOverride };
    for (const a of areas) {
      const rows = structuredClone(saved.componentes[a]);
      const have = rows.map((r) => trim(r.nombre).toLowerCase());
      rows.push(
        ...d.componentes[a].filter(
          (r) => !have.includes(trim(r.nombre).toLowerCase()),
        ),
      );
      d.componentes[a] = rows;
    }
  }
  const markups: Record<string, number> = {};
  for (const a of areas)
    for (const k of pricingAreaKeys[a])
      markups[k] = d.markupsOverride[k] ?? d.margenArea[a];
  return { ...d, markups };
}
const phpRound = (n: number, digits = 0) =>
  (Math.sign(n) * Math.round(Math.abs(n) * 10 ** digits)) / 10 ** digits;
export function pricingForm(saved: PricingSettings | null): PricingForm {
  const e = effectivePricing(saved);
  const strings = (v: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, x == null ? "" : String(x)]),
    );
  const percent = (v: Record<string, number>, digits = 0) =>
    Object.fromEntries(
      Object.entries(v).map(([k, n]) => [k, String(phpRound(n * 100, digits))]),
    );
  return {
    p: {},
    tar: {
      ...strings(e.tarifas),
      equiposMargen: String(phpRound(e.tarifas.equiposMargen * 100)),
    },
    c2: {
      ...percent(e.capa2!, 1),
      demandaUmbral: String(e.capa2!.demandaUmbral),
    },
    ma: percent(e.margenArea),
    mk: percent(e.markupsOverride),
    cat: e.catalogo.map(strings),
    comp: Object.fromEntries(
      areas.map((a) => [a, e.componentes[a].map(strings)]),
    ) as PricingForm["comp"],
  };
}
// First matching component wins; a blank price leaves the corresponding cost
// unset, even when a later matching row has a price (ADT ratesFromComponentes).
export function pricingComponentRates(e: ReturnType<typeof effectivePricing>) {
  const find = (a: PricingArea, needle: string) =>
    e.componentes[a].find((r) =>
      r.nombre.toLowerCase().includes(needle.toLowerCase()),
    )?.precio ?? null;
  const out: Record<string, unknown> = {};
  for (const [area, needle, key] of [
    ["techo", "foco", "foco"],
    ["techo", "LED", "led8"],
    ["techo", "Ventilador", "fan"],
    ["estructura", "Cemento", "saco"],
  ] as const) {
    const n = find(area, needle);
    if (n !== null) out[key] = n;
  }
  const panels: Record<string, unknown> = {};
  for (const [needle, key] of [
    ["certificado", "certificado"],
    ["económico", "economico"],
  ]) {
    const n = find("techo", needle);
    if (n !== null) panels[key] = { ft2: n };
  }
  if (Object.keys(panels).length) out.PANELES = panels;
  const kitchen: Record<string, number> = {};
  for (const [needle, key] of [
    ["aluminio", "aluminioPorFt"],
    ["Durock", "durockPorFt"],
    ["Piedra", "piedraCosto"],
    ["Labor de piedra", "cortadorGranito"],
    ["Mano de obra", "managerFijo"],
  ]) {
    const n = find("cocina", needle);
    if (n !== null) kitchen[key] = n;
  }
  if (Object.keys(kitchen).length) out.cocina = kitchen;
  if (Object.keys(e.tarifas).length) out.tarifas = e.tarifas;
  return out;
}
export const pricingSimulationDefaults: Record<string, string> = {
  techo: "2500",
  canal: "0",
  fascia: "0",
  composite_mad: "0",
  estructura: "4000",
  cimentacion: "0",
  herraje: "0",
  torn: "0",
  pared: "1200",
  cocina: "8665",
  equipos: "6250",
};
export function pricingSimulation(
  f: Pick<PricingForm, "ma" | "mk">,
  costs: Record<string, string>,
) {
  let cost = 0,
    sale = 0;
  const rows = areas.flatMap((a) =>
    pricingAreaKeys[a].map((key) => {
      const c = parseFloat(costs[key]) || 0,
        ov = f.mk[key] !== "" ? parseFloat(f.mk[key]) : NaN,
        m = Number.isNaN(ov) ? parseFloat(f.ma[a]) || 0 : ov,
        v = c * (1 + m / 100);
      cost += c;
      sale += v;
      return { key, cost: c, sale: v, gain: v - c };
    }),
  );
  return {
    rows,
    cost,
    sale,
    gain: sale - cost,
    margin: sale > 0 ? Math.round(((sale - cost) / sale) * 100) : 0,
  };
}
