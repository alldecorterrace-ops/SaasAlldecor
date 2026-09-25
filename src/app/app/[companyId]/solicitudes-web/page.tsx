import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { ActionForm } from "@/components/action-form";
import { webAction } from "./actions";
export default async function WebRequests({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "estimadosweb"),
    sp = await searchParams,
    page = Math.max(1, Math.min(100000, parseInt(sp.page ?? "1") || 1));
  const [{ data: forms, error: fe }, { data: requests, error: re, count }] =
    await Promise.all([
      db
        .from("web_forms")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("web_requests")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .order("id")
        .range((page - 1) * 20, page * 20 - 1),
    ]);
  if (fe || re) throw new Error("No se pudieron cargar las solicitudes.");
  const write = canAccess(member, "estimadosweb", "write"),
    base = `/app/${companyId}/solicitudes-web`,
    site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Solicitudes de estimados web</h1>
      <Link className="underline" href={`/app/${companyId}/compartir/estimate`}>
        Propuestas publicadas y respuestas
      </Link>
      <p>
        Recibe consultas desde un formulario público y conviértelas en leads
        después de revisar sus datos. Máximo 50 solicitudes por empresa en 24
        horas.
      </p>
      {write && (
        <ActionForm
          action={webAction.bind(null, companyId, "create")}
          label="Crear formulario público"
        >
          <p>Vigencia de 30 días. Desactívalo en cualquier momento.</p>
        </ActionForm>
      )}
      <details className="card">
        <summary>Últimos 30 formularios</summary>
        {forms?.map((f) => (
          <article key={f.id} className="py-3 space-y-2">
            <a
              className="underline break-all"
              href={`${site}/solicitar/${f.id}`}
            >
              {site}/solicitar/{f.id}
            </a>
            <p>
              {f.active ? "Válido hasta" : "Desactivado · vencimiento"}{" "}
              {new Date(f.expires_at).toLocaleDateString("es-US", {
                timeZone: "UTC",
              })}
            </p>
            {write && f.active && (
              <ActionForm
                action={webAction.bind(null, companyId, "revoke")}
                label="Desactivar"
              >
                <input type="hidden" name="id" value={f.id} />
              </ActionForm>
            )}
          </article>
        ))}
      </details>
      <section className="space-y-4">
        <h2 className="font-semibold">Solicitudes recibidas</h2>
        {requests?.map((r) => (
          <article className="card space-y-3" key={r.id}>
            <h3 className="font-semibold">
              {r.data.name} · {r.status}
            </h3>
            <p>
              {r.data.email} · {r.data.phone}
            </p>
            <p>
              {r.data.service} · {r.data.length} × {r.data.width} ×{" "}
              {r.data.height} ft
            </p>
            <p className="whitespace-pre-wrap">{r.data.message}</p>
            {(r.data.address || r.data.city || r.data.postal_code) && (
              <p>
                {[r.data.address, r.data.city, r.data.postal_code]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            {r.lead_id && canAccess(member, "crm") ? (
              <Link
                className="underline"
                href={`/app/${companyId}/leads/${r.lead_id}`}
              >
                Abrir lead
              </Link>
            ) : (
              write &&
              !r.lead_id && (
                <>
                  <ActionForm
                    action={webAction.bind(null, companyId, "convert")}
                    disabled={!canAccess(member, "crm", "write")}
                    label="Convertir en lead"
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <p>
                      Comprueba primero si este contacto ya existe en Leads o
                      Clientes.
                    </p>
                  </ActionForm>
                  {r.status !== "ARCHIVADO" && (
                    <ActionForm
                      action={webAction.bind(null, companyId, "archive")}
                      label="Archivar"
                    >
                      <input type="hidden" name="id" value={r.id} />
                    </ActionForm>
                  )}
                </>
              )
            )}
          </article>
        ))}
        {!requests?.length && <p>Aún no hay solicitudes.</p>}
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
