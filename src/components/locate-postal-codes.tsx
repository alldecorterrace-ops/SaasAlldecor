"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { locateCenter } from "@/app/app/[companyId]/mapa-zonas/actions";
import { Button } from "@/components/ui/button";

export function LocatePostalCodes({
  companyId,
  zips,
  provider,
}: {
  companyId: string;
  zips: number[];
  provider: "disabled" | "synthetic" | "nominatim";
}) {
  const router = useRouter(),
    stop = useRef(false),
    running = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function start() {
    if (running.current) return;
    running.current = true;
    stop.current = false;
    setBusy(true);
    let saved = 0,
      missing = 0,
      failed = 0;
    try {
      for (let i = 0; i < zips.length && !stop.current; i++) {
        const started = Date.now();
        while (!stop.current) {
          setMessage(`Ubicando ${i + 1} de ${zips.length}: ${zips[i]}`);
          const result = await locateCenter(companyId, String(zips[i]));
          if (result.status === "busy" && Date.now() - started < 120_000) {
            setMessage(`Esperando turno para ${zips[i]}…`);
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                Math.min(15_250, Math.max(1000, result.retryAfterMs)),
              ),
            );
            continue;
          }
          if (result.status === "saved" || result.status === "already_saved")
            saved++;
          else if (result.status === "missing") missing++;
          else {
            failed++;
            // No automatic retries of permissions/errors; keep unresolved ZIPs visible.
            if (
              result.status === "forbidden" ||
              result.status === "unavailable"
            )
              stop.current = true;
          }
          break;
        }
      }
      setMessage(
        `${stop.current ? "Detenido" : "Listo"}: ${saved} código(s) ubicado(s), ${missing} sin resultado, ${failed} con error. Los pendientes conservan la opción manual.`,
      );
    } catch {
      setMessage(
        "No se pudo completar la ubicación. Actualiza para revisar lo guardado antes de reintentar.",
      );
    } finally {
      running.current = false;
      setBusy(false);
      router.refresh();
    }
  }
  return (
    <div className="card space-y-3">
      {provider === "synthetic" && (
        <p>
          Prueba sintética: solo 33198 tiene una respuesta ficticia; 33199 no
          tiene resultado. No se consulta ningún proveedor externo.
        </p>
      )}
      {provider === "disabled" ? (
        <p>
          Ubicación automática pendiente de configurar. Puedes guardar las
          coordenadas manualmente.
        </p>
      ) : (
        <>
          <Button disabled={busy || !zips.length} onClick={start}>
            Ubicar {zips.length} código(s) postal(es)
          </Button>
          {busy && (
            <button
              className="ml-3 underline"
              onClick={() => {
                stop.current = true;
                setMessage("Deteniendo después de la consulta actual…");
              }}
            >
              Detener
            </button>
          )}
        </>
      )}
      {provider === "nominatim" && (
        <p className="text-sm">
          Geocodificación ©{" "}
          <a
            className="underline"
            href="https://www.openstreetmap.org/copyright"
          >
            OpenStreetMap contributors (ODbL)
          </a>
          . Solo se consulta el código postal en EE. UU.
        </p>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
