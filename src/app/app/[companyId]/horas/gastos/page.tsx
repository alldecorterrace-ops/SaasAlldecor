import Link from "next/link";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { workforceScopeSchema } from "@/lib/workforce";
import {
  workforceExpenseCategories,
  workforceExpenseStatuses,
} from "@/lib/workforce-expenses";
import {
  WorkforceExpenseForm,
  WorkforceDecisionForm,
  WorkforceGeneralForm,
} from "@/components/workforce-expenses";
import { ListPagination } from "@/components/list-pagination";
export default async function WorkforceExpenses({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{
    page?: string;
    status?: string;
    allocation?: string;
    saved?: string;
  }>;
}) {
  const { companyId } = await params,
    { db, member, company } = await requireModule(companyId, "horasfix"),
    search = await searchParams;
  const scopeResult = await db.rpc("workforce_scope", { p_company: companyId });
  if (scopeResult.error) throw new Error("No se pudo consultar tu equipo.");
  const scope = workforceScopeSchema.parse(scopeResult.data),
    write = canAccess(member, "horasfix", "write");
  const page = Math.max(1, Math.min(100000, parseInt(search.page ?? "1") || 1)),
    status = Object.hasOwn(workforceExpenseStatuses, search.status ?? "")
      ? search.status!
      : "",
    allocation = ["PROJECT", "GENERAL"].includes(search.allocation ?? "")
      ? search.allocation!
      : "";
  let query = db
    .from("workforce_expenses")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .order("expense_at", { ascending: false })
    .order("id");
  if (status) query = query.eq("status", status);
  if (allocation) query = query.eq("allocation", allocation);
  const { data, error, count } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudieron cargar los gastos del equipo.");
  const context = await db.rpc("workforce_expense_names", {
    p_company: companyId,
    p_ids: (data ?? []).map((e) => e.id),
  });
  if (context.error)
    throw new Error("No se pudieron cargar los nombres del gasto.");
  const names = z
    .array(
      z.object({
        id: z.uuid(),
        worker_name: z.string(),
        project_name: z.string(),
      }),
    )
    .parse(context.data);
  const format = new Intl.DateTimeFormat("es", {
    timeZone: company.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const money = new Intl.NumberFormat("es-US", {
    style: "currency",
    currency: "USD",
  });
  const base = `/app/${companyId}/horas/gastos`,
    newId = randomUUID();
  return (
    <>
      <p className="eyebrow">Equipo</p>
      <h1 className="page-title mt-2">Gastos de Workforce</h1>
      <nav className="flex flex-wrap gap-5 my-5">
        <Link className="underline" href={`/app/${companyId}/horas`}>
          Horas
        </Link>
        <Link className="underline" href={`/app/${companyId}/horas/equipo`}>
          Equipo y obras
        </Link>
      </nav>
      <p className="mb-5">
        Las decisiones se conservan por separado: encargado y oficina. Aprobar
        no confirma un reembolso ni registra un pago.
      </p>
      {search.saved && (
        <p role="status" className="card mb-5">
          Gasto enviado. Puedes reabrir su recibo y consultar el estado.
        </p>
      )}
      {write && scope.actor_id && (
        <WorkforceExpenseForm
          key={newId}
          company={companyId}
          id={newId}
          request={randomUUID()}
          projects={scope.projects}
          now={new Date().toISOString()}
        />
      )}
      {!scope.role && (
        <p className="card">
          Solicita vincular tu cuenta a una ficha activa con perfil de equipo.
        </p>
      )}
      <form className="card flex flex-wrap gap-4 items-end my-5">
        <label className="field">
          Estado
          <select name="status" defaultValue={status}>
            <option value="">Todos</option>
            {Object.entries(workforceExpenseStatuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Destino del costo
          <select name="allocation" defaultValue={allocation}>
            <option value="">Todos</option>
            <option value="PROJECT">Obra</option>
            <option value="GENERAL">Gasto general</option>
          </select>
        </label>
        <button className="underline">Filtrar</button>
      </form>
      <div className="grid gap-5">
        {data?.map((e) => {
          const stage =
            write &&
            scope.role === "FOREMAN" &&
            scope.actor_id !== e.worker_id &&
            e.status === "SUBMITTED"
              ? "encargado"
              : write &&
                  ["ADMIN", "OFFICE"].includes(scope.role ?? "") &&
                  e.status === "FOREMAN_APPROVED"
                ? "oficina"
                : null;
          return (
            <article className="card break-words" key={e.id}>
              <h2 className="text-lg font-semibold">
                {names.find((n) => n.id === e.id)?.worker_name ??
                  "Trabajador del equipo"}{" "}
                · {money.format(e.amount)}
              </h2>
              <p>
                {
                  workforceExpenseStatuses[
                    e.status as keyof typeof workforceExpenseStatuses
                  ]
                }
              </p>
              <p className="text-sm my-2">
                {format.format(new Date(e.expense_at))} ·{" "}
                {
                  workforceExpenseCategories[
                    e.category as keyof typeof workforceExpenseCategories
                  ]
                }{" "}
                ·{" "}
                {names.find((n) => n.id === e.id)?.project_name ??
                  "Obra del gasto"}
              </p>
              <p className="font-medium">
                Destino del costo:{" "}
                {e.allocation === "GENERAL" ? "Gasto general" : "Obra"}
              </p>
              {e.allocation === "GENERAL" && (
                <p className="text-sm">
                  La obra indicada es la original del envío. Reclasificado el{" "}
                  {format.format(new Date(e.general_at))} · {e.general_reason}
                </p>
              )}
              <p className="whitespace-pre-wrap">{e.description}</p>
              <a
                className="underline inline-block my-3"
                href={`/api/workforce/${companyId}/expenses/${e.id}/receipt`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir recibo privado
              </a>
              <Link
                className="underline block mb-3"
                href={`/app/${companyId}/historial/workforce_expenses/${e.id}`}
              >
                Historial del gasto
              </Link>
              {e.foreman_at && (
                <p className="text-sm">
                  Decisión de encargado: {format.format(new Date(e.foreman_at))}
                  {e.foreman_reason ? ` · ${e.foreman_reason}` : ""}
                </p>
              )}
              {e.office_at && (
                <p className="text-sm">
                  Decisión de oficina: {format.format(new Date(e.office_at))}
                  {e.office_reason ? ` · ${e.office_reason}` : ""}
                </p>
              )}
              {write &&
                ["ADMIN", "OFFICE"].includes(scope.role ?? "") &&
                ["FOREMAN_APPROVED", "OFFICE_APPROVED"].includes(e.status) &&
                e.allocation === "PROJECT" && (
                  <WorkforceGeneralForm
                    key={`general:${e.id}:${e.version}`}
                    company={companyId}
                    id={e.id}
                    version={e.version}
                    request={randomUUID()}
                  />
                )}
              {stage && (
                <WorkforceDecisionForm
                  key={`${e.id}:${e.version}`}
                  company={companyId}
                  id={e.id}
                  version={e.version}
                  request={randomUUID()}
                  stage={stage}
                />
              )}
            </article>
          );
        })}
        {!data?.length && (
          <p className="card">No hay gastos disponibles en esta vista.</p>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ status, allocation }}
      />
    </>
  );
}
