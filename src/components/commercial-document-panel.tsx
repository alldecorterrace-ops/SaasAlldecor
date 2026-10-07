import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { commercialModule } from "@/lib/commercial-documents";
import { CommercialDocumentForm } from "./commercial-document-form";
import { randomUUID } from "node:crypto";
import { InvoiceEmailForm } from "./invoice-email-form";
import { invoiceEmailConfig } from "@/lib/invoice-email";
import { EstimateEmailForm } from "./estimate-email-form";
import { estimateEmailConfig } from "@/lib/estimate-email";
import Link from "next/link";
export async function CommercialDocumentPanel({
  companyId,
  kind,
  record,
  version,
  canGenerate,
  canEmail = true,
}: {
  companyId: string;
  kind: "estimate" | "invoice";
  record: string;
  version: number;
  canGenerate: boolean;
  canEmail?: boolean;
}) {
  const { db, member } = await requireModule(companyId, commercialModule(kind));
  const { data, error } = await db
    .from("commercial_documents")
    .select("id,record_version,ready_at")
    .eq("company_id", companyId)
    .eq("kind", kind)
    .eq("record_id", record)
    .eq("state", "ready")
    .order("record_version", { ascending: false })
    .limit(20);
  if (error) throw new Error("No se pudieron cargar los PDF conservados.");
  const emailConfig =
    canGenerate && canEmail
      ? kind === "invoice"
        ? invoiceEmailConfig(process.env, companyId)
        : estimateEmailConfig(process.env, companyId)
      : null;
  const attempts = await db
    .from(
      kind === "invoice" ? "invoice_email_attempts" : "estimate_email_attempts",
    )
    .select("id,recipient,status,created_at,record_version")
    .eq("company_id", companyId)
    .eq(kind === "invoice" ? "invoice_id" : "estimate_id", record)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(20);
  if (attempts.error)
    throw new Error("No se pudo cargar el historial de envíos.");
  const recipient = emailConfig
    ? await db.rpc(
        kind === "invoice"
          ? "invoice_email_recipient"
          : "estimate_email_recipient",
        {
          p_company: companyId,
          [kind === "invoice" ? "p_invoice" : "p_estimate"]: record,
        },
      )
    : { data: null, error: null };
  if (recipient.error)
    throw new Error("No se pudo comprobar el destinatario del documento.");
  return (
    <section className="card print:hidden space-y-4 mb-6">
      <h2 className="font-semibold">PDF comerciales conservados</h2>
      {member.role !== "member" && (
        <Link
          className="underline text-sm"
          href={`/app/${companyId}/documentos/empresa`}
        >
          Datos comerciales de la empresa
        </Link>
      )}
      <p className="text-sm text-muted-foreground">
        Cada PDF conserva los datos de su revisión. Los cambios posteriores no
        reemplazan el archivo.
      </p>
      {canGenerate && canAccess(member, commercialModule(kind), "write") && (
        <CommercialDocumentForm
          key={`${record}:${version}`}
          companyId={companyId}
          kind={kind}
          record={record}
          version={version}
        />
      )}
      {data?.length ? (
        <ul className="space-y-2">
          {data.map((d) => (
            <li key={d.id}>
              <a
                className="underline"
                href={`/api/commercial-documents/${companyId}/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                PDF de revisión {d.record_version}
              </a>
              {d.record_version !== version && " · Revisión anterior"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">
          Todavía no hay PDF conservados para este documento.
        </p>
      )}
      {data?.length === 20 && (
        <p className="text-sm">Se muestran las 20 revisiones más recientes.</p>
      )}
      {emailConfig && canAccess(member, commercialModule(kind), "write") && (
        <div className="border-t pt-4">
          <h3 className="font-semibold mb-3">Enviar por email</h3>
          {kind === "invoice" ? (
            <InvoiceEmailForm
              key={`email:${record}:${version}`}
              companyId={companyId}
              invoice={record}
              version={version}
              request={randomUUID()}
              capture={emailConfig.mode === "capture"}
              recipient={
                typeof recipient.data === "string" ? recipient.data : null
              }
            />
          ) : (
            <EstimateEmailForm
              key={`email:${record}:${version}`}
              companyId={companyId}
              estimate={record}
              version={version}
              request={randomUUID()}
              capture={emailConfig.mode === "capture"}
              recipient={
                typeof recipient.data === "string" ? recipient.data : null
              }
            />
          )}
        </div>
      )}
      {kind === "invoice" &&
        !emailConfig &&
        canGenerate &&
        canAccess(member, "fin-invoices", "write") && (
          <p className="text-sm">
            El envío de facturas no está habilitado en este entorno.
          </p>
        )}
      {!!attempts.data?.length && (
        <div className="border-t pt-4">
          <h3 className="font-semibold mb-3">Historial de envíos</h3>
          <ul className="space-y-3 text-sm">
            {attempts.data.map((a) => (
              <li key={a.id}>
                <p>
                  Revisión {a.record_version} · {a.recipient}
                </p>
                <p>
                  {new Intl.DateTimeFormat("es", {
                    timeZone: "UTC",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(a.created_at))}{" "}
                  UTC ·{" "}
                  {
                    (
                      {
                        processing: "Resultado pendiente de confirmar",
                        captured: "Prueba capturada · Sin envío externo",
                        queued:
                          "Aceptado por el servidor · Recepción pendiente de comprobar",
                        failed: "No se completó",
                        unknown:
                          "Resultado incierto · Comprobar antes de repetir",
                      } as Record<string, string>
                    )[a.status]
                  }
                </p>
                {a.status === "captured" && (
                  <a
                    className="underline"
                    href={`/api/${kind}-email/${companyId}/${a.id}`}
                  >
                    Descargar mensaje de prueba
                  </a>
                )}
              </li>
            ))}
          </ul>
          {attempts.data.length === 20 && (
            <p className="mt-3">Se muestran los 20 envíos más recientes.</p>
          )}
        </div>
      )}
    </section>
  );
}
