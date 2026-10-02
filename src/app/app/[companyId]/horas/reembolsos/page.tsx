import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { workforceScopeSchema } from "@/lib/workforce";
import { reimbursementBalancesSchema } from "@/lib/workforce-reimbursements";
import { WorkforceReimbursementForm } from "@/components/workforce-reimbursement-form";
export default async function Reimbursements({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ recorded?: string }>;
}) {
  const { companyId } = await params,
    { db, member, company } = await requireModule(companyId, "horasfix"),
    search = await searchParams;
  const [scopeResult, result] = await Promise.all([
    db.rpc("workforce_scope", { p_company: companyId }),
    db.rpc("workforce_reimbursement_balances", { p_company: companyId }),
  ]);
  if (scopeResult.error || result.error)
    throw new Error("No se pudieron consultar los reembolsos.");
  const scope = workforceScopeSchema.parse(scopeResult.data),
    v = reimbursementBalancesSchema.parse(result.data),
    write = scope.role === "ADMIN" && canAccess(member, "horasfix", "write"),
    money = new Intl.NumberFormat("es-US", {
      style: "currency",
      currency: "USD",
    }),
    date = new Intl.DateTimeFormat("es", {
      timeZone: company.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }),
    base = `/app/${companyId}/horas/gastos`;
  return (
    <>
      <p className="eyebrow">Equipo</p>
      <h1 className="page-title mt-2">Reembolsos de trabajadores</h1>
      <Link className="underline block my-4" href={base}>
        Gastos de Workforce
      </Link>
      <p className="mb-5">
        Solo los gastos aprobados de bolsillo propio generan deuda. Las
        constancias registran reembolsos ya realizados; no ejecutan
        transferencias ni duplican el costo.
      </p>
      {search.recorded && (
        <p role="status" className="card mb-5">
          Constancia guardada. Se conserva el importe, las aprobaciones y la
          evidencia del recibo.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3 my-5">
        <div className="card">
          Deuda pendiente{" "}
          <strong className="block">{money.format(Number(v.debt))}</strong>
        </div>
        <div className="card">
          Pagado por la empresa{" "}
          <strong className="block">
            {money.format(Number(v.company_paid))}
          </strong>
        </div>
        <div className="card">
          Pagador sin declarar{" "}
          <strong className="block">
            {money.format(Number(v.unknown_payer))}
          </strong>
        </div>
      </div>
      {Number(v.unknown_payer) > 0 && (
        <p role="status">
          Los importes sin pagador permanecen sin conciliar; no se presume deuda
          ni pago.
        </p>
      )}
      {!v.groups.length && (
        <p className="card">No hay deuda pendiente dentro de tu acceso.</p>
      )}
      <div className="space-y-5">
        {v.groups.map((g) => (
          <section className="card min-w-0 break-words" key={g.worker_id}>
            <h2 className="text-lg font-semibold">
              {g.worker_name} · {money.format(Number(g.total))}
            </h2>
            <p>
              {g.count} gastos · {g.first_date} a {g.last_date}
            </p>
            {g.unreviewed > 0 && (
              <p role="status">
                {g.unreviewed} comprobantes requieren revisión vigente antes de
                registrar todos.
              </p>
            )}
            <ul className="space-y-4 mt-4">
              {g.items.map((e) => (
                <li className="border-t pt-4" key={e.id}>
                  <Link
                    className="underline"
                    href={`${base}?expense=${e.id}#expense-${e.id}`}
                  >
                    {e.date} · {money.format(Number(e.amount))} ·{" "}
                    {e.description || "Gasto"}
                  </Link>
                  <p className="text-sm">
                    {e.reviewed
                      ? "Recibo revisado y vigente"
                      : "Revisión del recibo pendiente"}
                  </p>
                  {write && (
                    <details>
                      <summary className="cursor-pointer underline">
                        Registrar solo este gasto
                      </summary>
                      <WorkforceReimbursementForm
                        company={companyId}
                        worker={g.worker_id}
                        request={randomUUID()}
                        items={[{ id: e.id, version: e.version }]}
                        total={e.amount}
                        all={false}
                        disabled={!e.reviewed}
                      />
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {write && (
              <details className="mt-5">
                <summary className="cursor-pointer underline">
                  Registrar los {g.count} gastos por{" "}
                  {money.format(Number(g.total))}
                </summary>
                {g.count > 100 ? (
                  <p>
                    Este grupo supera 100 gastos. Registra constancias
                    individuales para conservar la selección exacta.
                  </p>
                ) : (
                  <WorkforceReimbursementForm
                    company={companyId}
                    worker={g.worker_id}
                    request={randomUUID()}
                    items={g.items.map(({ id, version }) => ({ id, version }))}
                    total={g.total}
                    all
                    disabled={g.unreviewed > 0}
                  />
                )}
              </details>
            )}
          </section>
        ))}
      </div>
      <h2 className="text-lg font-semibold mt-8 mb-4">
        Constancias registradas ({v.recorded_count})
      </h2>
      <p className="text-sm mb-4">
        Se muestran las últimas 20 dentro de tu acceso. El historial de cada
        gasto conserva las anteriores.
      </p>
      <ul className="space-y-4">
        {v.recorded.map((e) => (
          <li className="card break-words" key={e.id}>
            <Link
              className="underline"
              href={`${base}?expense=${e.id}#expense-${e.id}`}
            >
              {e.worker_name} · {money.format(Number(e.amount))}
            </Link>
            <p>
              {date.format(new Date(e.recorded_at))} · Cuenta {e.actor}
            </p>
            <p>{e.note}</p>
            {e.archived && <p>Gasto archivado; la constancia se conserva.</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
