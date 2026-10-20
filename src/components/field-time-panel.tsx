import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fieldTimeStatusSchema } from "@/lib/field-time";
import { FieldTimeForm } from "./field-time-form";
import { Input } from "./ui/input";
export async function FieldTimePanel({
  db,
  company,
  entry,
  version,
  timezone,
  own,
  write,
  manager,
}: {
  db: SupabaseClient;
  company: string;
  entry: string;
  version: number;
  timezone: string;
  own: boolean;
  write: boolean;
  manager: boolean;
}) {
  const [status, proposals, declarations] = await Promise.all([
    db.rpc("field_time_status", { p_company: company, p_entry: entry }),
    db
      .from("time_field_proposals")
      .select("*")
      .eq("company_id", company)
      .eq("entry_id", entry)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(50),
    db
      .from("time_field_declarations")
      .select("*")
      .eq("company_id", company)
      .eq("entry_id", entry)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(50),
  ]);
  if (status.error || proposals.error || declarations.error)
    throw new Error("No se pudo consultar Campo.");
  const meta = fieldTimeStatusSchema.parse(status.data);
  if (meta.entry !== entry) throw new Error("Field time status scope mismatch");
  if (meta.version !== version)
    return (
      <p className="card mb-6">
        La marcación cambió. Recarga para ver las propuestas actuales.
      </p>
    );
  const dates = new Intl.DateTimeFormat("es", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const format = (v: string | null) =>
    v ? dates.format(new Date(v)) : "Sin salida";
  const statuses: Record<string, string> = {
    PENDIENTE: "Pendiente de Administración",
    APROBADA: "Aprobada",
    RECHAZADA: "Rechazada",
    SUSTITUIDA: "Sustituida por otra propuesta",
    ANULADA: "Anulada con la marcación",
  };
  const token = (kind: string) => (
    <>
      <input type="hidden" name="request" value={randomUUID()} />
      <input type="hidden" name="entry" value={entry} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="kind" value={kind} />
    </>
  );
  return (
    <section className="card mb-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Propuestas de Campo</h2>
        <p className="text-sm mt-2">
          Minutos vigentes: {meta.minutes ?? 0}.{" "}
          {meta.needs_review
            ? `Propuestos: ${meta.proposed_minutes ?? 0}; pendientes de revisión.`
            : meta.formal_pending
              ? "Los minutos ya fueron revisados por el Encargado; el horario solicitado sigue pendiente de Administración."
              : "Sin propuesta pendiente de revisión."}
        </p>
        {meta.locked && <p className="text-sm mt-2">Semana cerrada.</p>}
        {manager && (meta.needs_review || meta.formal_pending) && (
          <Link
            className="underline"
            href={`/app/${company}/horas/equipo/revision`}
          >
            Revisar propuesta
          </Link>
        )}
      </div>
      {own && write && meta.can_submit && (
        <>
          <div>
            <h3 className="font-semibold mb-3">
              Pedir una corrección de horario
            </h3>
            <p className="text-sm mb-4">
              Indica al menos una hora del día de entrada en {timezone}. La
              solicitud conserva la marcación y sus minutos vigentes.
            </p>
            <FieldTimeForm
              key={`request:${version}`}
              company={company}
              label="Enviar propuesta de horario"
            >
              {token("REQUEST")}
              <label className="field">
                Entrada propuesta
                <Input type="time" name="start_hour" />
              </label>
              <label className="field">
                Salida propuesta
                <Input type="time" name="end_hour" />
              </label>
              <label className="field md:col-span-2">
                Motivo
                <Input name="reason" required maxLength={240} />
              </label>
            </FieldTimeForm>
          </div>
          <div>
            <h3 className="font-semibold mb-3">Declarar hora de salida</h3>
            <p className="text-sm mb-4">
              La declaración cierra el turno con esa salida. Sus minutos
              vigentes se conservan hasta la revisión; una jornada que no tenía
              minutos permanece en cero.
            </p>
            <FieldTimeForm
              key={`declare:${version}`}
              company={company}
              label="Enviar salida declarada"
            >
              {token("DECLARE")}
              <label className="field">
                Hora de salida
                <Input type="time" name="end_hour" required />
              </label>
              <label className="field">
                Motivo
                <Input
                  name="reason"
                  maxLength={240}
                  defaultValue="Olvidé marcar la salida"
                />
              </label>
            </FieldTimeForm>
          </div>
        </>
      )}
      <div>
        <h3 className="font-semibold mb-3">Historial de propuestas</h3>
        {proposals.data?.map((r) => (
          <article className="border-t py-4" key={r.id}>
            <p className="font-semibold">{statuses[r.status]}</p>
            <p>
              {format(r.starts_at)} → {format(r.ends_at)} · Propuestos:{" "}
              {r.proposed_minutes} min
            </p>
            <p className="text-sm">
              Antes: {format(r.original_starts_at)} →{" "}
              {format(r.original_ends_at)} · {r.original_minutes} min
            </p>
            <p className="whitespace-pre-wrap">{r.reason}</p>
            {r.foreman_at && (
              <p>
                Encargado revisó {r.foreman_minutes} min;{" "}
                {r.status === "PENDIENTE"
                  ? "Administración aún debe resolver el horario."
                  : "resolución administrativa registrada."}
              </p>
            )}
            {r.decision_note && <p>Decisión: {r.decision_note}</p>}
            <Link
              className="underline text-sm"
              href={`/app/${company}/historial/time_field_proposals/${r.id}`}
            >
              Ver historial
            </Link>
          </article>
        ))}
        {!proposals.data?.length && (
          <p className="text-sm">Sin solicitudes de horario de Campo.</p>
        )}
      </div>
      <div>
        <h3 className="font-semibold mb-3">Historial de salidas declaradas</h3>
        {declarations.data?.map((r) => (
          <article className="border-t py-4" key={r.id}>
            <p className="font-semibold">
              {r.status === "PENDIENTE"
                ? "Pendiente de revisión"
                : statuses[r.status]}
            </p>
            <p>
              Salida declarada: {format(r.ends_at)} · Propuestos:{" "}
              {r.proposed_minutes} min
            </p>
            <p className="text-sm">
              Minutos originales: {r.original_minutes}.{" "}
              {r.decided_minutes !== null
                ? `Minutos en la decisión: ${r.decided_minutes}.`
                : ""}
            </p>
            <p className="whitespace-pre-wrap">{r.reason}</p>
            {r.decision_note && <p>Decisión: {r.decision_note}</p>}
            <Link
              className="underline text-sm"
              href={`/app/${company}/historial/time_field_declarations/${r.id}`}
            >
              Ver historial
            </Link>
          </article>
        ))}
        {!declarations.data?.length && (
          <p className="text-sm">Sin salidas declaradas.</p>
        )}
      </div>
      {(proposals.data?.length === 50 || declarations.data?.length === 50) && (
        <p className="text-sm">
          Se muestran hasta 50 registros de cada tipo. El historial completo se
          conserva.
        </p>
      )}
    </section>
  );
}
