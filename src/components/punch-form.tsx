"use client";
import { useRef, useState } from "react";
import { usePreservedActionState } from "./use-preserved-action-state";
import {
  timeAction,
  type TimeState,
} from "@/app/app/[companyId]/horas/actions";
import { getPunchGPS, GPSFailure } from "@/lib/time-gps";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";

export function PunchForm({
  companyId,
  id,
  exit,
  projects,
  preferredProjectId,
}: {
  companyId: string;
  id: string;
  exit: boolean;
  projects: { id: string; name: string }[];
  preferredProjectId?: string | null;
}) {
  const flight = useRef(false);
  const [progress, setProgress] = useState("");
  const [state, action, pending, onReset] = usePreservedActionState(
    async (previous: TimeState, form: FormData): Promise<TimeState> => {
      if (flight.current) return previous;
      flight.current = true;
      try {
        if (navigator.onLine === false)
          return {
            error:
              "Sin conexión. No se envió el marcaje. Intenta otra vez cuando tengas conexión.",
          };
        if (!navigator.geolocation) throw new GPSFailure(2);
        setProgress("Buscando tu ubicación actual…");
        const gps = await getPunchGPS(navigator.geolocation);
        setProgress("Ubicación verificada. Guardando marcaje…");
        form.set("gps", JSON.stringify(gps));
        return await timeAction(companyId, "punch", previous, form);
      } catch (error) {
        return {
          error:
            error instanceof GPSFailure
              ? error.message
              : "No se pudo confirmar el marcaje. Revisa tu jornada antes de intentar otra vez.",
        };
      } finally {
        flight.current = false;
        setProgress("");
      }
    },
    {} as TimeState,
  );
  return (
    <form action={action} onReset={onReset} className="space-y-4">
      <Feedback error={state.error} success={state.success} />
      <p className="text-sm text-muted-foreground">
        La entrada y la salida requieren tu ubicación actual con precisión de
        hasta 100 metros. Activa la ubicación del teléfono y permite el acceso
        cuando Chrome lo solicite.
      </p>
      <p className="text-sm text-muted-foreground">
        El reloj redondea al minuto más cercano y registra como mínimo un minuto
        al cerrar la jornada.
      </p>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={exit ? "OUT" : "IN"} />
      <fieldset disabled={pending}>
        {!exit && (
          <label className="field">
            Proyecto
            <select name="project_id" required defaultValue={projects.some(p=>p.id===preferredProjectId)?preferredProjectId??"":""}>
              <option value="">Selecciona un proyecto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
      {!exit && !projects.length && (
        <p className="text-sm">
          No hay proyectos disponibles para tu cuenta. Un administrador debe
          revisar las asignaciones.
        </p>
      )}
      {progress && (
        <p role="status" aria-live="polite">
          {progress}
        </p>
      )}
      <SubmitButton pending={progress || "Guardando…"}>
        {exit ? "Marcar salida" : "Marcar entrada"}
      </SubmitButton>
    </form>
  );
}
