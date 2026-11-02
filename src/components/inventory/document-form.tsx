"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { InventoryForm } from "./form";
import { InventoryLookup, useAvailableLots } from "./lookup";
import {
  inventoryReasons,
  quantity,
  usd,
  type InventoryContext,
  type InvSection,
  type SearchVariant,
} from "@/lib/inventory";
type Line = {
  key: string;
  v: SearchVariant;
  qty: string;
  cost: string;
  manualCost: boolean;
  lots: Record<string, string>;
};
function DraftLine({
  row,
  ctx,
  loc,
  company,
  kind,
  change,
  remove,
}: {
  row: Line;
  ctx: InventoryContext;
  loc: string;
  company: string;
  kind: string;
  change: (patch: Partial<Line>) => void;
  remove: () => void;
}) {
  const outbound = kind === "TRASLADO" || Number(row.qty) < 0,
    choices = useAvailableLots(
      company,
      loc,
      row.v.id,
      outbound || kind === "AJUSTE",
    );
  const decimals = ["KG", "LITRO", "METRO"].includes(row.v.unit);
  return (
    <fieldset className="rounded-lg border p-3 grid gap-3">
      <legend className="px-2 font-semibold">
        {row.v.name} · {row.v.sku}
      </legend>
      {kind === "AJUSTE" && choices && !choices.error && (
        <p className="text-sm">
          Existencia actual:{" "}
          {quantity(
            choices.rows.reduce((sum, l) => sum + Number(l.quantity), 0),
          )}{" "}
          {row.v.unit.toLowerCase()}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label className="field">
          Cantidad ({row.v.unit.toLowerCase()})
          <Input
            type="number"
            step={decimals ? "0.001" : "1"}
            required
            min={kind === "AJUSTE" ? undefined : decimals ? "0.001" : "1"}
            value={row.qty}
            onChange={(e) =>
              change({
                qty: e.target.value,
                lots:
                  Number(e.target.value) < 0 || kind === "TRASLADO"
                    ? row.lots
                    : {},
              })
            }
          />
        </label>
        {!outbound && ctx.costManage && (
          <label className="field">
            Costo unitario (USD)
            <Input
              type="number"
              step="0.0001"
              min="0"
              placeholder="Pendiente"
              value={row.cost}
              onChange={(e) =>
                change({ cost: e.target.value, manualCost: true })
              }
            />
          </label>
        )}
        {ctx.costManage && !outbound && row.cost !== "" && (
          <span className="text-sm">
            Subtotal {usd(Number(row.cost) * Number(row.qty))}
          </span>
        )}
        <button type="button" onClick={remove} className="text-sm underline">
          Quitar línea
        </button>
      </div>
      {outbound && (
        <div className="grid gap-2 text-sm">
          {!choices ? (
            "Consultando lotes…"
          ) : choices.error ? (
            "No se pudieron consultar los lotes."
          ) : !choices.rows.length ? (
            "No hay unidades disponibles."
          ) : choices.rows.length === 1 ? (
            <p>
              {choices.rows[0].label} · {quantity(choices.rows[0].quantity)}{" "}
              disponibles. Se usará este lote.
            </p>
          ) : (
            <>
              <p>
                Indica cuánto sale de cada lote. Las cantidades deben sumar{" "}
                {quantity(Math.abs(Number(row.qty)))}.
              </p>
              {choices.rows.map((l) => (
                <label
                  className="flex flex-wrap items-center gap-3"
                  key={l.lot_id}
                >
                  {l.label} · {quantity(l.quantity)} disponibles
                  <Input
                    className="max-w-28"
                    aria-label={"Tomar de " + l.label}
                    type="number"
                    step={decimals ? "0.001" : "1"}
                    min="0"
                    max={l.quantity}
                    placeholder="0"
                    value={row.lots[l.lot_id] ?? ""}
                    onChange={(e) =>
                      change({
                        lots: { ...row.lots, [l.lot_id]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
export function DocumentForm({
  company,
  section,
  ctx,
  request,
  today,
}: {
  company: string;
  section: InvSection;
  ctx: InventoryContext;
  request: string;
  today: string;
}) {
  const kind = section.kind,
    action =
      kind === "COMPRA"
        ? "purchases.create"
        : kind === "TRASLADO"
          ? "transfers.create"
          : "adjustments.create";
  const where = ctx.locations.filter(
    (l) =>
      l.active &&
      l.actions.includes(action) &&
      (kind !== "COMPRA" || l.kind === "ALMACEN"),
  );
  const [loc, setLoc] = useState(where[0]?.id ?? ""),
    [dest, setDest] = useState(where[1]?.id ?? ""),
    [date, setDate] = useState(today);
  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [tax, setTax] = useState(""),
    [reference, setRef] = useState(""),
    [reason, setReason] = useState("CONTEO_FISICO"),
    [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const draft = {
    kind,
    location: loc,
    date,
    ...(kind === "TRASLADO" ? { destination: dest } : {}),
    ...(kind === "COMPRA"
      ? {
          supplier: supplier?.id,
          reference,
          ...(ctx.costManage && tax !== "" ? { tax } : {}),
        }
      : {}),
    ...(kind === "AJUSTE" ? { reason } : {}),
    notes,
    lines: lines.map((r) => ({
      variant: r.v.id,
      qty: r.qty,
      ...(ctx.costManage &&
      kind !== "TRASLADO" &&
      Number(r.qty) > 0 &&
      r.cost !== ""
        ? { cost: r.cost }
        : {}),
      lots: Object.entries(r.lots)
        .filter(([, q]) => Number(q) > 0)
        .map(([lot, qty]) => ({ lot, qty })),
    })),
  };
  const disabled =
    !ctx.active ||
    !ctx.writable ||
    !loc ||
    !lines.length ||
    (kind === "TRASLADO" && (!dest || loc === dest)) ||
    (kind === "COMPRA" && !supplier);
  return (
    <InventoryForm
      company={company}
      operation="post"
      slug={section.slug}
      request={request}
      submit={
        kind === "COMPRA"
          ? "Registrar compra"
          : kind === "TRASLADO"
            ? "Registrar traslado"
            : "Registrar ajuste"
      }
      disabled={disabled}
    >
      <input type="hidden" name="data" value={JSON.stringify(draft)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          {kind === "COMPRA"
            ? "Almacén de recepción"
            : kind === "TRASLADO"
              ? "Origen"
              : "Ubicación"}
          <select
            value={loc}
            onChange={(e) => {
              const id = e.target.value;
              setLoc(id);
              if (id === dest)
                setDest(where.find((l) => l.id !== id)?.id ?? "");
              setLines((old) => old.map((r) => ({ ...r, lots: {} })));
            }}
            required
          >
            {where.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {kind === "TRASLADO" && (
          <label className="field">
            Destino
            <select
              required
              value={dest}
              onChange={(e) => setDest(e.target.value)}
            >
              <option value="">Elegir destino</option>
              {where
                .filter((l) => l.id !== loc)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="field">
          Fecha de negocio
          <Input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {kind === "AJUSTE" && (
          <label className="field">
            Motivo
            <select
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value === "INVENTARIO_INICIAL")
                  setLines((old) =>
                    old.map((r) => (r.manualCost ? r : { ...r, cost: "" })),
                  );
              }}
            >
              {Object.entries(inventoryReasons).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "COMPRA" && (
          <>
            <div>
              <InventoryLookup
                company={company}
                type="proveedores"
                label="Buscar proveedor"
                disabled={!ctx.supplierView}
                onSelect={(v) => {
                  setSupplier(v);
                  if (supplier?.id !== v.id)
                    setLines((old) =>
                      old.map((r) => (r.manualCost ? r : { ...r, cost: "" })),
                    );
                }}
              />
              <p className="mt-1 text-sm">
                {supplier
                  ? supplier.name
                  : ctx.supplierView
                    ? "Selecciona el proveedor de esta entrega."
                    : "Necesitas acceso a proveedores para elegir uno."}
              </p>
            </div>
            <label className="field">
              Factura o albarán
              <Input
                value={reference}
                maxLength={180}
                onChange={(e) => setRef(e.target.value)}
              />
            </label>
            {ctx.costManage && (
              <label className="field">
                Impuesto separado (USD)
                <Input
                  type="number"
                  min="0"
                  step=".01"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </label>
            )}
          </>
        )}
      </div>
      <label className="field">
        Notas{kind === "AJUSTE" ? " (obligatorias)" : ""}
        <textarea
          rows={2}
          maxLength={5000}
          required={kind === "AJUSTE"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <InventoryLookup<SearchVariant>
        company={company}
        type="variantes"
        location={loc}
        supplier={supplier?.id}
        disabled={!loc || (kind === "COMPRA" && !supplier)}
        label="Añadir variante por nombre, SKU o código de barras"
        onSelect={(v) =>
          setLines((old) => [
            ...old,
            {
              key: crypto.randomUUID(),
              v,
              qty: "1",
              manualCost: false,
              cost:
                v.extra.suggested != null &&
                !(kind === "AJUSTE" && reason === "INVENTARIO_INICIAL")
                  ? String(v.extra.suggested)
                  : "",
              lots: {},
            },
          ])
        }
      />
      {lines.map((r) => (
        <DraftLine
          key={r.key}
          row={r}
          ctx={ctx}
          loc={loc}
          company={company}
          kind={kind}
          remove={() => setLines((old) => old.filter((x) => x.key !== r.key))}
          change={(patch) =>
            setLines((old) =>
              old.map((x) => (x.key === r.key ? { ...x, ...patch } : x)),
            )
          }
        />
      ))}
      {kind === "COMPRA" && ctx.costManage && lines.length > 0 && (
        <p>
          Mercancía conocida{" "}
          {usd(lines.reduce((a, x) => a + Number(x.qty) * Number(x.cost), 0))}
          {lines.some((x) => x.cost === "") ? " · Hay costos pendientes" : ""}
        </p>
      )}
    </InventoryForm>
  );
}
