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
