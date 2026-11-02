"use client";
import { useId, useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventoryForm } from "./form";
import { InventoryLookup } from "./lookup";
import type { Master, Choices, InventoryContext } from "@/lib/inventory";
import {
  catalogKey,
  maxCombinations,
  normalizeVariantPrice,
  productAxes,
  variantCombinations,
  variantKey,
} from "@/lib/inventory-variants";
import {
  ProductCharacteristics,
  type AxisRow,
} from "./product-characteristics";
type DraftVariant = {
  id?: string;
  barcode: string;
  price: string;
  active: boolean;
  use: boolean;
};
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
  const [commercial, setCommercial] = useState(old?.commercial);
  const [priceScope, setPriceScope] = useState("all"),
    [bulkPrice, setBulkPrice] = useState(""),
    [priceNotice, setPriceNotice] = useState("");
  const priceHelpId = useId();
  const [originalAxes] = useState(() =>
    productAxes(existing, old?.attributeLayout ?? []),
  );
  const [axes, setAxes] = useState<AxisRow[]>(() =>
    originalAxes.map((a, i) => ({ ...a, key: String(i), entry: "" })),
  );
  const [draft, setDraft] = useState<Record<string, DraftVariant>>(() =>
    Object.fromEntries(
      existing.map((v) => [
        variantKey(v.options),
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
  const layout = axes.map((a) => ({
    name:
      choices.attributes.find((c) => catalogKey(c.name) === catalogKey(a.name))
        ?.name ?? a.name.trim(),
    values: a.values,
  }));
  const {
    count: size,
    duplicate,
    incomplete,
    combinations,
  } = variantCombinations(layout);
  const pending = axes.some((a) => a.entry.trim());
  const previousOptions = new Map(
    originalAxes.map((a) => [
      catalogKey(a.name),
      new Set(a.values.map(catalogKey)),
    ]),
  );
  const inactive = new Map(
    choices.attributes.map((a) => [
      catalogKey(a.name),
      new Set(
        a.options.filter((o) => !o.active).map((o) => catalogKey(o.name)),
      ),
    ]),
  );
  const unavailable = (o: Record<string, string>) =>
    Object.entries(o).some(([name, value]) =>
      inactive.get(catalogKey(name))?.has(catalogKey(value)),
    );
  const initial: DraftVariant = {
    barcode: "",
    price: "",
    active: true,
    use: true,
  };
  const get = (o: Record<string, string>, current = draft) => {
    const saved = current[variantKey(o)];
    if (saved) return saved;
    const previouslyOmitted =
      !!row &&
      Object.entries(o).every(([name, value]) =>
        previousOptions.get(catalogKey(name))?.has(catalogKey(value)),
      );
    return { ...initial, use: !previouslyOmitted && !unavailable(o) };
  };
  const change = (o: Record<string, string>, patch: Partial<DraftVariant>) =>
    setDraft((d) => ({
      ...d,
      [variantKey(o)]: { ...get(o, d), ...patch },
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
  const price = normalizeVariantPrice(bulkPrice);
  const priceTargets = variants.filter(
    (v) => priceScope === "all" || v.price == null,
  );
  const priceHint = priceTargets.length
    ? "El precio se aplica a las variantes incluidas. Después puedes ajustar cada una por separado."
    : "No hay variantes incluidas que coincidan con la opción elegida.";
  function applyPrice() {
    if (!ctx.priceManage || price === null || !priceTargets.length) return;
    setDraft((current) => {
      const updated = { ...current };
      for (const { options } of priceTargets) {
        updated[variantKey(options)] = { ...get(options, current), price };
      }
      return updated;
    });
    const count = priceTargets.length;
    setPriceNotice(
      `Se aplicó US$ ${price} a ${count} ${count === 1 ? "variante" : "variantes"}. Guarda el producto para confirmar.`,
    );
  }
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
        !name.trim() ||
        !variants.length ||
        missing ||
        incomplete ||
        duplicate ||
        pending ||
        size > maxCombinations
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
          attributeLayout: layout,
          variants,
          ...(ctx.commercialView && commercial?.id !== old?.commercial?.id
            ? { commercialId: commercial?.id ?? null }
            : {}),
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
      {ctx.commercialView && (
        <div>
          <InventoryLookup
            company={company}
            type="comerciales"
            label="Vincular con un producto del catálogo comercial (opcional)"
            onSelect={setCommercial}
          />
          {commercial && (
            <button
              className="text-sm underline"
              type="button"
              onClick={() => setCommercial(undefined)}
            >
              {commercial.name} · Quitar vínculo
            </button>
          )}
        </div>
      )}
      <ProductCharacteristics
        axes={axes}
        setAxes={setAxes}
        choices={choices.attributes}
        existing={existing}
      />
      <section
        aria-label="Variantes"
        className="grid min-w-0 gap-4 rounded-xl border border-border p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">
            <Layers size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold">Variantes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada combinación tiene su propio código, precio y existencias.
              Desmarca las que no vendes.
            </p>
          </div>
        </div>
        {ctx.priceManage && combinations.length > 0 && (
          <div
            role="group"
            aria-label="Precio general de las variantes"
            className="grid gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:p-4"
          >
            <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
              <label className="field">
                Poner precio a
                <select
                  value={priceScope}
                  onChange={(e) => {
                    setPriceScope(e.target.value);
                    setPriceNotice("");
                  }}
                >
                  <option value="all">Todas las variantes</option>
                  <option value="missing">Solo variantes sin precio</option>
                </select>
              </label>
              <label className="field sm:w-40">
                Precio general (US$)
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  autoComplete="off"
                  value={bulkPrice}
                  aria-describedby={priceHelpId}
                  aria-invalid={!!bulkPrice && price === null}
                  onChange={(e) => {
                    setBulkPrice(e.target.value);
                    setPriceNotice("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      applyPrice();
                    }
                  }}
                />
              </label>
              <Button
                type="button"
                disabled={price === null || !priceTargets.length}
                onClick={applyPrice}
              >
                Aplicar
              </Button>
            </div>
            <p
              id={priceHelpId}
              role="status"
              className="text-sm text-muted-foreground"
            >
              {bulkPrice && price === null
                ? "Usa hasta 12 dígitos enteros y dos decimales, sin signo ni separadores de miles."
                : priceNotice || priceHint}
            </p>
          </div>
        )}
        {size > maxCombinations ? (
          <p role="status">
            Reduce las opciones para trabajar con un máximo de 200
            combinaciones.
          </p>
        ) : duplicate ? (
          <p role="status">
            Escribe un nombre distinto para cada característica.
          </p>
        ) : incomplete ? (
          <p role="status">
            Completa el nombre y añade al menos un valor a cada característica.
          </p>
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
                      layout.map((axis) => o[axis.name]).join(" · ") ||
                      name ||
                      "Variante única";
                  return (
                    <tr key={variantKey(o)}>
                      <td>
                        <input
                          aria-label={"Incluir " + label}
                          type="checkbox"
                          disabled={!!v.id || unavailable(o)}
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
        {pending && (
          <p role="status" className="text-sm text-muted-foreground">
            Pulsa Intro o el botón + para añadir el valor que estás escribiendo.
          </p>
        )}
        {!!combinations.length && (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {variants.length} de {size}{" "}
            {size === 1 ? "combinación incluida" : "combinaciones incluidas"}.
          </p>
        )}
      </section>
    </InventoryForm>
  );
}
