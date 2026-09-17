"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveProduct } from "@/app/app/[companyId]/productos/actions";
import type { CommercialState } from "@/app/app/[companyId]/leads/actions";
import { priceBases, type ProductInput } from "@/lib/commercial";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function ProductForm({
  companyId,
  id,
  version,
  initial,
  readOnly,
  saved,
}: {
  companyId: string;
  id: string;
  version: number;
  initial: ProductInput;
  readOnly: boolean;
  saved: boolean;
}) {
  const [v, set] = useState(initial),
    [state, action] = useActionState(
      saveProduct.bind(null, companyId),
      {} as CommercialState,
    );
  const patchGroup = (
    i: number,
    patch: Partial<ProductInput["options"][number]>,
  ) =>
    set((old) => ({
      ...old,
      options: old.options.map((g, n) => (n === i ? { ...g, ...patch } : g)),
    }));
  return (
    <form action={action} className="card max-w-5xl space-y-7">
      <Feedback
        error={state.error}
        success={saved ? "Producto guardado." : undefined}
      />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="payload" value={JSON.stringify(v)} />
      <fieldset disabled={readOnly} className="space-y-7 min-w-0">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="field md:col-span-2">
            Nombre *
            <Input
              required
              minLength={2}
              maxLength={255}
              value={v.name}
              onChange={(e) => set({ ...v, name: e.target.value })}
            />
          </label>
          <label className="field">
            Categoría *
            <Input
              required
              maxLength={128}
              value={v.category}
              onChange={(e) => set({ ...v, category: e.target.value })}
            />
          </label>
          <label className="field">
            Base de precio
            <select
              value={v.base}
              onChange={(e) =>
                set({ ...v, base: e.target.value as ProductInput["base"] })
              }
            >
              {Object.entries(priceBases).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Precio base (USD) *
            <Input
              required
              inputMode="decimal"
              pattern="[0-9]{1,9}([.][0-9]{1,2})?"
              value={v.unit_price}
              onChange={(e) => set({ ...v, unit_price: e.target.value })}
            />
            <small>
              {v.base === "manual"
                ? "El precio final se define al elaborar el estimado."
                : "Hasta dos decimales. Las medidas se aplican en el estimado."}
            </small>
          </label>
          <label className="field">
            Disponibilidad
            <select
              value={String(v.active)}
              onChange={(e) => set({ ...v, active: e.target.value === "true" })}
            >
              <option value="true">Activo</option>
              <option value="false">Archivado</option>
            </select>
            <small>Los productos archivados conservan su historial.</small>
          </label>
        </div>
        <section className="border-t border-border pt-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-semibold">Especificaciones</h2>
              <p className="text-sm text-muted-foreground">
                Datos adicionales que no cambian el precio.
              </p>
            </div>
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                disabled={v.specs.length >= 30}
                onClick={() =>
                  set({ ...v, specs: [...v.specs, { label: "", unit: "" }] })
                }
              >
                Agregar especificación
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {v.specs.map((s, i) => (
              <div
                key={i}
                className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]"
              >
                <label className="field">
                  Nombre
                  <Input
                    required
                    maxLength={120}
                    value={s.label}
                    onChange={(e) =>
                      set({
                        ...v,
                        specs: v.specs.map((x, n) =>
                          n === i ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label className="field">
                  Unidad
                  <Input
                    maxLength={24}
                    value={s.unit}
                    onChange={(e) =>
                      set({
                        ...v,
                        specs: v.specs.map((x, n) =>
                          n === i ? { ...x, unit: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Quitar especificación ${i + 1}`}
                    onClick={() =>
                      set({ ...v, specs: v.specs.filter((_, n) => n !== i) })
                    }
                  >
                    Quitar
                  </Button>
                )}
              </div>
            ))}
            {!v.specs.length && (
              <p className="text-sm text-muted-foreground">
                Sin especificaciones adicionales.
              </p>
            )}
          </div>
        </section>
        <section className="border-t border-border pt-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-semibold">Opciones con costo</h2>
              <p className="text-sm text-muted-foreground">
                Acabados, variantes y sus ajustes de precio.
              </p>
            </div>
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                disabled={v.options.length >= 20}
                onClick={() =>
                  set({
                    ...v,
                    options: [
                      ...v.options,
                      {
                        label: "",
                        choices: [{ label: "", add: "0.00", addType: "base" }],
                      },
                    ],
                  })
                }
              >
                Agregar opción
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-5">
            {v.options.map((g, i) => (
              <div
                className="rounded-xl border border-border p-4 space-y-4"
                key={i}
              >
                <div className="flex items-end gap-3">
                  <label className="field flex-1">
                    Nombre de la opción
                    <Input
                      required
                      maxLength={120}
                      value={g.label}
                      onChange={(e) => patchGroup(i, { label: e.target.value })}
                    />
                  </label>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Quitar opción ${i + 1}`}
                      onClick={() =>
                        set({
                          ...v,
                          options: v.options.filter((_, n) => n !== i),
                        })
                      }
                    >
                      Quitar
                    </Button>
                  )}
                </div>
                {g.choices.map((c, j) => (
                  <div
                    key={j}
                    className="grid gap-3 items-end sm:grid-cols-[2fr_1fr_1fr_auto]"
                  >
                    <label className="field">
                      Elección
                      <Input
                        required
                        maxLength={120}
                        value={c.label}
                        onChange={(e) =>
                          patchGroup(i, {
                            choices: g.choices.map((x, n) =>
                              n === j ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      Ajuste
                      <Input
                        required
                        inputMode="decimal"
                        pattern="-?[0-9]{1,9}([.][0-9]{1,2})?"
                        value={c.add}
                        onChange={(e) =>
                          patchGroup(i, {
                            choices: g.choices.map((x, n) =>
                              n === j ? { ...x, add: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      Aplicación
                      <select
                        value={c.addType}
                        onChange={(e) =>
                          patchGroup(i, {
                            choices: g.choices.map((x, n) =>
                              n === j
                                ? {
                                    ...x,
                                    addType: e.target.value as typeof c.addType,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="base">Por medida</option>
                        <option value="flat">Importe fijo</option>
                        <option value="percent">Porcentaje</option>
                      </select>
                    </label>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={g.choices.length === 1}
                        aria-label={`Quitar elección ${j + 1} de opción ${i + 1}`}
                        onClick={() =>
                          patchGroup(i, {
                            choices: g.choices.filter((_, n) => n !== j),
                          })
                        }
                      >
                        Quitar
                      </Button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={g.choices.length >= 30}
                    onClick={() =>
                      patchGroup(i, {
                        choices: [
                          ...g.choices,
                          { label: "", add: "0.00", addType: "base" },
                        ],
                      })
                    }
                  >
                    Agregar elección
                  </Button>
                )}
              </div>
            ))}
            {!v.options.length && (
              <p className="text-sm text-muted-foreground">
                Sin opciones con costo.
              </p>
            )}
          </div>
        </section>
      </fieldset>
      <div className="flex flex-wrap gap-3 border-t border-border pt-5">
        {!readOnly && (
          <SubmitButton>
            {version ? "Guardar cambios" : "Crear producto"}
          </SubmitButton>
        )}
        <Button asChild variant="outline">
          <Link href={`/app/${companyId}/productos`}>Volver al catálogo</Link>
        </Button>
      </div>
    </form>
  );
}
