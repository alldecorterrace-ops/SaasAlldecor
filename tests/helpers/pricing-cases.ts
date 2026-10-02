import { pricingForm } from "../../src/lib/pricing-settings";
export function pricingCases() {
  const base = pricingForm(null);
  const make = (name: string, patch: unknown) => ({
    name,
    input: { ...structuredClone(base), ...(patch as object) },
  });
  return [
    { name: "factory", input: base },
    { name: "empty form", input: {} },
    { name: "restore", restore: true, input: {} },
    make("blank tariff and inherited overrides", {
      tar: { equiposMargen: "", pergolaBlanco: "", pergolaCert: "0" },
      ma: { techo: "", cocina: "0" },
      mk: { techo: "", equipos: "0" },
    }),
    make("independent percentages", {
      p: { markup: "75", markupProducto: "100", overhead: "3500" },
      tar: { equiposMargen: "20.5" },
      c2: {
        demanda: "15.5",
        demandaUmbral: "6",
        zonaDefault: "10",
        zonaFueraFL: "50",
      },
      ma: { techo: "33.3", estructura: "-10", pared: "0", cocina: "75" },
      mk: { techo: "100", equipos: "0" },
    }),
    make("profiles replaced, blank row ignored", {
      cat: [
        { medida: "", precio: "" },
        {
          medida: " QA-6x6 ",
          calibre: " .125 ",
          color: " QA ",
          proveedor: " QA proveedor ",
          largo: "24.25",
          precio: "518.77",
        },
        { medida: "", precio: "0" },
      ],
    }),
    make("Unicode truncation and numeric strings", {
      cat: [
        {
          medida: "😀".repeat(40),
          calibre: "x".repeat(20),
          color: "Peña".repeat(20),
          proveedor: "Q".repeat(80),
          largo: " 2.4e1 ",
          precio: "+.25",
        },
      ],
      comp: {
        techo: [
          {
            nombre: " Ñ " + "😀".repeat(70),
            proveedor: "P".repeat(80),
            regla: "r".repeat(50),
            unidad: "u".repeat(20),
            precio: "100.125",
            cant: "2e-2",
            detalle: "D".repeat(150),
            tipo: "servicio",
          },
        ],
        estructura: [],
        pared: [],
        cocina: [],
      },
    }),
    make("blank first matching cost and default name merge", {
      comp: {
        techo: [
          { nombre: " luz (FOCO) ", precio: "" },
          { nombre: "Segundo foco", precio: "123" },
          { nombre: "PANEL AISLADO CERTIFICADO", precio: "9.25" },
        ],
        estructura: [{ nombre: "Cemento cimentación", precio: "0" }],
        pared: [],
        cocina: [
          { nombre: "Piedra / encimera", precio: "1500" },
          { nombre: "Labor de piedra", precio: "40" },
        ],
      },
    }),
    make("invalid numeric text omitted", {
      tar: { pergolaBlanco: "50oops", pergolaCert: " ", equiposMargen: "NaN" },
      c2: { demanda: "Infinity" },
      comp: {
        techo: [
          { nombre: "QA vacío", precio: "abc", cant: "" },
          { nombre: " ", precio: "99" },
        ],
        estructura: [],
        pared: [],
        cocina: [],
      },
    }),
    ...Array.from({ length: 32 }, (_, n) =>
      make(`synthetic normalization ${n + 1}`, {
        tar: {
          pergolaBlanco: String(40 + n / 10),
          equiposMargen: String(n - 5),
          permisoUmbralFt2: String(600 + n),
        },
        ma: {
          techo: String(n + 0.5),
          estructura: String(n),
          pared: "75",
          cocina: "100",
        },
        mk: n % 2 ? { techo: "0", equipos: String(n) } : {},
        c2: {
          zonaDefault: String(n / 10),
          demanda: "15",
          demandaUmbral: String(n),
        },
        cat: [
          {
            medida: `QA-${n}`,
            calibre: "0.125",
            color: "QA",
            proveedor: "QA proveedor",
            largo: String(12 + n / 10),
            precio: String(100 + n * 10.01),
          },
        ],
      }),
    ),
  ];
}
