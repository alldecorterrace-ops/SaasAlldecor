import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { ManualPrint } from "@/components/manual-print";
import { PrintButton } from "@/components/print-button";

export default async function PrintManual({
  params,
}: {
  params: Promise<{ companyId: string; kind: string; recordId: string }>;
}) {
  const { companyId, kind, recordId } = await params;
  if (kind !== "manuals" || !uuid.safeParse(recordId).success) notFound();
  const { db, member, company } = await requireModule(companyId, "manualfab");
  const { data: record, error } = await db
    .from("work_records")
    .select("id,name,status,version,updated_at,project_id,data")
    .eq("company_id", companyId)
    .eq("kind", "manuals")
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el manual.");
  if (!record) notFound();
  let projectName = record.project_id ? "Proyecto vinculado" : "Sin asignar";
  if (record.project_id && canAccess(member, "fin-proyectos")) {
    const { data: project, error: projectError } = await db
      .from("projects")
      .select("name")
      .eq("company_id", companyId)
      .eq("id", record.project_id)
      .maybeSingle();
    if (projectError) throw new Error("No se pudo cargar el proyecto.");
    if (project) projectName = project.name;
  }
  const { data: files, error: filesError } = await db
    .from("work_attachments")
    .select("name")
    .eq("company_id", companyId)
    .eq("record_id", recordId)
    .eq("active", true)
    .order("created_at")
    .order("id");
  if (filesError) throw new Error("No se pudieron cargar los documentos.");
  return (
    <>
      <div className="print:hidden mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-5">
          <PrintButton />
          <Link
            className="text-sm underline"
            href={`/app/${companyId}/operaciones/manuals/${recordId}`}
          >
            Volver al manual
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Copia de la revisión guardada. Los cambios pendientes del formulario
          no se incluyen.
        </p>
      </div>
      <ManualPrint
        record={record}
        companyName={company.name}
        timezone={company.timezone}
        projectName={projectName}
        documents={(files ?? []).map((file) => file.name)}
      />
    </>
  );
}
