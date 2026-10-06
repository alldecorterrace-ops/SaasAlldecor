"use client";
import { useRef, useState } from "react";
import { usePreservedActionState } from "./use-preserved-action-state";
import {
  timeAction,
  type TimeState,
} from "@/app/app/[companyId]/horas/actions";
import { getPunchGPS, GPSFailure } from "@/lib/time-gps";
import { visitReasons, type PunchProject } from "@/lib/time-visits";
import { Input } from "./ui/input";
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
  projects: PunchProject[];
  preferredProjectId?: string | null;
}) {
  const preferred = projects.find((p) => p.id === preferredProjectId);
  const [projectId, setProjectId] = useState(preferred?.id ?? "");
  const [completedView, setCompletedView] = useState(
    preferred?.state === "terminado",
  );
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const completed =
    projects.find((p) => p.id === projectId)?.state === "terminado";
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const shown = projects.filter(
    (p) =>
      (p.state === "terminado") === completedView &&
      normalize(p.name).includes(normalize(search.trim())),
  );
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
          <div className="space-y-4">
            <div
              role="group"
              aria-label="Estado del proyecto"
              className="flex flex-wrap gap-3"
            >
              {[false, true].map((view) => (
                <button
                  key={String(view)}
                  type="button"
                  aria-pressed={completedView === view}
                  className={`rounded-lg border px-4 py-3 ${completedView === view ? "bg-primary text-primary-foreground" : "bg-background"}`}
                  onClick={() => {
                    setCompletedView(view);
                    setSearch("");
                    setProjectId("");
                    setReason("");
                  }}
                >
                  {view ? "Proyectos terminados" : "Activos"}
                </button>
              ))}
            </div>
            {completedView && (
              <p className="text-sm">
                Para limpieza, garantía, reparación o remodelación. La visita se
                registra en el mismo proyecto.
              </p>
            )}
            <label className="field">
              Buscar proyecto
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setProjectId("");
                  setReason("");
                }}
              />
            </label>
            <label className="field">
              Proyecto
              <select
                name="project_id"
                required
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setReason("");
                }}
              >
                <option value="">Selecciona un proyecto</option>
                {shown.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            {!shown.length && (
              <p className="text-sm">
                No hay proyectos disponibles en esta vista.
              </p>
            )}
            {completed && (
              <label className="field">
                Motivo de la visita
                <select
                  name="visit_reason"
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  <option value="">Selecciona el motivo</option>
                  {Object.entries(visitReasons).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
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
