"use client";
import { useRef, useState } from "react";
import {
  designWalls,
  maxDesignWalls,
  wallModels,
  type DesignSpec,
  type DesignWall,
} from "@/lib/designs";

export function DesignWalls({ initial }: { initial: DesignSpec }) {
  const [walls, setWalls] = useState(() =>
    designWalls(initial).map((wall, key) => ({ ...wall, key })),
  );
  const sequence = useRef(walls.length);
  const update = (key: number, change: Partial<DesignWall>) =>
    setWalls((current) =>
      current.map((wall) => (wall.key === key ? { ...wall, ...change } : wall)),
    );
  return (
    <section className="space-y-4" aria-label="Paredes de privacidad">
      <h2 className="font-semibold">Paredes de privacidad</h2>
      <p className="text-sm text-muted-foreground">
        Cada pared conserva sus medidas, modelo y color. Puede incluirse sin
        pérgola.
      </p>
      <input
        type="hidden"
        name="walls"
        value={JSON.stringify(
          walls.map(({ length, height, model, color }) => ({
            length,
            height,
            model,
            color,
          })),
        )}
      />
      {!walls.length && <p>Sin paredes.</p>}
      {walls.map((wall, index) => (
        <fieldset key={wall.key} className="rounded-xl border p-4 space-y-3">
          <legend className="px-2 font-medium">Pared {index + 1}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["length", "Largo"],
                ["height", "Alto"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label} de pared {index + 1} · ft
                <input
                  required
                  inputMode="decimal"
                  pattern="[0-9]{1,3}([.][0-9]{1,3})?"
                  value={wall[key]}
                  onChange={(e) => update(wall.key, { [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="field">
              Modelo de pared {index + 1}
              <select
                value={wall.model}
                onChange={(e) =>
                  update(wall.key, {
                    model: e.target.value as DesignWall["model"],
                  })
                }
              >
                {Object.entries(wallModels).map(([key, text]) => (
                  <option key={key} value={key}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Color de pared {index + 1}
              <input
                value={wall.color}
                maxLength={80}
                placeholder="Blanco, negro, madera…"
                onChange={(e) => update(wall.key, { color: e.target.value })}
              />
            </label>
          </div>
          <p className="text-sm">
            Área:{" "}
            {((Number(wall.length) || 0) * (Number(wall.height) || 0)).toFixed(
              2,
            )}{" "}
            ft²
          </p>
          <button
            type="button"
            className="underline"
            aria-label={`Quitar pared ${index + 1}`}
            onClick={() =>
              setWalls((current) => current.filter((w) => w.key !== wall.key))
            }
          >
            Quitar pared
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="underline"
        disabled={walls.length >= maxDesignWalls}
        onClick={() => {
          const key = sequence.current++;
          setWalls((current) => [
            ...current,
            { key, length: "0", height: "0", model: "composite", color: "" },
          ]);
        }}
      >
        Agregar pared
      </button>
      {walls.length >= maxDesignWalls && (
        <p className="text-sm">Máximo {maxDesignWalls} paredes por diseño.</p>
      )}
    </section>
  );
}
