import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid, type CustomerInput } from "@/lib/validation";
import { CustomerForm } from "@/components/customer-form";
import Link from "next/link";
export default async function CustomerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; customerId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { companyId, customerId } = await params;
  if (!uuid.safeParse(customerId).success) notFound();
  const { db, member } = await requireModule(companyId, "clientes");
  const { data, error } = await db
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error("Customer unavailable");
  if (!data) notFound();
  const { data: origin, error: originError } = await db
    .from("historical_customer_migrations")
    .select("historical_id")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (originError)
    throw new Error("No se pudo comprobar el origen del cliente.");
  const initial: CustomerInput = {
    full_name: data.full_name,
    email: data.email ?? "",
    phone: data.phone ?? "",
    address: data.address ?? "",
    city: data.city ?? "",
    postal_code: data.postal_code ?? "",
    service: data.service ?? "",
    client_date: data.client_date,
    notes: data.notes ?? "",
    status: data.status,
  };
  return (
    <>
      <p className="eyebrow">Ficha de cliente</p>
      <h1 className="page-title mt-3 break-words">{data.full_name}</h1>
      <p className="mt-3 mb-7 text-sm text-muted-foreground">
        Información de contacto y seguimiento.
      </p>
      {origin && (
        <p className="card mb-5 text-sm">
          Cliente incorporado desde ADT. Las ediciones de esta ficha no
          modifican el original.{" "}
          <Link
            className="text-primary underline"
            href={`/app/${companyId}/historico/clients/${origin.historical_id}`}
          >
            Consultar histórico y relaciones
          </Link>
        </p>
      )}
      <CustomerForm
        key={`${data.id}-${data.version}`}
        companyId={companyId}
        id={data.id}
        version={data.version}
        initial={initial}
        readOnly={!canAccess(member, "clientes", "write")}
        saved={(await searchParams).saved === "1"}
      />
    </>
  );
}
