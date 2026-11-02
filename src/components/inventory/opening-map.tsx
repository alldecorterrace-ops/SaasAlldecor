"use client";
import { useState } from "react";
import { InventoryForm } from "./form";
import { InventoryLookup } from "./lookup";
import type { InvLocation, SearchVariant } from "@/lib/inventory";
export function OpeningMap({
  company,
  item,
  request,
  locations,
}: {
  company: string;
  item: string;
  request: string;
  locations: InvLocation[];
}) {
  const [variant, setVariant] = useState<SearchVariant | null>(null);
  return (
    <details>
      <summary className="cursor-pointer underline">
        Asignar variante y ubicación
      </summary>
      <InventoryForm
        company={company}
        slug="existencias"
        operation="mapping"
        request={request}
        submit="Guardar asignación"
        disabled={!variant}
      >
        <input type="hidden" name="item" value={item} />
        <input type="hidden" name="variant" value={variant?.id ?? ""} />
        <InventoryLookup<SearchVariant>
          company={company}
          type="variantes"
          label="Buscar variante"
          onSelect={setVariant}
        />
        {variant && (
          <p>
            {variant.sku} · {variant.name}
          </p>
        )}
        <label className="field">
          Ubicación física
          <select name="location" required defaultValue="">
            <option value="">Seleccionar</option>
            {locations
              .filter((l) => l.active)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.kind}
                </option>
              ))}
          </select>
        </label>
      </InventoryForm>
    </details>
  );
}
