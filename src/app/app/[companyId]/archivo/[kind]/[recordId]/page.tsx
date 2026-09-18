import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import {
  archiveKindSchema,
  archiveLabels,
  fileStateSchema,
  historicalDocumentSchema,
} from "@/lib/historical-documents";
import { HistoricalNavigation } from "@/components/historical-navigation";
import { HistoricalDocumentDetail } from "@/components/historical-document-detail";
export default async function ArchiveDetail({
  params,
}: {
  params: Promise<{ companyId: string; kind: string; recordId: string }>;
}) {
  const p = await params,
    k = archiveKindSchema.safeParse(p.kind);
  if (!k.success || !uuid.safeParse(p.recordId).success) notFound();
  const { db, member } = await requireModule(p.companyId, "fin-estimados");
  const { data, error } = await db
    .from("historical_documents")
    .select("presentation,file_state,client_id,project_id,estimate_id")
    .eq("company_id", p.companyId)
    .eq("kind", k.data)
    .eq("id", p.recordId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el documento histórico.");
  if (!data) notFound();
  const record = historicalDocumentSchema.parse(data.presentation),
    fileState = fileStateSchema.parse(data.file_state),
    base = `/app/${p.companyId}`;
  if (
    record.relation_state === "review" &&
    member.role !== "owner" &&
    member.role !== "admin"
  )
    notFound();
  const links: { href: string; label: string }[] = [];
  if (record.relation_state === "linked") {
    if (data.client_id && canAccess(member, "clientes"))
      links.push({
        href: `${base}/historico/clients/${data.client_id}`,
        label: "Cliente original",
      });
    if (data.project_id && canAccess(member, "fin-proyectos"))
      links.push({
        href: `${base}/historico/projects/${data.project_id}`,
        label: "Proyecto original",
      });
    if (data.estimate_id)
      links.push({
        href: `${base}/estimados/historico/${data.estimate_id}`,
        label: "Estimado original",
      });
  }
  return (
    <>
      <HistoricalNavigation companyId={p.companyId} member={member} />
      <Link
        className="text-primary underline block mb-5"
        href={`${base}/archivo/${k.data}`}
      >
        Volver a {archiveLabels[k.data].toLowerCase()}
      </Link>
      <HistoricalDocumentDetail record={record} fileState={fileState} />
      {fileState === "available" && (
        <div className="card mt-5">
          <a
            className="text-primary underline font-semibold"
            href={`/api/history-files/${p.companyId}/${k.data}/${p.recordId}`}
          >
            Descargar PDF conservado
          </a>
          <p className="text-sm text-muted-foreground mt-2">
            Copia del archivo encontrado en el origen, conservada sin regenerar
            su contenido.
          </p>
        </div>
      )}
      {!!links.length && (
        <nav
          aria-label="Registros relacionados"
          className="card mt-5 flex flex-wrap gap-4"
        >
          {links.map((l) => (
            <Link className="text-primary underline" key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
