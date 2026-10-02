"use client";
import { useActionState, useState } from "react";
import { savePricingSettings } from "@/app/app/[companyId]/precios/actions";
import type { ActionState } from "./action-form";
import {
  pricingAreas,
  pricingAreaKeys,
  pricingItemLabels,
  pricingTariffLabels,
  pricingLayerLabels,
  pricingSuppliers,
  pricingColors,
  pricingRules,
  pricingUnits,
  pricingForm,
  pricingSimulation,
  pricingSimulationDefaults,
  type PricingSettings,
  type PricingArea,
} from "@/lib/pricing-settings";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";

const currency = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const componentBlank = {
  nombre: "",
  tipo: "material",
  proveedor: pricingSuppliers[0],
  regla: pricingRules[0],
  cant: "",
  unidad: pricingUnits[0],
  precio: "",
  detalle: "",
};
const profileBlank = {
  medida: "",
  calibre: "",
  color: pricingColors[0],
  proveedor: pricingSuppliers[0],
  largo: "",
  precio: "",
};
function Choice({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!choices.includes(value) && (
          <option value={value}>{value || "—"}</option>
        )}
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
export function PricingSettingsForm({
  companyId,
  version,
  initial,
  readOnly,
  saved,
  restored,
}: {
  companyId: string;
  version: number;
  initial: PricingSettings | null;
  readOnly: boolean;
  saved: boolean;
  restored: boolean;
}) {
  const [f, set] = useState(() => pricingForm(initial));
  const [costs, setCosts] = useState({ ...pricingSimulationDefaults });
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [state, action, pending] = useActionState(
    savePricingSettings.bind(null, companyId),
    {} as ActionState,
  );
  const change = (
    section: "tar" | "ma" | "mk" | "c2",
    key: string,
    value: string,
  ) => set((old) => ({ ...old, [section]: { ...old[section], [key]: value } }));
  const row = (area: PricingArea, index: number, key: string, value: string) =>
    set((old) => ({
      ...old,
      comp: {
        ...old.comp,
        [area]: old.comp[area].map((r, i) =>
          i === index ? { ...r, [key]: value } : r,
        ),
      },
    }));
  const profile = (index: number, key: string, value: string) =>
    set((old) => ({
      ...old,
      cat: old.cat.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    }));
  const numeric = (
    label: string,
    value: string,
    change: (v: string) => void,
    step = "any",
    placeholder?: string,
  ) => (
    <label className="field">
      {label}
      <Input
        type="number"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => change(e.target.value)}
      />
    </label>
  );
  const sim = pricingSimulation(f, costs);
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="payload" value={JSON.stringify(f)} />
      <Feedback
        error={state.error}
        success={
          saved
            ? "Precios guardados."
            : restored
              ? "Valores por defecto restaurados. El historial conserva la configuración anterior."
              : undefined
        }
      />
      <fieldset disabled={readOnly || pending} className="space-y-6 min-w-0">
        <section className="card space-y-4">
          <h2 className="font-semibold">Tarifas de precio al cliente</h2>
          <p className="text-sm text-muted-foreground">
            Tarifas de venta por área, permiso, zona y equipos. El costo de los
            componentes se administra por separado.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(pricingTariffLabels).map(([key, label]) => (
              <div key={key}>
                {numeric(
                  label,
                  f.tar[key] ?? "",
                  (v) => change("tar", key, v),
                  "1",
                )}
              </div>
            ))}
          </div>
        </section>
        <div className="card">
          <h2 className="font-semibold">Tu costo y materiales (por área)</h2>
          <p className="text-sm text-muted-foreground">
            Componentes, proveedores y reglas de cantidad. Estos costos no
            cambian el precio al cliente.
          </p>
        </div>
        {(Object.entries(pricingAreas) as [PricingArea, string][]).map(
          ([area, label]) => (
            <section className="card space-y-4" key={area}>
              <h2 className="font-semibold">{label}</h2>
              {f.comp[area].map((r, i) => (
                <div key={i} className="rounded-xl border p-4 space-y-3">
                  <h3 className="text-sm font-semibold">
                    {label} · Componente {i + 1}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="field">
                      Componente · {label} {i + 1}
                      <Input
                        value={r.nombre}
                        onChange={(e) => row(area, i, "nombre", e.target.value)}
                      />
                    </label>
                    <Choice
                      label={`Proveedor · ${label} ${i + 1}`}
                      value={r.proveedor}
                      choices={pricingSuppliers}
                      onChange={(v) => row(area, i, "proveedor", v)}
                    />
                    <Choice
                      label={`Regla · ${label} ${i + 1}`}
                      value={r.regla}
                      choices={pricingRules}
                      onChange={(v) => row(area, i, "regla", v)}
                    />
                    {numeric(
                      `Cantidad · ${label} ${i + 1}`,
                      r.cant,
                      (v) => row(area, i, "cant", v),
                      "0.01",
                      "—",
                    )}
                    <Choice
                      label={`Unidad · ${label} ${i + 1}`}
                      value={r.unidad}
                      choices={pricingUnits}
                      onChange={(v) => row(area, i, "unidad", v)}
                    />
                    {numeric(
                      `Costo USD · ${label} ${i + 1}`,
                      r.precio,
                      (v) => row(area, i, "precio", v),
                      "0.01",
                      "0.00",
                    )}
                    <label className="field sm:col-span-2">
                      Detalle · {label} {i + 1}
                      <Input
                        value={r.detalle}
                        onChange={(e) =>
                          row(area, i, "detalle", e.target.value)
                        }
                      />
                    </label>
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        set((old) => ({
                          ...old,
                          comp: {
                            ...old.comp,
                            [area]: old.comp[area].filter((_, n) => n !== i),
                          },
                        }))
                      }
                    >
                      Quitar componente · {label} {i + 1}
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={f.comp[area].length >= 100}
                  onClick={() =>
                    set((old) => ({
                      ...old,
                      comp: {
                        ...old.comp,
                        [area]: [...old.comp[area], { ...componentBlank }],
                      },
                    }))
                  }
                >
                  Agregar componente · {label}
                </Button>
              )}
              {area === "estructura" && (
                <div className="space-y-4 border-t pt-5">
                  <h3 className="font-semibold">
                    Catálogo de perfiles (columnas y vigas)
                  </h3>
                  {f.cat.map((r, i) => (
                    <div key={i} className="rounded-xl border p-4 space-y-3">
                      <h4 className="text-sm font-semibold">Perfil {i + 1}</h4>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <label className="field">
                          Medida · Perfil {i + 1}
                          <Input
                            value={r.medida}
                            onChange={(e) =>
                              profile(i, "medida", e.target.value)
                            }
                          />
                        </label>
                        <label className="field">
                          Calibre · Perfil {i + 1}
                          <Input
                            value={r.calibre}
                            onChange={(e) =>
                              profile(i, "calibre", e.target.value)
                            }
                          />
                        </label>
                        <Choice
                          label={`Color · Perfil ${i + 1}`}
                          value={r.color}
                          choices={pricingColors}
                          onChange={(v) => profile(i, "color", v)}
                        />
                        <Choice
                          label={`Proveedor · Perfil ${i + 1}`}
                          value={r.proveedor}
                          choices={pricingSuppliers}
                          onChange={(v) => profile(i, "proveedor", v)}
                        />
                        {numeric(
                          `Largo ft · Perfil ${i + 1}`,
                          r.largo,
                          (v) => profile(i, "largo", v),
                          "0.01",
                        )}
                        {numeric(
                          `Costo USD · Perfil ${i + 1}`,
                          r.precio,
                          (v) => profile(i, "precio", v),
                          "0.01",
                        )}
                      </div>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            set((old) => ({
                              ...old,
                              cat: old.cat.filter((_, n) => n !== i),
                            }))
                          }
                        >
                          Quitar perfil {i + 1}
                        </Button>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={f.cat.length >= 500}
                      onClick={() =>
                        set((old) => ({
                          ...old,
                          cat: [...old.cat, { ...profileBlank }],
                        }))
                      }
                    >
                      Agregar medida
                    </Button>
                  )}
                </div>
              )}
            </section>
          ),
        )}
        <details className="card space-y-4">
          <summary className="cursor-pointer font-semibold">
            Referencia interna · Márgenes y simulador
          </summary>
          <p className="text-sm text-muted-foreground">
            Referencia del modelo anterior. Cada partida hereda el porcentaje de
            su área; puedes indicar uno distinto. El simulador no se guarda ni
            cambia el precio al cliente.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.entries(pricingAreas) as [PricingArea, string][]).map(
              ([area, label]) => (
                <div key={area} className="border rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold">{label}</h3>
                  {numeric(
                    `Margen del área · ${label} · %`,
                    f.ma[area] ?? "",
                    (v) => change("ma", area, v),
                    "1",
                  )}
                  {pricingAreaKeys[area].map((key) => (
                    <div key={key}>
                      {numeric(
                        `${pricingItemLabels[key]} · %`,
                        f.mk[key] ?? "",
                        (v) => change("mk", key, v),
                        "1",
                        `Hereda ${f.ma[area] ?? "0"}%`,
                      )}
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
          <h3 className="font-semibold">Simulador de rentabilidad</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2">Partida</th>
                  <th className="p-2">Costo típico USD</th>
                  <th className="p-2">Venta</th>
                  <th className="p-2">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {sim.rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="p-2">
                      {
                        pricingItemLabels[
                          r.key as keyof typeof pricingItemLabels
                        ]
                      }
                    </td>
                    <td className="p-2">
                      <Input
                        aria-label={`Costo típico · ${pricingItemLabels[r.key as keyof typeof pricingItemLabels]}`}
                        type="number"
                        step="1"
                        value={costs[r.key]}
                        onChange={(e) =>
                          setCosts((old) => ({
                            ...old,
                            [r.key]: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td className="p-2 tabular-nums">{currency(r.sale)}</td>
                    <td className="p-2 tabular-nums">{currency(r.gain)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t font-semibold">
                <tr>
                  <td className="p-2">Total proyecto</td>
                  <td className="p-2">{currency(sim.cost)}</td>
                  <td className="p-2">{currency(sim.sale)}</td>
                  <td className="p-2">{currency(sim.gain)}</td>
                </tr>
                <tr>
                  <td className="p-2" colSpan={3}>
                    Margen sobre venta
                  </td>
                  <td className="p-2">{sim.margin}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </details>
        <details className="card space-y-4">
          <summary className="cursor-pointer font-semibold">
            Avanzado · Zona y demanda
          </summary>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(pricingLayerLabels).map(([key, label]) => (
              <div key={key}>
                {numeric(
                  label,
                  f.c2[key] ?? "",
                  (v) => change("c2", key, v),
                  "1",
                )}
              </div>
            ))}
          </div>
        </details>
        {!readOnly && (
          <div className="card flex flex-wrap gap-3">
            <SubmitButton>Guardar precios</SubmitButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRestore(true)}
            >
              Restaurar valores por defecto
            </Button>
            {confirmRestore && (
              <div
                className="w-full space-y-3"
                role="group"
                aria-label="Confirmar restauración"
              >
                <p role="alert">
                  ¿Restaurar los valores por defecto? El historial conservará la
                  configuración actual.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" name="operation" value="restore">
                    Confirmar restauración
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmRestore(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </fieldset>
    </form>
  );
}
