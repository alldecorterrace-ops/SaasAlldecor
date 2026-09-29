import Link from "next/link";
import { ListPagination } from "./list-pagination";
import { estimateStatuses } from "@/lib/estimates";
import { paymentStatuses, projectStatuses, usd } from "@/lib/finance";
import type { loadCustomerRecords } from "@/lib/customer-records";

export function CustomerRecords({
  companyId,
  customerId,
  records,
}: {
  companyId: string;
  customerId: string;
  records: Awaited<ReturnType<typeof loadCustomerRecords>>;
}) {
  const { sections, section, rows, count, page } = records;
  if (!section) return null;
  const path = `/app/${companyId}/clientes/${customerId}`;
  const financial = section.id !== "proyectos";
  const states: Record<string, string> =
    section.id === "estimados"
      ? estimateStatuses
      : section.id === "facturas"
        ? paymentStatuses
        : projectStatuses;
  return (
    <section
      className="mt-8 space-y-4"
      aria-labelledby="customer-records-title"
      id="expediente"
    >
      <h2 className="text-xl font-semibold" id="customer-records-title">
        Expediente del cliente
      </h2>
      <p className="text-sm text-muted-foreground">
        Registros vinculados a esta ficha. Guarda cualquier cambio del cliente
        antes de cambiar de sección.
      </p>
      <nav
        aria-label="Secciones del expediente"
        className="flex flex-wrap gap-2"
      >
        {sections.map((s) => (
          <Link
            key={s.id}
            href={`${path}?section=${s.id}#expediente`}
            aria-current={s.id === section.id ? "page" : undefined}
            className={`rounded-lg border px-4 py-2 text-sm ${s.id === section.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <h3 className="font-semibold">{section.label}</h3>
      {rows.length ? (
        <div className="card overflow-x-auto p-0">
          <table aria-label={`${section.label} del cliente`}>
            <thead>
              <tr>
                <th>{section.id === "proyectos" ? "Proyecto" : "Número"}</th>
                <th>Fecha</th>
                <th>Estado</th>
                {financial ? (
                  <th>Total</th>
                ) : (
                  <>
                    <th>Inicio</th>
                    <th>Fin previsto</th>
                  </>
                )}
                {section.id === "facturas" && <th>Saldo</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="font-semibold text-primary hover:underline"
                      href={`/app/${companyId}/${section.id}/${r.id}`}
                    >
                      {r.number ?? r.name}
                    </Link>
                  </td>
                  <td>{r.estimate_date ?? r.invoice_date ?? r.project_date}</td>
                  <td>
                    {states[r.payment_status ?? r.status ?? ""] ??
                      r.payment_status ??
                      r.status}
                  </td>
                  {financial ? (
                    <td>{usd(r.total ?? 0)}</td>
                  ) : (
                    <>
                      <td>{r.start_date ?? "Por definir"}</td>
                      <td>{r.end_date ?? "Por definir"}</td>
                    </>
                  )}
                  {section.id === "facturas" && (
                    <td>{usd(r.balance_due ?? 0)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="card">
          No hay {section.label.toLowerCase()} vinculados a este cliente.
        </p>
      )}
      <ListPagination
        path={path}
        page={page}
        count={count}
        query={{ section: section.id }}
      />
    </section>
  );
}
