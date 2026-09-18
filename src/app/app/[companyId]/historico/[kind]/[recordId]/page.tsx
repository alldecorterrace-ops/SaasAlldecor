import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import {
  historicalBusinessSchema,
  historicalKindSchema,
  historicalSections,
} from "@/lib/historical-business";
import { HistoricalNavigation } from "@/components/historical-navigation";
import { HistoricalBusinessDetail } from "@/components/historical-business-detail";
import { customerMigrationReason } from "@/lib/customer-migration";
import { projectMigrationReason } from "@/lib/project-migration";
export default async function BusinessHistoryDetail({
  params,
}: {
  params: Promise<{ companyId: string; kind: string; recordId: string }>;
}) {
  const p = await params,
    k = historicalKindSchema.safeParse(p.kind);
  if (!k.success || !uuid.safeParse(p.recordId).success) notFound();
  const kind = k.data,
    { db, member } = await requireModule(
      p.companyId,
      historicalSections[kind].module,
    );
  const { data, error } = await db
    .from("historical_business")
    .select("presentation,client_id,project_id,invoice_id,estimate_id")
    .eq("company_id", p.companyId)
    .eq("kind", kind)
    .eq("id", p.recordId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el registro histórico.");
  if (!data) notFound();
  const base = `/app/${p.companyId}`,
    links: { label: string; href: string }[] = [];
  if (
    kind === "invoices" &&
    (member.role === "owner" || member.role === "admin")
  )
    links.push({
      label: "Conciliación de facturas y pagos",
      href: `${base}/facturas/conciliacion`,
    });
  const migration =
    kind === "clients"
      ? await db
          .from("historical_customer_migrations")
          .select("customer_id,state,review_reasons")
          .eq("company_id", p.companyId)
          .eq("historical_id", p.recordId)
          .maybeSingle()
      : { data: null, error: null };
  if (migration.error)
    throw new Error("No se pudo consultar la migración del cliente.");
  if (migration.data?.customer_id)
    links.push({
      label: "Abrir ficha editable",
      href: `${base}/clientes/${migration.data.customer_id}`,
    });
  const projectMigration =
    kind === "projects"
      ? await db
          .from("historical_project_migrations")
          .select("project_id,state,review_reasons")
          .eq("company_id", p.companyId)
          .eq("historical_id", p.recordId)
          .maybeSingle()
      : { data: null, error: null };
  if (projectMigration.error)
    throw new Error("No se pudo consultar la migración del proyecto.");
  if (projectMigration.data?.project_id)
    links.push({
      label: "Abrir proyecto editable",
      href: `${base}/proyectos/${projectMigration.data.project_id}`,
    });
  if (kind === "invoices" || kind === "payments") {
    const operational =
      kind === "invoices"
        ? await db
            .from("invoices")
            .select("id")
            .eq("company_id", p.companyId)
            .eq("historical_invoice_id", p.recordId)
            .maybeSingle()
        : await db
            .from("payments")
            .select("invoice_id")
            .eq("company_id", p.companyId)
            .eq("historical_payment_id", p.recordId)
            .maybeSingle();
    if (operational.error)
      throw new Error("No se pudo consultar la incorporación financiera.");
    const invoiceId =
      operational.data &&
      ("invoice_id" in operational.data
        ? operational.data.invoice_id
        : operational.data.id);
    if (invoiceId)
      links.push({
        label: "Abrir factura operativa",
        href: `${base}/facturas/${invoiceId}`,
      });
  }
  for (const [field, target, label] of [
    ["client_id", "clients", "Cliente original"],
    ["project_id", "projects", "Proyecto original"],
    ["invoice_id", "invoices", "Factura original"],
  ] as const) {
    if (data[field] && canAccess(member, historicalSections[target].module))
      links.push({ label, href: `${base}/historico/${target}/${data[field]}` });
  }
  if (data.estimate_id && canAccess(member, "fin-estimados"))
    links.push({
      label: "Estimado original",
      href: `${base}/estimados/historico/${data.estimate_id}`,
    });
  const filter =
    kind === "clients"
      ? "client"
      : kind === "projects"
        ? "project"
        : kind === "invoices"
          ? "invoice"
          : null;
  if (filter)
    for (const target of (kind === "clients"
      ? ["projects", "invoices", "payments"]
      : kind === "projects"
        ? ["invoices", "payments"]
        : ["payments"]) as (keyof typeof historicalSections)[]) {
      if (canAccess(member, historicalSections[target].module))
        links.push({
          label: `Ver ${historicalSections[target].label.toLowerCase()} relacionados`,
          href: `${base}/historico/${target}?${filter}=${p.recordId}`,
        });
    }
  return (
    <>
      <HistoricalNavigation companyId={p.companyId} member={member} />
      <Link
        className="text-primary underline block mb-5"
        href={`${base}/historico/${kind}`}
      >
        Volver a {historicalSections[kind].label.toLowerCase()} históricos
      </Link>
      <HistoricalBusinessDetail
        record={historicalBusinessSchema.parse(data.presentation)}
      />
      {migration.data?.state === "review" && (
        <aside className="card mt-5">
          <h2 className="font-semibold">
            Pendiente de incorporación al módulo editable
          </h2>
          <ul className="list-disc pl-5 mt-3 text-sm">
            {(migration.data.review_reasons as string[]).map((reason) => (
              <li key={reason}>{customerMigrationReason(reason)}</li>
            ))}
          </ul>
        </aside>
      )}
      {projectMigration.data?.state === "review" && (
        <aside className="card mt-5">
          <h2 className="font-semibold">Proyecto pendiente de incorporación</h2>
          <ul className="list-disc pl-5 mt-3 text-sm">
            {(projectMigration.data.review_reasons as string[]).map(
              (reason) => (
                <li key={reason}>{projectMigrationReason(reason)}</li>
              ),
            )}
          </ul>
        </aside>
      )}
      {!!links.length && (
        <nav
          aria-label="Registros relacionados"
          className="card mt-5 flex flex-wrap gap-4"
        >
          {links.map((link) => (
            <Link
              className="text-primary underline"
              key={link.href}
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
