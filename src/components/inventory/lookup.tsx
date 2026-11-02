"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

function useResults<T>(url: string | null, allLots = false) {
  const [result, setResult] = useState<{
    url: string;
    rows: T[];
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        let page = 1,
          more = true;
        const rows: T[] = [];
        while (more) {
          const response = await fetch(
            url + (allLots ? "&pagina=" + page : ""),
            { signal: controller.signal, cache: "no-store" },
          );
          if (!response.ok) throw Error();
          const batch: T[] = await response.json();
          rows.push(...batch);
          more = allLots && batch.length === 40;
          page++;
        }
        if (!controller.signal.aborted) setResult({ url, rows, error: false });
      } catch {
        if (!controller.signal.aborted)
          setResult({ url, rows: [], error: true });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, allLots]);
  return result?.url === url ? result : null;
}
export function InventoryLookup<
  T extends {
    id: string;
    name: string;
    sku?: string;
    available?: number | null;
  },
>({
  company,
  type,
  location,
  supplier,
  label,
  onSelect,
  disabled = false,
}: {
  company: string;
  type: "variantes" | "proveedores" | "proveedoresFiltro";
  location?: string;
  supplier?: string;
  label: string;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState(""),
    [open, setOpen] = useState(false);
  const query = new URLSearchParams({ tipo: type, q });
  if (location) query.set("sede", location);
  if (supplier) query.set("proveedor", supplier);
  const url =
    open && !disabled ? `/app/${company}/inventario/consulta?${query}` : null;
  const data = useResults<T>(url);
  return (
    <div className="grid gap-1">
      <label className="field">
        {label}
        <Input
          type="search"
          value={q}
          disabled={disabled}
          maxLength={150}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (data?.rows.length === 1) {
                onSelect(data.rows[0]);
                setOpen(false);
                setQ("");
              }
            }
          }}
        />
      </label>
      {open && !disabled && (
        <div
          className="max-h-48 overflow-auto rounded-md border bg-background text-sm"
          aria-live="polite"
        >
          {!data ? (
            <p className="p-2">Buscando…</p>
          ) : data.error ? (
            <p className="p-2">No se pudo consultar la lista.</p>
          ) : !data.rows.length ? (
            <p className="p-2">Sin coincidencias.</p>
          ) : (
            data.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  onSelect(row);
                  setQ("");
                  setOpen(false);
                }}
              >
                {row.name}
                {row.sku ? " · " + row.sku : ""}
                {row.available != null ? " · Disponible: " + row.available : ""}
              </button>
            ))
          )}
          <button
            type="button"
            className="p-2 underline"
            onClick={() => setOpen(false)}
          >
            Cerrar lista
          </button>
        </div>
      )}
    </div>
  );
}
export function useAvailableLots(
  company: string,
  loc: string,
  variant: string,
  enabled: boolean,
) {
  const params = new URLSearchParams({
    tipo: "lotes",
    sede: loc,
    variante: variant,
  });
  return useResults<{ lot_id: string; label: string; quantity: number }>(
    enabled && loc ? `/app/${company}/inventario/consulta?${params}` : null,
    true,
  );
}
export function SupplierFilter({
  company,
  initial,
}: {
  company: string;
  initial?: { id: string; name: string };
}) {
  const [supplier, setSupplier] = useState(initial);
  return (
    <div>
      <input type="hidden" name="proveedor" value={supplier?.id ?? ""} />
      <InventoryLookup
        company={company}
        type="proveedoresFiltro"
        label="Filtrar por proveedor"
        onSelect={setSupplier}
      />
      {supplier && (
        <button
          className="text-sm underline"
          type="button"
          onClick={() => setSupplier(undefined)}
        >
          {supplier.name} · Quitar
        </button>
      )}
    </div>
  );
}
