import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { TimeForm } from "@/components/time-form";
import { LocalDateTime } from "@/components/work-form";
import { EntitySelect } from "@/components/entity-select";
import { Input } from "@/components/ui/input";
type Entry = {
  id: string;
  worker_id: string | null;
  project_id: string | null;
  starts_at: string;
  ends_at: string | null;
  break_minutes: number;
  minutes: number | null;
  status: string;
  notes: string;
  version: number;
  reason: string;
};
export default async function TimeDetail({
  params,
}: {
  params: Promise<{ companyId: string; entryId: string }>;
}) {
  const { companyId, entryId } = await params,
    isNew = entryId === "nuevo";
  if (!isNew && !uuid.safeParse(entryId).success) notFound();
  const { db, member, company } = await requireModule(
      companyId,
      "horasfix",
      isNew ? "write" : "read",
    ),
    manager = ["owner", "admin"].includes(member.role),
    write = canAccess(member, "horasfix", "write");
  if (isNew && !manager) notFound();
  let e: Entry = {
    id: randomUUID(),
    worker_id: null,
    project_id: null,
    starts_at: "",
    ends_at: null,
    break_minutes: 0,
    minutes: null,
    status: "PENDIENTE",
    notes: "",
    reason: "",
    version: 0,
  };
  if (!isNew) {
    const { data, error } = await db
      .from("time_entries")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", entryId)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar la marcación.");
    if (!data) notFound();
    e = data;
  }
  const own = await db.rpc("my_time_worker", { p_company: companyId });
  if (own.error) throw new Error("No se pudo comprobar el trabajador.");
  const mine = own.data?.[0];
  async function relation(table: "workers" | "projects", id: string | null) {
    if (!id) return null;
    let name =
      table === "workers" ? "Trabajador vinculado" : "Proyecto vinculado";
    if (table === "workers" && id === mine?.id) name = mine.name;
    if (
      canAccess(member, table === "workers" ? "trabajadores" : "fin-proyectos")
    ) {
      const { data, error } = await db
        .from(table)
        .select("name")
        .eq("company_id", companyId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("No se pudo cargar la relación.");
      if (data) name = data.name;
    }
    return { id, name };
  }
  const [worker, project] = await Promise.all([
    relation("workers", e.worker_id),
    relation("projects", e.project_id),
  ]);
  const requests = isNew
    ? { data: [], error: null }
    : await db
        .from("time_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("entry_id", e.id)
        .order("created_at", { ascending: false })
        .limit(50);
  if (requests.error) throw new Error("No se pudieron cargar las solicitudes.");
  const dates = new Intl.DateTimeFormat("es", {
    timeZone: company.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  function fields(start: string, end: string | null, rest: number) {
    return (
      <>
        <label className="field">
          Entrada
          <LocalDateTime
            field={{ name: "starts_at", label: "Entrada", required: true }}
            value={start}
          />
        </label>
        <label className="field">
          Salida
          <LocalDateTime
            field={{ name: "ends_at", label: "Salida", required: true }}
            value={end ?? ""}
          />
        </label>
        <label className="field">
          Descanso (minutos)
          <Input
            type="number"
            name="break_minutes"
            min={0}
            max={10080}
            required
            defaultValue={rest}
          />
        </label>
      </>
    );
  }
  return (
    <>
      <h1 className="page-title mb-4">
        {isNew ? "Registrar horas" : `Marcación · ${worker?.name}`}
      </h1>
      <div className="flex gap-5 mb-6">
        <Link className="underline" href={`/app/${companyId}/horas`}>
          Volver a Horas
        </Link>
        {!isNew && (
          <Link
            className="underline"
            href={`/app/${companyId}/historial/time_entries/${e.id}`}
          >
            Historial de correcciones
          </Link>
        )}
      </div>
      {!isNew && (
        <section className="card mb-6">
          <p className="font-semibold">
            {e.status} · Revisión {e.version}
          </p>
          <p>
            {dates.format(new Date(e.starts_at))} →{" "}
            {e.ends_at ? dates.format(new Date(e.ends_at)) : "Jornada abierta"}
          </p>
          <p>
            Tiempo neto:{" "}
            {e.minutes === null
              ? "Pendiente de salida"
              : `${Math.floor(e.minutes / 60)} h ${e.minutes % 60} min`}{" "}
            · Descanso: {e.break_minutes} min
          </p>
          <p>Proyecto: {project?.name ?? "Sin asignar"}</p>
          <p className="whitespace-pre-wrap">{e.notes}</p>
          <p className="text-sm">
            Motivo del último ajuste: {e.reason || "Marcación del reloj"}
          </p>
        </section>
      )}
      {manager && (
        <section className="card mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {isNew ? "Registro administrativo" : "Corregir o aprobar horas"}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            El motivo se conserva. Cambiar fechas, trabajador, proyecto o
            descanso de un registro aprobado exige aprobarlo de nuevo.
          </p>
          <TimeForm
            key={`edit:${e.version}`}
            companyId={companyId}
            operation="save"
            label="Guardar marcación"
          >
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="version" value={e.version} />
            <EntitySelect
              companyId={companyId}
              kind="workers"
              name="worker_id"
              label="Trabajador"
              initial={worker}
              canSearch
            />
            <EntitySelect
              companyId={companyId}
              kind="projects"
              name="project_id"
              label="Proyecto"
              initial={project}
              canSearch
            />
            {fields(e.starts_at, e.ends_at, e.break_minutes)}
            <label className="field">
              Estado
              <select name="status" defaultValue={e.status}>
                <option value="PENDIENTE">Pendiente</option>
                <option value="APROBADO">Aprobado</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </label>
            <label className="field md:col-span-2">
              Notas
              <textarea name="notes" maxLength={2000} defaultValue={e.notes} />
            </label>
            <label className="field md:col-span-2">
              Motivo / constancia de revisión
              <Input name="reason" required minLength={3} maxLength={2000} />
            </label>
          </TimeForm>
        </section>
      )}
      {!isNew &&
        write &&
        (manager || mine?.id === e.worker_id) &&
        e.status !== "ANULADO" &&
        !requests.data?.some((r) => r.status === "PENDIENTE") && (
          <section className="card mb-6">
            <h2 className="text-xl font-semibold mb-4">Solicitar corrección</h2>
            <TimeForm
              key={`request:${e.version}`}
              companyId={companyId}
              operation="request"
              label="Enviar solicitud"
            >
              <input type="hidden" name="id" value={randomUUID()} />
              <input type="hidden" name="entry_id" value={e.id} />
              <input type="hidden" name="version" value={e.version} />
              {fields(e.starts_at, e.ends_at, e.break_minutes)}
              <label className="field md:col-span-2">
                Motivo
                <Input name="reason" required minLength={3} maxLength={2000} />
              </label>
            </TimeForm>
          </section>
        )}
      {!isNew && (
        <section className="card">
          <h2 className="text-xl font-semibold mb-4">
            Solicitudes de esta marcación
          </h2>
          {requests.data?.map((r) => (
            <div className="border-t py-4" key={r.id}>
              <p className="font-semibold">{r.status}</p>
              <p>
                {dates.format(new Date(r.starts_at))} →{" "}
                {dates.format(new Date(r.ends_at))} · Descanso:{" "}
                {r.break_minutes} min
              </p>
              <p>{r.reason}</p>
              <p>{r.decision_note}</p>
              <Link
                className="underline text-sm"
                href={`/app/${companyId}/historial/time_requests/${r.id}`}
              >
                Historial
              </Link>
              {manager && r.status === "PENDIENTE" && (
                <div className="mt-4">
                  <TimeForm
                    companyId={companyId}
                    operation="decision"
                    label="Registrar decisión"
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="version" value={r.version} />
                    <label className="field">
                      Decisión
                      <select name="decision">
                        <option value="reject">Rechazar</option>
                        <option value="approve">Aplicar corrección</option>
                      </select>
                    </label>
                    <label className="field">
                      Motivo
                      <Input
                        name="reason"
                        minLength={3}
                        maxLength={2000}
                        required
                      />
                    </label>
                  </TimeForm>
                </div>
              )}
            </div>
          ))}
          {!requests.data?.length && <p>Sin solicitudes.</p>}
          {requests.data?.length === 50 && (
            <p className="text-sm">
              Se muestran las 50 solicitudes más recientes. El historial
              completo se conserva.
            </p>
          )}
        </section>
      )}
    </>
  );
}
