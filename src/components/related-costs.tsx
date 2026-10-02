import Link from "next/link";
import {
  expenseFiltersSchema,
  expenseSources,
  registerStates,
} from "@/lib/expense-register";
import { usd } from "@/lib/finance";
export function RelatedCosts({
  companyId,
  project,
  customer,
  result,
}: {
  companyId: string;
  project?: string;
  customer?: string;
  result: import("@/lib/expense-register").ExpenseRegisterResult | null;
}) {
  const filters = expenseFiltersSchema.parse({ project, customer });
  if (!result)
    return (
      <p role="alert" className="card">
        No se pudieron consultar todos los costos. Abre Gastos y reduce el
        intervalo; no se muestran totales parciales.
      </p>
    );
  const query = new URLSearchParams(filters).toString();
  return (
    <section className="card space-y-4" aria-label="Costos de proyectos">
      <h2 className="text-xl font-semibold">Costos de proyectos</h2>
      <p>
        Total activo conocido: <strong>{usd(result.active)}</strong>
      </p>
      <p className="text-sm">
        Administración, Workforce aprobado y suplemento de Labor conciliado. El
        costo calculado no acredita nómina, pago ni reembolso. Los costos
        anteriores conservan su procedencia.
      </p>
      {result.labor_complete === false && (
        <aside role="status">
          <strong>Labor pendiente de conciliación</strong>
          <ul className="list-disc pl-5">
            {result.labor_pending?.map((i, n) => (
              <li key={n}>
                {i.date} · {i.worker_name} · {i.project_name} · {i.reason}
              </li>
            ))}
          </ul>
        </aside>
      )}
      <ul className="divide-y">
        {result.rows.map((row) => (
          <li key={row.source + row.id} className="py-3">
            <Link
              className="underline"
              href={
                row.source === "LABOR"
                  ? `/app/${companyId}/horas/labor`
                  : row.source === "WORKFORCE"
                    ? `/app/${companyId}/horas/gastos?expense=${row.id}#expense-${row.id}`
                    : `/app/${companyId}/gastos/${row.id}`
              }
            >
              {row.date} · {row.category} · {usd(row.amount)}
            </Link>
            <p className="text-sm">
              {expenseSources[row.source]} · {registerStates[row.status]} ·{" "}
              {row.worker_name} · {row.project_name}
            </p>
            <p className="text-sm break-words">{row.description}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        {result.count} registros. Se muestran hasta 20; el total incluye todos
        los resultados del filtro.
      </p>
      <div className="flex flex-wrap gap-4">
        <Link className="underline" href={`/app/${companyId}/gastos?${query}`}>
          Consultar y filtrar todos los costos
        </Link>
        {result.count <= 5000 && (
          <a
            className="underline"
            href={`/api/expenses/${companyId}/export?${query}`}
          >
            Exportar CSV de costos
          </a>
        )}
      </div>
    </section>
  );
}
