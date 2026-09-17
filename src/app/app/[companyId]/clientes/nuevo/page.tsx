import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { CustomerForm } from "@/components/customer-form";
export default async function NewCustomer({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { company } = await requireModule(companyId, "clientes", "write");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: company.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const date = ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)?.value)
    .join("-");
  return (
    <>
      <p className="eyebrow">Clientes</p>
      <h1 className="page-title mt-3 mb-7">Una nueva relación</h1>
      <CustomerForm
        companyId={companyId}
        id={randomUUID()}
        version={0}
        initial={{
          full_name: "",
          email: "",
          phone: "",
          address: "",
          city: "",
          postal_code: "",
          service: "",
          client_date: date,
          notes: "",
          status: "active",
        }}
      />
    </>
  );
}
