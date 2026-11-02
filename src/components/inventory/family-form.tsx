"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { InventoryForm } from "./form";
import type { Master, Choices, InventoryContext } from "@/lib/inventory";
type Axis = { key: string; name: string; values: string };
type DraftVariant = {
  id?: string;
  barcode: string;
  price: string;
  active: boolean;
  use: boolean;
};
const signature = (map: Record<string, string>) =>
  JSON.stringify(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
export function FamilyForm({
  company,
  ctx,
  choices,
  row,
  request,
}: {
  company: string;
  ctx: InventoryContext;
  choices: Choices;
  row?: Master;
  request: string;
}) {
  const old = row?.data,
    existing = old?.variants ?? [];
  const [name, setName] = useState(row?.name ?? ""),
    [category, setCategory] = useState(old?.category ?? ""),
    [unit, setUnit] = useState(old?.unit ?? "UNIDAD");
  const [description, setDescription] = useState(old?.description ?? ""),
    [active, setActive] = useState(old?.active ?? true);
  const [axes, setAxes] = useState<Axis[]>(() => {
    const map = new Map<string, Set<string>>();
    for (const v of existing)
      for (const [k, x] of Object.entries(v.options)) {
        if (!map.has(k)) map.set(k, new Set());
        map.get(k)!.add(x);
      }
    return Array.from(map, ([name, vals], i) => ({
      key: String(i),
      name,
      values: [...vals].join(", "),
    }));
  });
  const [draft, setDraft] = useState<Record<string, DraftVariant>>(() =>
    Object.fromEntries(
      existing.map((v) => [
        signature(v.options),
        {
          id: v.id,
          barcode: v.barcode ?? "",
          price: v.price == null ? "" : String(v.price),
          active: v.active,
          use: true,
        },
      ]),
    ),
  );
  const normalized = axes.map((a) => ({
    name: a.name.trim(),
    values: [
      ...new Set(
        a.values
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
  }));
  const invalid =
    normalized.some((a) => !a.name || !a.values.length) ||
    new Set(normalized.map((a) => a.name.toLocaleLowerCase())).size !==
      normalized.length;
  const size = normalized.reduce((n, a) => n * a.values.length, 1);
  let combinations: Record<string, string>[] = [{}];
  if (invalid || size > 200) combinations = [];
  else
    for (const a of normalized)
      combinations = combinations.flatMap((o) =>
        a.values.map((val) => ({ ...o, [a.name]: val })),
      );
  const initial: DraftVariant = {
    barcode: "",
    price: "",
    active: true,
    use: true,
  };
  const get = (o: Record<string, string>) => draft[signature(o)] ?? initial;
  const change = (o: Record<string, string>, patch: Partial<DraftVariant>) =>
    setDraft((d) => ({
      ...d,
      [signature(o)]: { ...(d[signature(o)] ?? initial), ...patch },
    }));
  const variants = combinations
    .filter((o) => get(o).use)
    .map((o) => {
      const v = get(o);
      return {
        id: v.id,
        options: o,
        active: v.active,
        barcode: v.barcode,
        ...(ctx.priceManage ? { price: v.price || null } : {}),
      };
    });
  const missing = existing.some((v) => !variants.some((x) => x.id === v.id));
  const updateAxis = (key: string, patch: Partial<Axis>) =>
    setAxes((prior) =>
      prior.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    );
  return (
    <InventoryForm
      company={company}
      operation="family"
      slug="productos"
      request={request}
      id={row?.id}
      version={old?.version}
      submit={row ? "Guardar producto" : "Crear producto"}
      disabled={
        !name.trim() || !variants.length || missing || invalid || size > 200
      }
    >
      <input
        type="hidden"
        name="data"
        value={JSON.stringify({
          name,
          category,
          unit,
          description,
          active,
          variants,
        })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Nombre
          <Input
            required
            maxLength={190}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          Categoría
          <Input
            list="inv-categories"
            maxLength={190}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Elige o escribe una nueva"
          />
        </label>
        <datalist id="inv-categories">
          {choices.categories.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        <label className="field">
          Unidad
          <select
            value={unit}
            disabled={!!row}
            onChange={(e) => setUnit(e.target.value)}
          >
            {["UNIDAD", "PAR", "JUEGO", "KG", "LITRO", "METRO"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Producto activo
        </label>
      </div>
      <label className="field">
        Descripción
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <fieldset className="grid gap-3">
        <legend className="font-semibold">Características</legend>
        <datalist id="inv-attributes">
          {choices.attributes.map((a) => (
            <option key={a.name} value={a.name} />
          ))}
        </datalist>
        {axes.map((a) => (
          <div key={a.key} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <label className="field">
              Característica
              <Input
                list="inv-attributes"
                placeholder="Color"
                value={a.name}
                onChange={(e) => updateAxis(a.key, { name: e.target.value })}
              />
            </label>
            <label className="field">
              Opciones separadas por comas
              <Input
                placeholder="Negro, Rojo"
                value={a.values}
                onChange={(e) => updateAxis(a.key, { values: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">
                {choices.attributes
                  .find((x) => x.name === a.name)
                  ?.options.filter((o) => o.active)
                  .map((o) => o.name)
                  .join(" · ")}
              </span>
            </label>
            <button
              type="button"
              className="underline"
              onClick={() => setAxes((s) => s.filter((x) => x.key !== a.key))}
            >
              Quitar característica
            </button>
          </div>
        ))}
        {axes.length < 6 && (
          <button
            type="button"
            className="justify-self-start underline"
            onClick={() =>
              setAxes((a) => [
                ...a,
                { key: crypto.randomUUID(), name: "", values: "" },
              ])
            }
          >
            Añadir característica
          </button>
        )}
      </fieldset>
      <fieldset>
        <legend className="font-semibold">Variantes</legend>
        {size > 200 ? (
          <p>
            Reduce las opciones para trabajar con un máximo de 200
            combinaciones.
          </p>
        ) : invalid ? (
          <p>Completa el nombre y las opciones de cada característica.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Incluir</th>
                  <th>Variante</th>
                  <th>Código de barras</th>
                  {ctx.priceManage && <th>Precio de venta</th>}
                  <th>Activa</th>
                </tr>
              </thead>
              <tbody>
                {combinations.map((o) => {
                  const v = get(o),
                    label =
                      Object.values(o).join(" · ") || name || "Variante única";
                  return (
                    <tr key={signature(o)}>
                      <td>
                        <input
                          aria-label={"Incluir " + label}
                          type="checkbox"
                          disabled={!!v.id}
                          checked={v.use}
                          onChange={(e) => change(o, { use: e.target.checked })}
                        />
                      </td>
                      <td>{label}</td>
                      <td>
                        <Input
                          aria-label={"Código de barras de " + label}
                          value={v.barcode}
                          maxLength={128}
                          onChange={(e) =>
                            change(o, { barcode: e.target.value })
                          }
                        />
                      </td>
                      {ctx.priceManage && (
                        <td>
                          <Input
                            aria-label={"Precio de " + label}
                            type="number"
                            min="0"
                            step=".01"
                            placeholder="Pendiente"
                            value={v.price}
                            onChange={(e) =>
                              change(o, { price: e.target.value })
                            }
                          />
                        </td>
                      )}
                      <td>
                        <input
                          aria-label={"Activa " + label}
                          type="checkbox"
                          checked={v.active}
                          onChange={(e) =>
                            change(o, { active: e.target.checked })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {missing && (
          <p role="alert">
            Conserva las combinaciones existentes. Puedes desactivar las que ya
            no usas.
          </p>
        )}
      </fieldset>
    </InventoryForm>
  );
}
