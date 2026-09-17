import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { todayInTimezone } from "@/lib/commercial";
import { estimateRecord } from "@/lib/estimate-record";
import type { EstimateInput } from "@/lib/estimates";
import { EstimateForm } from "@/components/estimate-form";
import { Button } from "@/components/ui/button";
export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; estimateId: string }>;
  searchParams: Promise<{ saved?: string; revision?: string }>;
}) {
  const { companyId, estimateId } = await params,
    search = await searchParams,
    isNew = estimateId === "nuevo";
  const context = await requireModule(
    companyId,
    "fin-estimados",
    isNew ? "write" : "read",
  );
  let id = randomUUID() as string,
    version = 0,
    latest = 0,
    number = "Nuevo estimado",
    customerName = "";
  let initial: EstimateInput = {
    customer_id: "",
    estimate_date: todayInTimezone(context.company.timezone),
    valid_until: null,
    status: "BORRADOR",
    notes: "",
    items: [],
    discount: "0.00",
    taxes: "0.00",
  };
  if (!isNew) {
    const { record, latestVersion } = await estimateRecord(
      companyId,
      estimateId,
      search.revision,
    );
    id = record.id;
    version = record.version;
    latest = latestVersion;
    number = record.number;
    customerName = record.customer_snapshot.full_name;
    initial = {
      ...record,
      discount: String(record.discount),
      taxes: String(record.taxes),
    };
  }
  const readOnly =
    !canAccess(context.member, "fin-estimados", "write") ||
    !!search.revision ||
    initial.status === "ANULADA";
  return (
    <>
      <div className="flex flex-wrap justify-between gap-4 mb-7">
        <div>
          <p className="eyebrow">Comercial / Estimados</p>
          <h1 className="page-title mt-2">{number}</h1>
          {version > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Revisión {version}
              {search.revision ? " · Consulta histórica" : ""}
            </p>
          )}
        </div>
        {!isNew && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link
                href={`/app/${companyId}/estimados/${id}/imprimir${search.revision ? `?revision=${version}` : ""}`}
              >
                Imprimir / guardar PDF
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/app/${companyId}/estimados/${id}/historial`}>
                Ver revisiones
              </Link>
            </Button>
            {search.revision && (
              <Button variant="outline" asChild>
                <Link href={`/app/${companyId}/estimados/${id}`}>
                  Revisión actual ({latest})
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
      {isNew && !canAccess(context.member, "clientes") ? (
        <div className="card">
          Necesitas permiso de lectura en Clientes para crear estimados.
        </div>
      ) : (
        <EstimateForm
          key={`${id}:${version}:${!!search.revision}`}
          companyId={companyId}
          id={id}
          version={version}
          initial={initial}
          customerName={customerName}
          readOnly={readOnly}
          saved={search.saved === "1"}
          canSelectCustomer={canAccess(context.member, "clientes")}
          canSelectProduct={canAccess(context.member, "productos")}
        />
      )}
    </>
  );
}
