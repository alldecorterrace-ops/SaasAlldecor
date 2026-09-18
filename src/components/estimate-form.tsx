"use client";
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  saveEstimate,
  searchEstimateChoices,
  type CustomerChoice,
  type ProductChoice,
} from "@/app/app/[companyId]/estimados/actions";
import type { CommercialState } from "@/app/app/[companyId]/leads/actions";
import {
  emptyItem,
  estimateStatuses,
  estimateTotals,
  lineCents,
  centsText,
  type EstimateInput,
  type EstimateItem,
} from "@/lib/estimates";
import { priceBases } from "@/lib/commercial";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function EstimateForm({
  companyId,
  id,
  version,
  initial,
  customerName,
  readOnly,
  saved,
  canSelectCustomer,
  canSelectProduct,
}: {
  companyId: string;
  id: string;
  version: number;
  initial: EstimateInput;
  customerName: string;
  readOnly: boolean;
  saved: boolean;
  canSelectCustomer: boolean;
  canSelectProduct: boolean;
}) {
  const [v, set] = useState(initial),
    [state, action] = useActionState(
      saveEstimate.bind(null, companyId),
      {} as CommercialState,
    ),
    [customers, setCustomers] = useState<CustomerChoice[]>(
      initial.customer_id
        ? [{ id: initial.customer_id, full_name: customerName }]
        : [],
    ),
    [products, setProducts] = useState<ProductChoice[]>([]),
    [cq, setCq] = useState(""),
    [pq, setPq] = useState(""),
    [lookupError, setLookupError] = useState(""),
    [pending, startTransition] = useTransition();
  const editItem = (i: number, patch: Partial<EstimateItem>) =>
    set((old) => ({
      ...old,
      items: old.items.map((x, n) => (n === i ? { ...x, ...patch } : x)),
    }));
  let totals: { subtotal: string; total: string } | null = null;
  try {
    totals = estimateTotals(v);
  } catch {}
  const lookup = (kind: "customers" | "products") =>
    startTransition(async () => {
      try {
        const r = await searchEstimateChoices(
          companyId,
          kind,
          kind === "customers" ? cq : pq,
        );
        setLookupError(r.error ?? "");
        if (r.customers)
          setCustomers((old) => [
            ...old.filter(
              (x) =>
                x.id === v.customer_id &&
                !r.customers?.some((n) => n.id === x.id),
            ),
            ...r.customers!,
          ]);
        if (r.products) setProducts(r.products);
      } catch {
        setLookupError("No se pudo completar la búsqueda. Revisa tu acceso.");
      }
    });
  const preview = (item: EstimateItem) => {
    try {
      return "$" + centsText(lineCents(item));
    } catch {
      return "Revisa los valores";
    }
  };
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="payload" value={JSON.stringify(v)} />
      <Feedback
        error={state.error}
        success={
          saved ? "Estimado guardado con una nueva revisión." : undefined
        }
      />
      <Feedback error={lookupError} />
      <fieldset
        disabled={readOnly}
        className="card grid gap-5 md:grid-cols-2 min-w-0"
      >
        <div className="space-y-3">
          <label className="field">
            Cliente *
            <select
              required
              value={v.customer_id}
              disabled={!canSelectCustomer || readOnly}
              onChange={(e) => set({ ...v, customer_id: e.target.value })}
            >
              <option value="">Selecciona un cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
          {canSelectCustomer && !readOnly && (
            <div className="flex gap-2">
              <Input
                aria-label="Buscar cliente"
                value={cq}
                onChange={(e) => setCq(e.target.value)}
                placeholder="Buscar cliente por nombre"
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => lookup("customers")}
              >
                Buscar
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            La búsqueda muestra hasta 25 resultados. Refina el nombre si
            necesitas otro cliente.
          </p>
        </div>
        <label className="field">
          Estado
          <select
            value={v.status}
            onChange={(e) =>
              set({ ...v, status: e.target.value as EstimateInput["status"] })
            }
          >
            {Object.entries(estimateStatuses)
              .filter(([key]) => key !== "ENVIADO")
              .filter(([key]) => key !== "APROBADO" || readOnly)
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
          <small>
            Anular conserva el documento y bloquea nuevas ediciones.
          </small>
        </label>
        <label className="field">
          Fecha *
          <Input
            type="date"
            required
            value={v.estimate_date}
            onChange={(e) => set({ ...v, estimate_date: e.target.value })}
          />
        </label>
        <label className="field">
          Válido hasta
          <Input
            type="date"
            min={v.estimate_date}
            value={v.valid_until ?? ""}
            onChange={(e) => set({ ...v, valid_until: e.target.value || null })}
          />
        </label>
      </fieldset>
      <section className="card space-y-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="font-semibold">Detalle del estimado</h2>
            <p className="text-sm text-muted-foreground">
              Medidas en pies. Importes en USD.
            </p>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              disabled={v.items.length >= 100}
              onClick={() =>
                set({ ...v, items: [...v.items, { ...emptyItem }] })
              }
            >
              Agregar línea libre
            </Button>
          )}
        </div>
        {canSelectProduct && !readOnly && (
          <div className="rounded-xl bg-accent p-4 space-y-3">
            <div className="flex gap-2">
              <Input
                aria-label="Buscar producto"
                placeholder="Buscar producto del catálogo"
                value={pq}
                onChange={(e) => setPq(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => lookup("products")}
              >
                Buscar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {products.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={v.items.length >= 100}
                  onClick={() =>
                    set({
                      ...v,
                      items: [
                        ...v.items,
                        {
                          ...emptyItem,
                          product_id: p.id,
                          name: p.name,
                          base: p.base as EstimateItem["base"],
                          unit_price: String(p.unit_price),
                        },
                      ],
                    })
                  }
                >
                  + {p.name}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Se agrega el precio base vigente. Incluye acabados o ajustes como
              líneas separadas. Los cambios posteriores del catálogo no cambian
              este estimado.
            </p>
          </div>
        )}
        {v.items.map((item, i) => (
          <fieldset
            key={i}
            disabled={readOnly}
            className="rounded-xl border border-border p-4 min-w-0"
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold">
                Línea {i + 1} · {preview(item)}
              </h3>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    set({ ...v, items: v.items.filter((_, n) => n !== i) })
                  }
                >
                  Quitar línea {i + 1}
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="field sm:col-span-2">
                Descripción *
                <Input
                  required
                  maxLength={255}
                  value={item.name}
                  onChange={(e) => editItem(i, { name: e.target.value })}
                />
              </label>
              <label className="field">
                Base
                <select
                  value={item.base}
                  onChange={(e) =>
                    editItem(i, {
                      base: e.target.value as EstimateItem["base"],
                    })
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
                Cantidad *
                <Input
                  inputMode="decimal"
                  required
                  pattern="[0-9]{1,6}([.][0-9]{1,3})?"
                  value={item.qty}
                  onChange={(e) => editItem(i, { qty: e.target.value })}
                />
              </label>
              {item.base === "manual" ? (
                <label className="field">
                  Importe manual total *
                  <Input
                    inputMode="decimal"
                    required
                    pattern="[0-9]{1,9}([.][0-9]{1,2})?"
                    value={item.manual_total}
                    onChange={(e) =>
                      editItem(i, { manual_total: e.target.value })
                    }
                  />
                </label>
              ) : (
                <label className="field">
                  Precio por base *
                  <Input
                    inputMode="decimal"
                    required
                    pattern="[0-9]{1,9}([.][0-9]{1,2})?"
                    value={item.unit_price}
                    onChange={(e) =>
                      editItem(i, { unit_price: e.target.value })
                    }
                  />
                </label>
              )}
              {(item.base === "linear_ft"
                ? ["length"]
                : item.base === "area_ft2"
                  ? ["length", "width"]
                  : item.base === "volume_ft3"
                    ? ["length", "width", "height"]
                    : []
              ).map((key) => (
                <label className="field" key={key}>
                  {{ length: "Largo", width: "Ancho", height: "Alto" }[key]}{" "}
                  (ft) *
                  <Input
                    required
                    inputMode="decimal"
                    pattern="[0-9]{1,6}([.][0-9]{1,3})?"
                    value={item[key as "length"]}
                    onChange={(e) => editItem(i, { [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="field sm:col-span-2 xl:col-span-4">
                Especificaciones y notas de la línea
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={item.description}
                  onChange={(e) => editItem(i, { description: e.target.value })}
                />
              </label>
            </div>
          </fieldset>
        ))}
        {!v.items.length && (
          <p className="text-sm text-muted-foreground">
            Agrega al menos una línea para guardar.
          </p>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <label className="card field">
          Notas del estimado
          <textarea
            rows={6}
            readOnly={readOnly}
            maxLength={10000}
            value={v.notes}
            onChange={(e) => set({ ...v, notes: e.target.value })}
          />
        </label>
        <div className="card space-y-4">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <strong>${totals?.subtotal ?? "—"}</strong>
          </div>
          {(["discount", "taxes"] as const).map((key) => (
            <label className="field" key={key}>
              {key === "discount"
                ? "Descuento (importe USD)"
                : "Impuestos (importe USD)"}
              <Input
                readOnly={readOnly}
                inputMode="decimal"
                required
                pattern="[0-9]{1,9}([.][0-9]{1,2})?"
                value={v[key]}
                onChange={(e) => set({ ...v, [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="border-t border-border pt-4 flex justify-between text-xl font-semibold">
            <span>Total</span>
            <span>${totals?.total ?? "—"}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada línea se redondea a dos decimales. El importe manual representa
            el total de esa línea.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {!readOnly && (
          <SubmitButton>
            {version ? "Guardar revisión" : "Crear estimado"}
          </SubmitButton>
        )}
        <Button asChild variant="outline">
          <Link href={`/app/${companyId}/estimados`}>Volver al listado</Link>
        </Button>
      </div>
    </form>
  );
}
