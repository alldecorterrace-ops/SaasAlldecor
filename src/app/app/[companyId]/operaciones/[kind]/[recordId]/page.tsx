import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { todayInTimezone } from "@/lib/commercial";
import { workspaceKind, workspaces } from "@/lib/workspaces";
import { WorkForm, WorkActionForm } from "@/components/work-form";
import { EntitySelect } from "@/components/entity-select";
import { Input } from "@/components/ui/input";
import { PrintButton } from "@/components/print-button";
import { ListPagination } from "@/components/list-pagination";
type WorkRecord = {
  id: string;
  name: string;
  status: string;
  project_id: string | null;
  worker_id: string | null;
  data: Record<string, string>;
  stock: string;
  version: number;
};
export default async function WorkspaceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; kind: string; recordId: string }>;
  searchParams: Promise<{ saved?: string; page?: string; files?: string }>;
}) {
  const { companyId, kind, recordId } = await params,
    k = workspaceKind(kind);
  if (!k) notFound();
  const cfg = workspaces[k],
    isNew = recordId === "nuevo";
  if (!isNew && !uuid.safeParse(recordId).success) notFound();
  const { db, member, company } = await requireModule(
      companyId,
      cfg.module,
      isNew ? "write" : "read",
    ),
    search = await searchParams,
    base = `/app/${companyId}/operaciones/${k}`;
  let r: WorkRecord = {
    id: randomUUID(),
    name: "",
    status: Object.keys(cfg.statuses)[0],
    project_id: null,
    worker_id: null,
    data: cfg.defaults,
    stock: "0",
    version: 0,
  };
  if (!isNew) {
    const { data, error } = await db
      .from("work_records")
      .select("*")
      .eq("company_id", companyId)
      .eq("kind", k)
      .eq("id", recordId)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar la ficha.");
    if (!data) notFound();
    r = data;
  }
  const readOnly = !canAccess(member, cfg.module, "write");
  async function relation(table: "projects" | "workers", id: string | null) {
    if (!id) return null;
    let name =
      table === "projects" ? "Proyecto vinculado" : "Trabajador vinculado";
    if (
      canAccess(member, table === "projects" ? "fin-proyectos" : "trabajadores")
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
  const [project, worker] = await Promise.all([
    relation("projects", r.project_id),
    relation("workers", r.worker_id),
  ]);
  const filePage = Math.max(
      1,
      Math.min(100000, parseInt(search.files ?? "1") || 1),
    ),
    page = Math.max(1, Math.min(100000, parseInt(search.page ?? "1") || 1));
  const attachments = isNew
    ? { data: [], error: null, count: 0 }
    : await db
        .from("work_attachments")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .eq("record_id", r.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range((filePage - 1) * 20, filePage * 20 - 1);
  if (attachments.error)
    throw new Error("No se pudieron cargar los documentos.");
  const files = await Promise.all(
    (attachments.data ?? []).map(async (f) => {
      const { data, error } = await db.storage
        .from("work-files")
        .createSignedUrl(f.path, 300);
      if (error) throw new Error("No se pudo preparar el documento privado.");
      return { ...f, url: data.signedUrl };
    }),
  );
  const movements =
    k === "inventory" && !isNew
      ? await db
          .from("inventory_movements")
          .select("*", { count: "exact" })
          .eq("company_id", companyId)
          .eq("item_id", r.id)
          .order("created_at", { ascending: false })
          .order("id")
          .range((page - 1) * 20, page * 20 - 1)
      : { data: [], error: null, count: 0 };
  if (movements.error)
    throw new Error("No se pudieron cargar los movimientos.");
  const reversals = new Set<string>();
  if (movements.data?.length) {
    const { data, error } = await db
      .from("inventory_movements")
      .select("reversal_of")
      .eq("company_id", companyId)
      .eq("item_id", r.id)
      .in(
        "reversal_of",
        movements.data.map((m) => m.id),
      );
    if (error)
      throw new Error("No se pudo cargar el estado de los movimientos.");
    data?.forEach((m) => reversals.add(m.reversal_of));
  }
  return (
    <>
      <p className="eyebrow">{cfg.title}</p>
      <h1 className="page-title mt-2 mb-4">
        {isNew ? `Crear ${cfg.singular}` : r.name}
      </h1>
      <div className="flex flex-wrap gap-5 mb-6 print:hidden">
        <Link className="underline" href={base}>
          Volver al listado
        </Link>
        {!isNew && (
          <Link
            className="underline"
            href={`/app/${companyId}/historial/work_records/${r.id}`}
          >
            Versiones e historial
          </Link>
        )}
        {!isNew &&
          (k === "manuals" ? (
            <Link className="underline" href={`${base}/${r.id}/imprimir`}>
              Imprimir / guardar PDF
            </Link>
          ) : (
            <PrintButton />
          ))}
      </div>
      <p className="text-sm text-muted-foreground mb-5">{cfg.description}</p>
      {k === "inventory" && !isNew && (
        <div className="card mb-5">
          <p className="text-sm">Existencia actual</p>
          <p className="text-3xl font-semibold">
            {r.stock} {r.data.unit}
          </p>
          <p className="text-sm">
            Ubicación: {r.data.location || "Sin asignar"} · Mínimo:{" "}
            {r.data.minimum}
          </p>
        </div>
      )}
      <WorkForm
        key={`${r.id}:${r.version}`}
        companyId={companyId}
        kind={k}
        id={r.id}
        version={r.version}
        name={r.name}
        status={r.status}
        statuses={cfg.statuses}
        data={r.data}
        fields={cfg.fields}
        readOnly={readOnly}
        saved={search.saved === "1"}
      >
        {cfg.project && (
          <EntitySelect
            companyId={companyId}
            kind="projects"
            name="project_id"
            label="Proyecto"
            initial={project}
            canSearch={canAccess(member, "fin-proyectos") && !readOnly}
          />
        )}{" "}
        {cfg.worker && (
          <EntitySelect
            companyId={companyId}
            kind="workers"
            name="worker_id"
            label="Responsable"
            initial={worker}
            canSearch={canAccess(member, "trabajadores") && !readOnly}
          />
        )}
      </WorkForm>
      {k === "inventory" && !isNew && (
        <section className="card mt-6">
          <h2 className="text-xl font-semibold mb-4">
            Movimientos de existencias
          </h2>
          {!readOnly && r.status === "ACTIVO" && (
            <div className="mb-6 print:hidden">
              <WorkActionForm
                key={`movement:${r.version}`}
                companyId={companyId}
                kind={k}
                operation="movement"
                label="Registrar movimiento"
              >
                <input type="hidden" name="id" value={randomUUID()} />
                <input type="hidden" name="item_id" value={r.id} />
                <input type="hidden" name="version" value={r.version} />
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="field">
                    Cantidad (+ entrada / − salida)
                    <Input
                      name="quantity"
                      required
                      inputMode="decimal"
                      pattern="-?[0-9]{1,9}([.][0-9]{1,3})?"
                    />
                  </label>
                  <label className="field">
                    Fecha
                    <Input
                      name="movement_date"
                      type="date"
                      required
                      defaultValue={todayInTimezone(company.timezone)}
                    />
                  </label>
                  <label className="field">
                    Referencia
                    <Input name="reference" maxLength={100} />
                  </label>
                  <label className="field">
                    Motivo
                    <Input
                      name="reason"
                      required
                      minLength={3}
                      maxLength={2000}
                    />
                  </label>
                  <EntitySelect
                    companyId={companyId}
                    kind="projects"
                    name="project_id"
                    label="Proyecto de destino"
                    initial={null}
                    canSearch={canAccess(member, "fin-proyectos")}
                  />
                </div>
              </WorkActionForm>
            </div>
          )}
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cantidad</th>
                  <th>Referencia / motivo</th>
                  <th>Reverso</th>
                </tr>
              </thead>
              <tbody>
                {movements.data?.map((m) => (
                  <tr key={m.id}>
                    <td>{m.movement_date}</td>
                    <td>
                      {m.quantity} {r.data.unit}
                    </td>
                    <td>
                      {m.reference}
                      <p>{m.reason}</p>
                    </td>
                    <td>
                      {m.reversal_of ? (
                        "Movimiento de reverso"
                      ) : reversals.has(m.id) ? (
                        "Revertido"
                      ) : !readOnly && r.status === "ACTIVO" ? (
                        <details className="print:hidden">
                          <summary>Corregir con reverso</summary>
                          <WorkActionForm
                            key={`${m.id}:${r.version}`}
                            companyId={companyId}
                            kind={k}
                            operation="movement"
                            label="Registrar reverso"
                          >
                            <input
                              type="hidden"
                              name="id"
                              value={randomUUID()}
                            />
                            <input type="hidden" name="item_id" value={r.id} />
                            <input
                              type="hidden"
                              name="version"
                              value={r.version}
                            />
                            <input
                              type="hidden"
                              name="reversal_of"
                              value={m.id}
                            />
                            <input
                              type="hidden"
                              name="movement_date"
                              value={todayInTimezone(company.timezone)}
                            />
                            <label className="field">
                              Motivo
                              <Input
                                name="reason"
                                required
                                minLength={3}
                                maxLength={2000}
                              />
                            </label>
                          </WorkActionForm>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!movements.data?.length && (
              <p className="py-4">Sin movimientos registrados.</p>
            )}
          </div>
          <ListPagination
            path={`${base}/${r.id}`}
            page={page}
            count={movements.count ?? 0}
            query={{ files: String(filePage) }}
          />
        </section>
      )}
      {!isNew && (
        <section className="card mt-6">
          <h2 className="text-xl font-semibold mb-3">
            Documentos y fotografías
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            PDF, PNG, JPEG o WebP de hasta 5 MB. Archivar conserva el original y
            permite restaurarlo.
          </p>
          {!readOnly && (
            <div className="print:hidden mb-5">
              <WorkActionForm
                key={`file:${r.version}`}
                companyId={companyId}
                kind={k}
                operation="attachment"
                label="Adjuntar archivo"
              >
                <input type="hidden" name="record_id" value={r.id} />
                <input type="hidden" name="version" value={r.version} />
                <Input
                  name="file"
                  aria-label="Documento o fotografía"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  required
                />
              </WorkActionForm>
            </div>
          )}
          <ul className="space-y-4">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap gap-4 items-start border-t pt-3"
              >
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline break-all"
                >
                  {f.name}
                </a>
                <span>{f.active ? "Activo" : "Archivado"}</span>
                {!readOnly && (
                  <div className="print:hidden">
                    <WorkActionForm
                      key={`${f.id}:${r.version}`}
                      companyId={companyId}
                      kind={k}
                      operation="attachment"
                      label={f.active ? "Archivar" : "Restaurar"}
                    >
                      <input type="hidden" name="record_id" value={r.id} />
                      <input type="hidden" name="version" value={r.version} />
                      <input type="hidden" name="attachment_id" value={f.id} />
                    </WorkActionForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!files.length && <p>Sin archivos adjuntos.</p>}
          <div className="flex gap-5 mt-4 print:hidden">
            {filePage > 1 && (
              <Link
                className="underline"
                href={`${base}/${r.id}?page=${page}&files=${filePage - 1}`}
              >
                Archivos anteriores
              </Link>
            )}
            {filePage * 20 < (attachments.count ?? 0) && (
              <Link
                className="underline"
                href={`${base}/${r.id}?page=${page}&files=${filePage + 1}`}
              >
                Más archivos
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}
