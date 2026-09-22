"use client";
import { useEffect, useState } from "react";
import { operationLabels } from "@/lib/operation-queue";

export type OperationStatus = {
  id: string;
  status: string;
  resultReference: string | null;
  resultCode: string | null;
};
export function OperationStatusView({
  companyId,
  initial,
}: {
  companyId: string;
  initial: OperationStatus;
}) {
  const [current, setCurrent] = useState(initial);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!["queued", "processing"].includes(current.status)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(
          `/api/operations/${companyId}/${initial.id}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json();
        if (
          data.id !== initial.id ||
          !Object.hasOwn(operationLabels, data.status)
        )
          throw new Error("invalid_response");
        if (!stopped) {
          setCurrent(data);
          setError(false);
        }
      } catch {
        if (!stopped) setError(true);
      }
      if (!stopped) timer = setTimeout(poll, 5000);
    }
    timer = setTimeout(poll, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, initial.id, current.status]);
  return (
    <section className="space-y-4" aria-live="polite">
      <h1 className="text-2xl font-semibold">
        {operationLabels[current.status] ?? "Estado no disponible"}
      </h1>
      {["queued", "processing"].includes(current.status) && (
        <p>
          Tu solicitud está guardada. Puedes mantener esta página abierta para
          consultar el resultado.
        </p>
      )}
      {current.status === "review" && (
        <p>
          Estamos comprobando el resultado. No vuelvas a enviar la operación.
        </p>
      )}
      {current.status === "rejected" && (
        <p>
          La solicitud no se completó. Revisa el acceso y los datos antes de
          iniciar otra operación.
        </p>
      )}
      {current.status === "succeeded" && (
        <p>La operación terminó correctamente.</p>
      )}
      {error && (
        <p role="status">
          No se pudo actualizar el estado. La solicitud conserva su
          identificador; volveremos a consultar.
        </p>
      )}
      <p className="text-sm text-muted-foreground">Referencia: {initial.id}</p>
    </section>
  );
}
