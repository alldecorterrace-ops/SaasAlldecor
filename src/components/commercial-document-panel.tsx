import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { commercialModule } from "@/lib/commercial-documents";
import { CommercialDocumentForm } from "./commercial-document-form";
export async function CommercialDocumentPanel({
  companyId,
  kind,
  record,
  version,
  canGenerate,
}: {
  companyId: string;
  kind: "estimate" | "invoice";
  record: string;
  version: number;
  canGenerate: boolean;
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
  return (
    <section className="card print:hidden space-y-4 mb-6">
      <h2 className="font-semibold">PDF comerciales conservados</h2>
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
    </section>
  );
}
