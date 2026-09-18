import { ImportedEstimateDetail } from "@/components/imported-estimate-detail";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { todayInTimezone } from "@/lib/commercial";
import { estimateRecord } from "@/lib/estimate-record";
import type { EstimateInput } from "@/lib/estimates";
import { EstimateForm } from "@/components/estimate-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FinanceForm } from "@/components/finance-form";
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
    if (record.historical_estimate_id) {
      let projects: { id: string; name: string }[] = [];
      if (canAccess(context.member, "fin-proyectos")) {
        const histories = await context.db
          .from("historical_business")
          .select("id")
          .eq("company_id", companyId)
          .eq("kind", "projects")
          .eq("estimate_id", record.historical_estimate_id);
        if (histories.error)
          throw new Error("No se pudieron cargar los v�nculos hist�ricos.");
        if (histories.data?.length) {
          const linked = await context.db
            .from("projects")
            .select("id,name")
            .eq("company_id", companyId)
            .in(
              "historical_project_id",
              histories.data.map((p) => p.id),
            );
          if (linked.error)
            throw new Error("No se pudieron cargar los proyectos vinculados.");
          projects = linked.data ?? [];
        }
      }
      return (
        <>
          <div className="mb-5 flex gap-4 print:hidden">
            <Button asChild variant="outline">
              <Link href={`/app/${companyId}/estimados`}>
                Volver a estimados
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/${companyId}/estimados/${record.id}/imprimir`}>
                Imprimir / guardar PDF
              </Link>
            </Button>
          </div>
          <ImportedEstimateDetail
            record={record}
            companyId={companyId}
            customerLink={canAccess(context.member, "clientes")}
            projects={projects}
          />
        </>
      );
    }
    id = record.id;
    version = record.version;
    latest = latestVersion;
    number = record.number;
    customerName = record.customer_snapshot.full_name;
    initial = {
      ...record,
      status: record.status as EstimateInput["status"],
      discount: String(record.discount),
      taxes: String(record.taxes),
    };
  }
  const readOnly =
    !canAccess(context.member, "fin-estimados", "write") ||
    !!search.revision ||
    initial.status === "ANULADA" ||
    initial.status === "APROBADO";
  const canApprove =
    !isNew &&
    !search.revision &&
    ["BORRADOR", "PENDIENTE"].includes(initial.status) &&
    ["fin-estimados", "fin-invoices", "fin-proyectos"].every((m) =>
      canAccess(context.member, m, "write"),
    );
  const { data: invoice } =
    !isNew && canAccess(context.member, "fin-invoices")
      ? await context.db
          .from("invoices")
          .select("id,number")
          .eq("company_id", companyId)
          .eq("estimate_id", id)
          .maybeSingle()
      : { data: null };
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
      {invoice && (
        <p className="card mb-6">
          Factura vinculada:{" "}
          <Link
            className="text-primary underline"
            href={`/app/${companyId}/facturas/${invoice.id}`}
          >
            {invoice.number}
          </Link>
        </p>
      )}
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
      {canApprove && (
        <section className="card mt-6">
          <h2 className="font-semibold mb-3">Registrar aprobación</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Registra la autorización recibida del cliente. Se utilizará la
            última revisión guardada para crear una factura y un proyecto. El
            estimado quedará cerrado para edición. No se registra ningún pago.
          </p>
          <FinanceForm
            companyId={companyId}
            id={id}
            version={version}
            operation="approve"
            label="Registrar aprobación y crear factura"
          >
            <label className="field">
              Nombre del proyecto
              <Input
                name="name"
                defaultValue={customerName}
                minLength={2}
                maxLength={255}
                required
              />
            </label>
            <label className="field">
              Fecha de factura
              <Input
                name="date"
                type="date"
                defaultValue={todayInTimezone(context.company.timezone)}
                required
              />
            </label>
            <label className="field">
              Constancia de aprobación
              <textarea
                name="note"
                rows={3}
                minLength={3}
                maxLength={2000}
                placeholder="Quién aprobó, cuándo y por qué medio"
                required
              />
            </label>
          </FinanceForm>
        </section>
      )}
    </>
  );
}
