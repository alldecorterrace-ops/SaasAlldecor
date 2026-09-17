"use client";
import { useState } from "react";
import { dimensionLabels, type DesignSpec } from "@/lib/designs";
type Point = [number, number, number];
type Face = { points: Point[]; color: string };
export function DesignFields({
  initial,
  three,
}: {
  initial: DesignSpec;
  three: boolean;
}) {
  const [spec, setSpec] = useState(initial),
    [yaw, setYaw] = useState(35),
    [zoom, setZoom] = useState(1);
  const safe = (v: string, fallback = 0) =>
      Math.max(0, Math.min(200, Number(v) || fallback)),
    length = safe(spec.length, 20),
    width = safe(spec.width, 12),
    height = safe(spec.height, 9);
  const faces: Face[] = [];
  function box(
    x: number,
    y: number,
    z: number,
    l: number,
    h: number,
    w: number,
    color: string,
  ) {
    const p: Point[] = [
      [x, y, z],
      [x + l, y, z],
      [x + l, y + h, z],
      [x, y + h, z],
      [x, y, z + w],
      [x + l, y, z + w],
      [x + l, y + h, z + w],
      [x, y + h, z + w],
    ];
    for (const indices of [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 5, 6, 2],
      [3, 2, 6, 7],
    ])
      faces.push({ points: indices.map((i) => p[i]), color });
  }
  const frame =
    spec.color === "bronze"
      ? "#695143"
      : spec.color === "black"
        ? "#334155"
        : "#e2e8f0";
  for (const x of [0, length - 0.3])
    for (const z of [0, width - 0.3]) box(x, 0, z, 0.3, height, 0.3, frame);
  box(
    0,
    height,
    0,
    length,
    0.3,
    width,
    spec.roof === "composite" ? "#ac805b" : "#b7c9d2",
  );
  if (spec.wall !== "none")
    box(
      0,
      0,
      width - 0.15,
      safe(spec.wall_length),
      safe(spec.wall_height),
      0.15,
      spec.wall === "composite" ? "#927055" : "#d5d8dc",
    );
  if (safe(spec.kitchen_length) > 0)
    box(0.5, 0, 0.5, safe(spec.kitchen_length), 3, 2, "#64748b");
  const angle = (yaw * Math.PI) / 180,
    scale = (400 / Math.max(length, width, height, 10)) * zoom;
  function project(p: Point) {
    const x = p[0] - length / 2,
      z = p[2] - width / 2,
      a = x * Math.cos(angle) - z * Math.sin(angle),
      depth = x * Math.sin(angle) + z * Math.cos(angle);
    return {
      x: 320 + a * scale,
      y: 265 + (depth * 0.4 - p[1] * 0.85) * scale,
      depth: depth + p[1] * 0.3,
    };
  }
  const projected = faces
    .map((f) => ({ ...f, p: f.points.map(project) }))
    .sort(
      (a, b) =>
        a.p.reduce((s, v) => s + v.depth, 0) -
        b.p.reduce((s, v) => s + v.depth, 0),
    );
  return (
    <div className="space-y-5">
      {three && (
        <div className="space-y-3">
          <svg
            viewBox="0 0 640 420"
            role="img"
            aria-label="Vista tridimensional conceptual de la pérgola"
            className="w-full rounded-xl bg-slate-100 border"
          >
            <g>
              {projected.map((f, i) => (
                <polygon
                  key={i}
                  points={f.p.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={f.color}
                  stroke="#475569"
                  strokeWidth="1"
                />
              ))}
            </g>
            <text x="16" y="400" fontSize="13">
              {length} × {width} × {height} ft · Vista conceptual
            </text>
          </svg>
          <div className="grid grid-cols-2 gap-4">
            <label className="field">
              Rotación
              <input
                type="range"
                min="0"
                max="360"
                value={yaw}
                onChange={(e) => setYaw(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Acercamiento
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            La vista permite revisar volúmenes y medidas; no constituye un plano
            estructural ni verifica cargas.
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(dimensionLabels).map(([k, label]) => (
          <label className="field" key={k}>
            {label}
            <input
              required
              name={k}
              inputMode="decimal"
              pattern="[0-9]{1,3}([.][0-9]{1,3})?"
              value={String(spec[k as keyof DesignSpec])}
              onChange={(e) => setSpec({ ...spec, [k]: e.target.value })}
            />
          </label>
        ))}
        {Object.entries({
          roof: {
            label: "Techo",
            options: {
              white: "Blanco",
              certified: "Certificado",
              composite: "Composite",
            },
          },
          wall: {
            label: "Pared",
            options: {
              none: "Sin pared",
              panel: "Panel",
              composite: "Composite",
            },
          },
          color: {
            label: "Color de estructura",
            options: { white: "Blanco", bronze: "Bronce", black: "Negro" },
          },
        }).map(([k, { label, options }]) => (
          <label className="field" key={k}>
            {label}
            <select
              name={k}
              value={String(spec[k as keyof DesignSpec])}
              onChange={(e) => setSpec({ ...spec, [k]: e.target.value })}
            >
              {Object.entries(options).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="flex gap-2 items-center">
          <input
            name="permit"
            type="checkbox"
            checked={spec.permit}
            onChange={(e) => setSpec({ ...spec, permit: e.target.checked })}
          />
          Incluir permiso
        </label>
      </div>
    </div>
  );
}
