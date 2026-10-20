import Link from "next/link";
import { Input } from "@/components/ui/input";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { ActionForm } from "@/components/action-form";
import { webAction } from "./actions";
import {
  saveNoticeSettings,
  processNotice,
  assignBlockedNotice,
} from "./notices-actions";
import { webNoticeConfig } from "@/lib/web-notices";
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
  const [
    { data: forms, error: fe },
    { data: requests, error: re, count },
    { data: noticeSettings, error: ne },
  ] = await Promise.all([
    db
      .from("web_forms")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("web_requests")
      .select("*,web_notice_events(id,kind,recipient,status,created_at)", {
        count: "exact",
      })
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id")
      .range((page - 1) * 20, page * 20 - 1),
    db
      .from("web_notice_settings")
      .select("staff_email,version")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);
  if (fe || re || ne) throw new Error("No se pudieron cargar las solicitudes.");
  const write = canAccess(member, "estimadosweb", "write"),
    base = `/app/${companyId}/solicitudes-web`,
    site = process.env.NEXT_PUBLIC_SITE_URL ?? "",
    noticeConfig = webNoticeConfig(process.env, companyId),
    administer = ["owner", "admin"].includes(member.role) && write;
  const noticeLabels: Record<string, string> = {
    pending: "Pendiente",
    blocked: "Sin destinatario configurado",
    processing: "En curso · revisar antes de repetir",
    captured: "Prueba conservada · sin envío externo",
    queued: "Aceptado por el servidor de correo",
    failed: "Fallido · requiere revisión",
    unknown: "Resultado incierto · revisar recepción",
  };
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
      {administer && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Aviso interno de esta empresa</h2>
          <p>
            El formulario genera una confirmación al solicitante y un aviso
            interno con sus datos. El destinatario se conserva al recibir cada
            solicitud.
          </p>
          <ActionForm
            action={saveNoticeSettings.bind(null, companyId)}
            label="Guardar dirección de avisos"
          >
            <input
              type="hidden"
              name="version"
              value={noticeSettings?.version ?? 0}
            />
            <label className="field">
              Dirección del aviso interno
              <Input
                type="email"
                name="email"
                required
                maxLength={254}
                defaultValue={noticeSettings?.staff_email ?? ""}
              />
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirmed" value="yes" required />
              Confirmo que esta dirección debe recibir las consultas de esta
              empresa.
            </label>
            {process.env.APP_ENVIRONMENT === "staging" && (
              <p>
                Pruebas con @saasalldecor.invalid; los mensajes se conservan y
                no se envían.
              </p>
            )}
          </ActionForm>
        </section>
      )}
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
            {r.data.contact_preference && (
              <p>Preferencia de contacto: {r.data.contact_preference}</p>
            )}
            {r.data.appointment_date && (
              <p>Fecha de cita solicitada: {r.data.appointment_date}</p>
            )}
            {!!r.web_notice_events?.length && (
              <section className="space-y-3">
                <h4 className="font-semibold">Avisos de esta solicitud</h4>
                {r.web_notice_events.map(
                  (event: {
                    id: string;
                    kind: string;
                    recipient: string | null;
                    status: string;
                  }) => (
                    <article
                      key={event.id}
                      className="rounded border p-3 space-y-2"
                    >
                      <p>
                        {event.kind === "customer"
                          ? "Confirmación al solicitante"
                          : "Aviso interno"}{" "}
                        · {noticeLabels[event.status] ?? "Revisar registro"}
                      </p>
                      <p className="break-all">
                        {event.recipient ??
                          "No había dirección interna al recibir esta solicitud."}
                      </p>
                      {event.status === "captured" && (
                        <a
                          className="underline"
                          href={`/api/web-notices/${companyId}/${event.id}`}
                        >
                          Descargar aviso de prueba
                        </a>
                      )}
                      {event.status === "pending" && write && noticeConfig && (
                        <ActionForm
                          action={processNotice.bind(null, companyId, event.id)}
                          label={
                            noticeConfig.mode === "capture"
                              ? "Conservar aviso de prueba"
                              : "Enviar aviso pendiente"
                          }
                        >
                          {noticeConfig.mode === "send" && (
                            <label>
                              <input
                                type="checkbox"
                                name="confirmed"
                                value="yes"
                                required
                              />
                              Confirmo el envío de este aviso al destinatario
                              indicado.
                            </label>
                          )}
                        </ActionForm>
                      )}
                      {event.status === "blocked" &&
                        administer &&
                        noticeSettings && (
                          <ActionForm
                            action={assignBlockedNotice.bind(
                              null,
                              companyId,
                              event.id,
                            )}
                            label="Asignar dirección configurada"
                          >
                            <input
                              type="hidden"
                              name="recipient"
                              value={noticeSettings.staff_email}
                            />
                            <p>
                              Se asignará {noticeSettings.staff_email} al aviso
                              interno todavía sin destinatario.
                            </p>
                            <label>
                              <input
                                type="checkbox"
                                name="confirmed"
                                value="yes"
                                required
                              />
                              Confirmo esta dirección para este aviso.
                            </label>
                          </ActionForm>
                        )}
                    </article>
                  ),
                )}
              </section>
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
