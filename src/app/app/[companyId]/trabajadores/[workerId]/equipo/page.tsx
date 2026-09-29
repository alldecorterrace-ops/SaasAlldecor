import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { todayInTimezone } from "@/lib/commercial";
import { workforceRoles } from "@/lib/workforce";
import { WorkforceForm } from "@/components/workforce-form";
import { EntitySelect } from "@/components/entity-select";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/list-pagination";
export default async function WorkerTeam({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; workerId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { companyId, workerId } = await params;
  if (!uuid.safeParse(workerId).success) notFound();
  const { db, member, company } = await requireModule(
    companyId,
    "trabajadores",
  );
  if (!["owner", "admin"].includes(member.role)) notFound();
  const page = Math.max(
    1,
    Math.min(100000, parseInt((await searchParams).page ?? "1") || 1),
  );
  const [workerResult, profileResult, assignmentResult] = await Promise.all([
    db
      .from("workers")
      .select("id,name,active,user_id")
      .eq("company_id", companyId)
      .eq("id", workerId)
      .maybeSingle(),
    db
      .from("workforce_profiles")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", workerId)
      .maybeSingle(),
    db
      .from("workforce_assignments")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .eq("worker_id", workerId)
      .order("starts_at", { ascending: false })
      .order("id")
      .range((page - 1) * 20, page * 20 - 1),
  ]);
  if (workerResult.error || profileResult.error || assignmentResult.error)
    throw new Error("No se pudo consultar el equipo.");
  if (!workerResult.data) notFound();
  const worker = workerResult.data,
    profile = profileResult.data,
    rows = assignmentResult.data ?? [];
  let supervisor: { id: string; name: string } | null = null;
  if (profile?.supervisor_id) {
    const { data, error } = await db
      .from("workers")
      .select("id,name")
      .eq("company_id", companyId)
      .eq("id", profile.supervisor_id)
      .single();
    if (error) throw new Error("No se pudo consultar el encargado.");
    supervisor = data;
  }
  const projectIds = [...new Set(rows.map((x) => x.project_id as string))],
    names = new Map<string, string>();
  if (projectIds.length) {
    const { data, error } = await db
      .from("projects")
      .select("id,name")
      .eq("company_id", companyId)
      .in("id", projectIds);
    if (error) throw new Error("No se pudieron consultar las obras.");
    data?.forEach((p) => names.set(p.id, p.name));
  }
  const base = `/app/${companyId}`,
    path = `${base}/trabajadores/${workerId}/equipo`;
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: company.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(value))
      : "";

  return (
    <>
      <p className="eyebrow">Equipo / Trabajadores</p>
      <h1 className="page-title mt-2">Equipo y asignaciones</h1>
      <p className="mt-2 mb-5">{worker.name}</p>
      <nav className="flex flex-wrap gap-5 mb-6">
        <Link className="underline" href={`${base}/trabajadores/${workerId}`}>
          Volver a la ficha
        </Link>
        <Link className="underline" href={`${base}/horas/equipo`}>
          Consultar equipo y obras
        </Link>
      </nav>
      <section className="card mb-6">
        <h2 className="text-xl font-semibold mb-3">Rol y encargado</h2>
        <p className="text-sm mb-4">
          El encargado puede consultar su equipo directo; oficina puede
          consultar todos los perfiles de equipo activos. Esta configuración no
          cambia los permisos de Horas, Gastos ni el acceso general a la
          empresa.
        </p>
        <p className="text-sm mb-4">
          Cuenta:{" "}
          {worker.user_id
            ? "vinculada"
            : "sin vincular; puedes vincularla en la ficha"}
          . Perfil de equipo:{" "}
          {profile
            ? profile.enabled
              ? workforceRoles[profile.role as "WORKER" | "FOREMAN" | "OFFICE"]
              : "Desactivado"
            : "Sin configurar"}
          .
        </p>
        <WorkforceForm
          key={`profile:${profile?.version ?? 0}`}
          companyId={companyId}
          operation="profile"
          label="Guardar equipo"
        >
          <input type="hidden" name="id" value={workerId} />
          <input type="hidden" name="version" value={profile?.version ?? 0} />
          <input type="hidden" name="request" value={randomUUID()} />
          <label className="field">
            Rol en el equipo
            <select name="role" defaultValue={profile?.role ?? "WORKER"}>
              <option value="WORKER">Trabajador</option>
              <option value="FOREMAN">Encargado</option>
              <option value="OFFICE">Oficina</option>
            </select>
          </label>
          <EntitySelect
            companyId={companyId}
            kind="workers"
            name="supervisor_id"
            label="Encargado"
            initial={supervisor}
            canSearch={true}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={profile?.enabled ?? true}
            />
            Perfil de equipo activo
          </label>
          <label className="field">
            Motivo del cambio
            <Input name="reason" required minLength={5} maxLength={1000} />
          </label>
        </WorkforceForm>
        {profile && (
          <Link
            className="underline text-sm inline-block mt-4"
            href={`${base}/historial/workforce_profiles/${workerId}`}
          >
            Historial del equipo
          </Link>
        )}
      </section>
      <section className="card mb-6">
        <h2 className="text-xl font-semibold mb-3">Asignar una obra</h2>
        <p className="text-sm mb-4">
          Fechas en {company.timezone}, desde las 00:00 del inicio hasta las
          00:00 de la fecha final, sin incluir ese último día. Deja el final
          vacío para mantener la asignación abierta.
        </p>
        {profile?.enabled && worker.active ? (
          <WorkforceForm
            key={`new:${assignmentResult.count}`}
            companyId={companyId}
            operation="assignment"
            label="Guardar asignación"
          >
            <input type="hidden" name="id" value={randomUUID()} />
            <input type="hidden" name="request" value={randomUUID()} />
            <input type="hidden" name="version" value="0" />
            <input type="hidden" name="worker_id" value={workerId} />
            <input type="hidden" name="active" value="on" />
            <EntitySelect
              companyId={companyId}
              kind="projects"
              name="project_id"
              label="Obra"
              initial={null}
              canSearch={true}
            />
            <label className="field">
              Desde
              <Input
                type="date"
                name="starts_at"
                defaultValue={todayInTimezone(company.timezone)}
                required
              />
            </label>
            <label className="field">
              Hasta (sin incluir)
              <Input type="date" name="ends_at" />
            </label>
            <label className="field">
              Motivo
              <Input name="reason" minLength={5} maxLength={1000} required />
            </label>
          </WorkforceForm>
        ) : (
          <p>
            Activa el trabajador y configura su perfil de equipo antes de
            asignar obras.
          </p>
        )}
      </section>
      <h2 className="text-xl font-semibold mb-4">Asignaciones guardadas</h2>
      {!rows.length && (
        <p className="card">No hay asignaciones en esta página.</p>
      )}
      <div className="space-y-4">
        {rows.map((row) => (
          <section className="card" key={row.id}>
            <h3 className="font-semibold">
              {names.get(row.project_id) ?? "Obra"}
            </h3>
            <p className="text-sm mt-2 mb-4">
              {row.active ? "Activa" : "Retirada"} · {date(row.starts_at)} →{" "}
              {row.ends_at ? date(row.ends_at) : "Sin fecha final"}
            </p>
            <WorkforceForm
              key={`${row.id}:${row.version}`}
              companyId={companyId}
              operation="assignment"
              label="Guardar cambios de asignación"
            >
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="request" value={randomUUID()} />
              <input type="hidden" name="version" value={row.version} />
              <input type="hidden" name="worker_id" value={workerId} />
              <input type="hidden" name="project_id" value={row.project_id} />
              <label className="field">
                Desde
                <Input
                  type="date"
                  name="starts_at"
                  defaultValue={date(row.starts_at)}
                  required
                />
              </label>
              <label className="field">
                Hasta (sin incluir)
                <Input
                  type="date"
                  name="ends_at"
                  defaultValue={date(row.ends_at)}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={row.active}
                />
                Asignación activa
              </label>
              <label className="field">
                Motivo del cambio
                <Input name="reason" minLength={5} maxLength={1000} required />
              </label>
            </WorkforceForm>
            <Link
              className="underline text-sm inline-block mt-4"
              href={`${base}/historial/workforce_assignments/${row.id}`}
            >
              Historial de la asignación
            </Link>
          </section>
        ))}
      </div>
      <ListPagination
        path={path}
        page={page}
        count={assignmentResult.count ?? 0}
        query={{}}
      />
    </>
  );
}
