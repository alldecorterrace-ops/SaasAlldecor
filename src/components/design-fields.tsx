"use client";
import { useState } from "react";
import { dimensionLabels, type DesignSpec } from "@/lib/designs";
import { DesignWalls } from "./design-walls";
import { Design3DFields } from "./design-3d-fields";

export function DesignFields({
  initial,
  three,
}: {
  initial: DesignSpec;
  three: boolean;
}) {
  // The 3D editor keeps its existing geometry contract until that workflow is audited.
  return three ? (
    <Design3DFields initial={initial} three />
  ) : (
    <PlanarFields initial={initial} />
  );
}
function PlanarFields({ initial }: { initial: DesignSpec }) {
  const [spec, setSpec] = useState(initial);
  const roofEnabled = spec.roof_enabled !== false;
  return (
    <div className="space-y-5">
      <label className="flex gap-2 items-center">
        <input
          type="checkbox"
          name="roof_enabled"
          checked={roofEnabled}
          onChange={(e) => setSpec({ ...spec, roof_enabled: e.target.checked })}
        />
        Incluir pérgola
      </label>
      <input type="hidden" name="wall" value="none" />
      <input type="hidden" name="wall_length" value="0" />
      <input type="hidden" name="wall_height" value="0" />
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(dimensionLabels)
          .filter(([k]) => !k.startsWith("wall_"))
          .map(([k, label]) =>
            !roofEnabled && ["length", "width", "height"].includes(k) ? (
              <input
                key={k}
                type="hidden"
                name={k}
                value={String(spec[k as keyof DesignSpec])}
              />
            ) : (
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
            ),
          )}
        {Object.entries({
          roof: {
            label: "Techo",
            options: {
              white: "Blanco",
              certified: "Certificado",
              composite: "Composite",
            },
          },
          color: {
            label: "Color de estructura",
            options: { white: "Blanco", bronze: "Bronce", black: "Negro" },
          },
        }).map(([k, { label, options }]) =>
          roofEnabled ? (
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
          ) : (
            <input
              key={k}
              type="hidden"
              name={k}
              value={String(spec[k as keyof DesignSpec])}
            />
          ),
        )}
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
      <DesignWalls initial={initial} />
    </div>
  );
}
