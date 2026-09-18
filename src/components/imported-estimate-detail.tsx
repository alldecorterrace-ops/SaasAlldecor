import Link from "next/link";
import type { EstimateRecord } from "@/lib/estimate-record";
import { DocumentLines } from "./document-lines";
import { estimateStatuses } from "@/lib/estimates";

const termLabels: Record<string, string> = {
  condiciones: "Condiciones guardadas",
  fecha_entrega: "Entrega indicada",
  deposit_pct: "Porcentaje de depósito indicado",
  deposit: "Depósito indicado (USD)",
  tax_pct: "Porcentaje de impuesto indicado",
  pagos_pct: "Porcentajes de pago indicados",
  pagado: "Importe consignado como pagado (USD; sin verificación bancaria)",
};

export function ImportedEstimateDetail({
  record: r,
  companyId,
  customerLink = false,
  projects = [],
}: {
  record: EstimateRecord;
  companyId: string;
  customerLink?: boolean;
  projects?: { id: string; name: string }[];
}) {
  return (
    <article className="space-y-5">
      <section className="card">
        <p className="eyebrow">Estimado incorporado de ADT</p>
        <h1 className="page-title mt-2">{r.number}</h1>
        <p className="mt-3">
          {estimateStatuses[r.status]} · {r.estimate_date}
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          Copia de consulta con el estado, las partidas y los importes
          originales. Su incorporación no registra una aprobación nueva. La
          copia permanece protegida contra edición y no genera facturas ni
          proyectos.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 print:hidden">
          <Link
            className="text-primary underline"
            href={`/app/${companyId}/estimados/historico/${r.historical_estimate_id}`}
          >
            Ver original histórico
          </Link>
          {customerLink && (
            <Link
              className="text-primary underline"
              href={`/app/${companyId}/clientes/${r.customer_id}`}
            >
              Ficha actual del cliente
            </Link>
          )}
          {projects.map((p) => (
            <Link
              key={p.id}
              className="text-primary underline"
              href={`/app/${companyId}/proyectos/${p.id}`}
            >
              Proyecto: {p.name}
            </Link>
          ))}
        </div>
      </section>
      <section className="card">
        <h2 className="font-semibold">Cliente guardado en el documento</h2>
        <p className="mt-2">{r.customer_snapshot.full_name}</p>
        <p>
          {r.customer_snapshot.email} {r.customer_snapshot.phone}
        </p>
        <p className="whitespace-pre-wrap">{r.customer_snapshot.address}</p>
      </section>
      <DocumentLines
        items={r.items}
        subtotal={r.subtotal}
        discount={r.discount}
        taxes={r.taxes}
        total={r.total}
        historical
      />
      {r.notes && (
        <section className="card">
          <h2 className="font-semibold">Notas originales</h2>
          <p className="mt-2 whitespace-pre-wrap">{r.notes}</p>
        </section>
      )}
      {r.historical_terms && Object.keys(r.historical_terms).length > 0 && (
        <section className="card">
          <h2 className="font-semibold">Condiciones del documento original</h2>
          <dl className="mt-3 space-y-3">
            {Object.entries(termLabels)
              .filter(([key]) => Object.hasOwn(r.historical_terms!, key))
              .map(([key, label]) => (
                <div key={key}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap">
                    {Array.isArray(r.historical_terms![key])
                      ? r.historical_terms![key].join(" / ")
                      : String(r.historical_terms![key])}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        Este estimado no constituye una factura ni acredita un pago.
      </p>
    </article>
  );
}
