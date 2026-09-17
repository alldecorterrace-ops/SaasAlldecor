import { notFound } from "next/navigation";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { ActionForm } from "@/components/action-form";
import { shareAction } from "../actions";
export default async function Shares({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; kind: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { companyId, kind } = await params;
  if (kind !== "estimate" && kind !== "portal") notFound();
  const moduleId = kind === "estimate" ? "estimadosweb" : "portal",
    { db, member } = await requireModule(companyId, moduleId),
    sp = await searchParams,
    q = (sp.q ?? "").slice(0, 100),
    page = Math.max(1, Math.min(100000, parseInt(sp.page ?? "1") || 1)),
    filter = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const targets: { id: string; label: string; version: number }[] = [];
  if (kind === "estimate" && canAccess(member, "fin-estimados")) {
    const { data, error } = await db
      .from("estimates")
      .select("id,number,version,total,status")
      .eq("company_id", companyId)
      .in("status", ["BORRADOR", "PENDIENTE", "APROBADO"])
      .ilike("number", filter)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("No se pudieron cargar los estimados.");
    targets.push(
      ...data.map((d) => ({
        id: d.id,
        label: `${d.number} · revisión ${d.version} · $${d.total}`,
        version: d.version,
      })),
    );
  } else if (kind === "portal" && canAccess(member, "clientes")) {
    const { data, error } = await db
      .from("customers")
      .select("id,full_name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .ilike("full_name", filter)
      .order("full_name")
      .limit(50);
    if (error) throw new Error("No se pudieron cargar los clientes.");
    targets.push(
      ...data.map((d) => ({ id: d.id, label: d.full_name, version: 0 })),
    );
  }
  const { data, error, count } = await db
    .from("client_shares")
    .select(
      "id,customer_id,estimate_id,estimate_version,snapshot,expires_at,revoked,response,respondent,response_note,created_at",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("No se pudieron cargar los enlaces.");
  const write = canAccess(member, moduleId, "write"),
    base = `/app/${companyId}/compartir/${kind}`;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {kind === "estimate" ? "Estimados web" : "Portal del cliente"}
      </h1>
      {kind === "estimate" && (
        <Link className="underline" href={`/app/${companyId}/solicitudes-web`}>
          Solicitudes recibidas desde la web
        </Link>
      )}
      <p>
        {kind === "estimate"
          ? "Publica una revisión exacta y recibe la aceptación o solicitud de cambios del cliente. La aprobación financiera se registra después en Estimados."
          : "El enlace muestra únicamente proyectos y saldos de facturas del cliente seleccionado. No da acceso al equipo, costos ni notas internas."}
      </p>
      <form className="flex gap-3">
        <input
          name="q"
          placeholder={
            kind === "estimate" ? "Buscar número de estimado" : "Buscar cliente"
          }
          defaultValue={q}
        />
        <button>Buscar</button>
      </form>
      {write && (
        <ActionForm
          action={shareAction.bind(null, companyId, kind, "create")}
          label="Crear enlace privado"
        >
          <p>
            Hasta 50 resultados de búsqueda. Los enlaces vencen y pueden
            revocarse. El acceso se concede a quien posea el enlace; no verifica
            su identidad.
          </p>
          <label className="field">
            {kind === "estimate" ? "Estimado y revisión" : "Cliente"}
            <select name="target" required defaultValue="">
              <option value="">Seleccionar</option>
              {targets.map((d) => (
                <option key={d.id} value={`${d.id}:${d.version}`}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Vigencia en días
            <input
              type="number"
              required
              min="1"
              max="30"
              defaultValue="7"
              name="days"
            />
          </label>
        </ActionForm>
      )}
      <section className="space-y-4">
        <h2 className="font-semibold">Enlaces publicados</h2>
        {data.map((s) => (
          <article className="card space-y-3" key={s.id}>
            <Link
              className="underline"
              href={`/app/${companyId}/historial/client_shares/${s.id}`}
            >
              Historial del enlace
            </Link>
            <p className="font-medium">
              {s.snapshot?.number ??
                targets.find((t) => t.id === s.customer_id)?.label ??
                `Cliente ${s.customer_id}`}{" "}
              {s.estimate_version ? `· revisión ${s.estimate_version}` : ""}
            </p>
            <p>
              Vence{" "}
              {new Date(s.expires_at).toLocaleDateString("es-US", {
                timeZone: "UTC",
              })}{" "}
              ·{" "}
              {s.revoked ? "Revocado" : "Disponible solo hasta su vencimiento"}
            </p>
            {s.response && (
              <p>
                Respuesta:{" "}
                {s.response === "ACCEPTED"
                  ? "Aceptación registrada"
                  : "Solicita cambios"}{" "}
                · {s.respondent}
                <br />
                {s.response_note}
              </p>
            )}
            {s.estimate_id && canAccess(member, "fin-estimados") && (
              <Link
                className="underline"
                href={`/app/${companyId}/estimados/${s.estimate_id}`}
              >
                Revisar estimado
              </Link>
            )}
            {write && !s.revoked && (
              <ActionForm
                action={shareAction.bind(null, companyId, kind, "revoke")}
                label="Revocar enlace"
              >
                <input type="hidden" name="id" value={s.id} />
              </ActionForm>
            )}
          </article>
        ))}
        {!data.length && <p>Aún no hay enlaces.</p>}
      </section>
      <nav className="flex gap-4">
        {page > 1 && <Link href={`${base}?page=${page - 1}`}>Anterior</Link>}
        {page * 20 < (count ?? 0) && (
          <Link href={`${base}?page=${page + 1}`}>Siguiente</Link>
        )}
      </nav>
    </div>
  );
}
