import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { emptyLead, type Lead } from "@/lib/commercial";
import { LeadForm } from "@/components/lead-form";
export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; leadId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { companyId, leadId } = await params,
    isNew = leadId === "nuevo";
  const { db, member, company } = await requireModule(
    companyId,
    "crm",
    isNew ? "write" : "read",
  );
  let record: Lead = {
    ...emptyLead(company.timezone),
    id: randomUUID(),
    version: 0,
    customer_id: null,
  };
  if (!isNew) {
    if (!uuid.safeParse(leadId).success) notFound();
    const { data, error } = await db
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar el lead.");
    if (!data) notFound();
    record = data;
  }
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Comercial / Leads</p>
        <h1 className="page-title mt-2">
          {isNew ? "Nuevo lead" : record.full_name}
        </h1>
      </div>
      <LeadForm
        key={`${record.id}:${record.version}`}
        companyId={companyId}
        id={record.id}
        version={record.version}
        initial={record}
        readOnly={!canAccess(member, "crm", "write")}
        saved={(await searchParams).saved === "1"}
        customerId={record.customer_id}
        canConvert={
          canAccess(member, "crm", "write") &&
          canAccess(member, "clientes", "write")
        }
      />
    </>
  );
}
