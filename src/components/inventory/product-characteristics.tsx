import { useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import type { Choices, Variant } from "@/lib/inventory";
import {
  catalogKey,
  maxAxes,
  type ProductAxis,
} from "@/lib/inventory-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AxisRow = ProductAxis & { key: string; entry: string };
type Attribute = Choices["attributes"][number];

function ValuePicker({
  axis,
  options,
  change,
}: {
  axis: AxisRow;
  options: Attribute["options"];
  change: (patch: Partial<AxisRow>) => void;
}) {
  const id = useId(),
    field = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState(-1);
  const typed = axis.entry.trim(),
    key = catalogKey(typed);
  const used = new Set(axis.values.map(catalogKey));
  const matching = options.find((o) => catalogKey(o.name) === key);
  const values = new Map(
    options.filter((o) => o.active).map((o) => [catalogKey(o.name), o.name]),
  );
  for (const value of axis.values) values.set(catalogKey(value), value);
  const suggestions = [...values.values()].filter((value) =>
    catalogKey(value).includes(key),
  );
  const selectable = suggestions.flatMap((value, i) =>
    used.has(catalogKey(value)) ? [] : [i],
  );
  const canAdd = !!key && !used.has(key) && matching?.active !== false;
  const expanded = open && suggestions.length > 0;
  function add(value: string) {
    const clean = value.trim(),
      valueKey = catalogKey(clean);
    const known = options.find((o) => catalogKey(o.name) === valueKey);
    if (!valueKey || used.has(valueKey) || known?.active === false) return;
    change({ values: [...axis.values, known?.name ?? clean], entry: "" });
    setOpen(false);
    setCursor(-1);
    field.current?.focus();
  }
  return (
    <div
      className="relative min-w-0 max-w-full"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className="flex items-center gap-1">
        <div className="relative w-44 max-w-full">
          <Input
            ref={field}
            role="combobox"
            aria-label={`Otro valor de ${axis.name || "la característica"}`}
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? id : undefined}
            aria-activedescendant={
              expanded && cursor >= 0 ? id + "-" + cursor : undefined
            }
            placeholder="Otro valor…"
            maxLength={100}
            className="pr-10"
            value={axis.entry}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              change({ entry: e.target.value });
              setOpen(true);
              setCursor(-1);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setOpen(true);
                if (selectable.length) {
                  const index = selectable.indexOf(cursor);
                  setCursor(
                    e.key === "ArrowDown"
                      ? selectable[(index + 1) % selectable.length]
                      : selectable[
                          index <= 0 ? selectable.length - 1 : index - 1
                        ],
                  );
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                setCursor(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (expanded && cursor >= 0 && suggestions[cursor])
                  add(suggestions[cursor]);
                else if (canAdd) add(typed);
              }
            }}
          />
          <button
            type="button"
            aria-label={`Mostrar valores sugeridos de ${axis.name || "la característica"}`}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              field.current?.focus();
              setOpen(!expanded);
              setCursor(-1);
            }}
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {expanded && (
            <ul
              id={id}
              role="listbox"
              aria-multiselectable="true"
              aria-label="Valores sugeridos"
              className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-lg"
            >
              {suggestions.map((value, i) => (
                <li
                  key={catalogKey(value)}
                  id={id + "-" + i}
                  role="option"
                  aria-selected={used.has(catalogKey(value))}
                  aria-disabled={used.has(catalogKey(value))}
                  ref={(node) => {
                    if (node && cursor === i)
                      node.scrollIntoView({ block: "nearest" });
                  }}
                  className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${used.has(catalogKey(value)) ? "text-muted-foreground" : "cursor-pointer hover:bg-accent"} ${cursor === i ? "bg-accent text-primary" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(value)}
                >
                  {value}
                  {used.has(catalogKey(value)) && (
                    <Check size={15} aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={!canAdd}
          aria-label={`Añadir valor a ${axis.name || "la característica"}`}
          onClick={() => add(typed)}
        >
          <Plus size={17} aria-hidden="true" />
        </Button>
      </div>
      {key && !canAdd && (
        <small className="text-muted-foreground" role="status">
          {used.has(key)
            ? "Ya añadiste este valor."
            : "Este valor está inactivo."}
        </small>
      )}
    </div>
  );
}

export function ProductCharacteristics({
  axes,
  setAxes,
  choices,
  existing,
}: {
  axes: AxisRow[];
  setAxes: React.Dispatch<React.SetStateAction<AxisRow[]>>;
  choices: Choices["attributes"];
  existing: Variant[];
}) {
  const listId = useId(),
    added = useRef(""),
    addButton = useRef<HTMLButtonElement>(null);
  const update = (key: string, patch: Partial<AxisRow>) =>
    setAxes((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  function move(key: string, delta: number) {
    setAxes((rows) => {
      const from = rows.findIndex((row) => row.key === key),
        to = from + delta;
      if (from < 0 || to < 0 || to >= rows.length) return rows;
      const next = [...rows];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }
  return (
    <section
      aria-label="Características"
      className="grid gap-4 rounded-xl border border-border p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">
          <Tags size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold">Características</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Elige qué cambia entre las variantes, como color, talla o material.
            Puedes reutilizar valores de tu empresa o escribir uno nuevo.
          </p>
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-semibold">Lo que cambia entre variantes</p>
        <datalist id={listId}>
          {choices.map((a) => (
            <option key={a.name} value={a.name} />
          ))}
        </datalist>
        {axes.map((axis, i) => {
          const axisName = axis.name.trim() || `característica ${i + 1}`;
          const used = new Set(
            existing.flatMap((v) =>
              Object.entries(v.options)
                .filter(([n]) => catalogKey(n) === catalogKey(axis.name))
                .map(([, val]) => catalogKey(val)),
            ),
          );
          const options =
            choices.find((c) => catalogKey(c.name) === catalogKey(axis.name))
              ?.options ?? [];
          return (
            <div
              key={axis.key}
              className="grid min-w-0 gap-2 rounded-xl border border-border bg-muted/40 p-3"
              role="group"
              aria-label={`Característica ${i + 1}`}
            >
              <div className="flex items-center gap-1">
                <Input
                  aria-label={`Nombre de la característica ${i + 1}`}
                  list={listId}
                  ref={(node) => {
                    if (node && added.current === axis.key) {
                      added.current = "";
                      node.focus();
                    }
                  }}
                  value={axis.name}
                  maxLength={100}
                  readOnly={used.size > 0}
                  placeholder="Ej. Color"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  onChange={(e) => update(axis.key, { name: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === 0}
                  aria-label={`Subir ${axisName}`}
                  title="Subir"
                  onClick={() => move(axis.key, -1)}
                >
                  <ArrowUp size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === axes.length - 1}
                  aria-label={`Bajar ${axisName}`}
                  title="Bajar"
                  onClick={() => move(axis.key, 1)}
                >
                  <ArrowDown size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={used.size > 0}
                  aria-label={`Quitar ${axisName}`}
                  title={
                    used.size
                      ? "Usada en variantes guardadas"
                      : "Quitar característica"
                  }
                  onClick={() => {
                    setAxes((rows) =>
                      rows.filter((row) => row.key !== axis.key),
                    );
                    addButton.current?.focus();
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {axis.values.map((value) => (
                  <span
                    key={catalogKey(value)}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-accent pl-3 pr-1 text-sm font-medium text-primary"
                  >
                    <span className="break-words">{value}</span>
                    <button
                      type="button"
                      disabled={used.has(catalogKey(value))}
                      aria-label={`Quitar ${value} de ${axisName}`}
                      title={
                        used.has(catalogKey(value))
                          ? "Usado en una variante guardada"
                          : "Quitar valor"
                      }
                      className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-primary/10 disabled:opacity-35"
                      onClick={() =>
                        update(axis.key, {
                          values: axis.values.filter((v) => v !== value),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
                <ValuePicker
                  axis={axis}
                  options={options}
                  change={(patch) => update(axis.key, patch)}
                />
              </div>
            </div>
          );
        })}
      </div>
      {existing.length ? (
        <p className="text-sm text-muted-foreground">
          Las variantes guardadas conservan sus características. Puedes añadir
          valores, cambiar el orden o desactivar una variante.
        </p>
      ) : (
        <Button
          ref={addButton}
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={axes.length >= maxAxes}
          onClick={() => {
            const key = crypto.randomUUID();
            added.current = key;
            setAxes((rows) =>
              rows.length < maxAxes
                ? [...rows, { key, name: "", values: [], entry: "" }]
                : rows,
            );
          }}
        >
          <Plus size={16} /> Añadir otra característica
        </Button>
      )}
    </section>
  );
}
