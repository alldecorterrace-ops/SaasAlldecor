"use client";
import { useState, useTransition } from "react";
import { searchOperationChoices } from "@/app/app/[companyId]/operaciones/actions";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function EntitySelect({
  companyId,
  kind,
  name,
  label,
  initial,
  canSearch,
}: {
  companyId: string;
  kind: "workers" | "projects";
  name: string;
  label: string;
  initial: { id: string; name: string } | null;
  canSearch: boolean;
}) {
  const [q, setQ] = useState(""),
    [value, setValue] = useState(initial?.id ?? ""),
    [choices, setChoices] = useState(initial ? [initial] : []),
    [error, setError] = useState(""),
    [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <label className="field">
        {label}
        <select
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">Sin asignar</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {canSearch && (
        <div className="flex gap-2">
          <Input
            aria-label={`Buscar ${label}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre"
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const result = await searchOperationChoices(
                    companyId,
                    kind,
                    q,
                  );
                  setError(result.error ?? "");
                  if (result.data)
                    setChoices((old) => {
                      const selected = old.find((c) => c.id === value);
                      return selected &&
                        !result.data!.some((c) => c.id === value)
                        ? [selected, ...result.data!]
                        : result.data!;
                    });
                } catch {
                  setError("No se pudo buscar. Revisa tu sesión y permisos.");
                }
              })
            }
          >
            Buscar
          </Button>
        </div>
      )}
      {choices.length >= 25 && (
        <p className="text-xs">
          Se muestran hasta 25 coincidencias. Refina la búsqueda.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
