"use client";
import { useState, useTransition } from "react";
import { searchOperationChoices } from "@/app/app/[companyId]/operaciones/actions";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
type Choice = { id: string; name: string };
export function InstallationCrewSelect({
  companyId,
  initial,
  canSearch,
}: {
  companyId: string;
  initial: Choice[];
  canSearch: boolean;
}) {
  const [selected, setSelected] = useState(initial),
    [q, setQ] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]),
    [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <section
      className="space-y-3 md:col-span-2"
      aria-label="Cuadrilla asignada"
    >
      <h2 className="font-semibold">Cuadrilla asignada</h2>
      <p className="text-sm text-muted-foreground">
        El responsable también pertenece al equipo. Se comprueba la agenda de
        cada trabajador seleccionado.
      </p>
      <input type="hidden" name="crew_present" value="1" />
      {selected.length ? (
        <ul className="space-y-2">
          {selected.map((w) => (
            <li key={w.id} className="flex items-center gap-3">
              <input type="hidden" name="crew_worker_ids" value={w.id} />
              <span className="min-w-0 break-words">{w.name}</span>
              {canSearch && (
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Quitar de la cuadrilla: ${w.name}`}
                  onClick={() =>
                    setSelected((old) => old.filter((x) => x.id !== w.id))
                  }
                >
                  Quitar
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">Sin colaboradores seleccionados.</p>
      )}
      {canSearch && (
        <>
          <div className="flex gap-2">
            <Input
              aria-label="Buscar trabajador para la cuadrilla"
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
                      "workers",
                      q,
                    );
                    setError(result.error ?? "");
                    if (result.data) setChoices(result.data);
                  } catch {
                    setError("No se pudo buscar. Revisa tu sesión y permisos.");
                  }
                })
              }
            >
              Buscar cuadrilla
            </Button>
          </div>
          <ul className="space-y-2">
            {choices
              .filter((w) => !selected.some((s) => s.id === w.id))
              .map((w) => (
                <li key={w.id} className="flex items-center gap-3">
                  <span className="min-w-0 break-words">{w.name}</span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={selected.length >= 20}
                    aria-label={`Añadir a la cuadrilla: ${w.name}`}
                    onClick={() =>
                      setSelected((old) =>
                        old.some((x) => x.id === w.id) ? old : [...old, w],
                      )
                    }
                  >
                    Añadir
                  </Button>
                </li>
              ))}
          </ul>
          {choices.length >= 25 && (
            <p className="text-xs">
              Se muestran hasta 25 coincidencias. Refina la búsqueda.
            </p>
          )}
          {selected.length >= 20 && (
            <p className="text-sm">
              La instalación admite hasta 20 colaboradores.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
