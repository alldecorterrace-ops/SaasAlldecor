import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { completeQuery } from "@/lib/complete-query";
import { reconcileHistoricalFinance } from "@/lib/financial-reconciliation";
import { FinancialReconciliationTable } from "@/components/financial-reconciliation-table";
import { ListPagination } from "@/components/list-pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { historicalMoney } from "@/lib/historical-estimates";
export default async function Reconciliation({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; view?: string; page?: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "fin-invoices");
  if (member.role !== "owner" && member.role !== "admin") notFound();
  const s = await searchParams,
    q = (s.q ?? "").trim().slice(0, 100),
    view = [
      "amounts",
      "data",
      "dependencies",
      "clear",
      "void-retained",
    ].includes(s.view ?? "")
      ? s.view!
      : "",
    page = Math.min(100000, Math.max(1, parseInt(s.page ?? "1") || 1));
  const [history, estimates, customers, projectMappings, projects] =
    await Promise.all([
      completeQuery((from, to) =>
        db
          .from("historical_business")
          .select(
            "id,company_id,kind,client_id,project_id,invoice_id,estimate_id,presentation",
            { count: "exact" },
          )
          .eq("company_id", companyId)
          .in("kind", ["projects", "invoices", "payments"])
          .order("kind")
          .order("id")
          .range(from, to),
      ),
      completeQuery((from, to) =>
        db
          .from("historical_estimates")
          .select("id,company_id,presentation", { count: "exact" })
          .eq("company_id", companyId)
          .order("id")
          .range(from, to),
      ),
      completeQuery((from, to) =>
        db
          .from("historical_customer_migrations")
          .select("company_id,historical_id,customer_id,state", {
            count: "exact",
          })
          .eq("company_id", companyId)
          .order("historical_id")
          .range(from, to),
      ),
      completeQuery((from, to) =>
        db
          .from("historical_project_migrations")
          .select("company_id,historical_id,project_id,state", {
            count: "exact",
          })
          .eq("company_id", companyId)
          .order("historical_id")
          .range(from, to),
      ),
      completeQuery((from, to) =>
        db
          .from("projects")
          .select("id,company_id,customer_id", { count: "exact" })
          .eq("company_id", companyId)
          .order("id")
          .range(from, to),
      ),
    ]);
  const result = reconcileHistoricalFinance({
    companyId,
    history,
    estimates,
    customers,
    projectMappings,
    projects,
  });
  const filtered = result.rows.filter(
    (r) =>
      (!q ||
        `${r.title} ${r.customerName}`
          .toLocaleLowerCase()
          .includes(q.toLocaleLowerCase())) &&
      (!view ||
        (view === "void-retained"
          ? r.retainedVoidAmounts
          : view === "clear"
            ? !r.arithmeticIssues.length
            : view === "amounts"
              ? r.arithmeticIssues.length
              : view === "data"
                ? r.dataIssues.length
                : r.dependencyIssues.length)),
  );
  return (
    <>
      <p className="eyebrow">Finanzas · Migración ADT</p>
      <h1 className="page-title mt-2">Conciliación de facturas y pagos</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Comparación de la copia respaldada. Los importes se conservan sin
        ajustes automáticos. Esta revisión no acredita una conciliación bancaria
        ni incorpora facturas o cobros a la operación actual.
      </p>
      <nav className="flex flex-wrap gap-4 my-5">
        <Link
          className="text-primary underline"
          href={`/app/${companyId}/facturas`}
        >
          Facturas actuales
        </Link>
        <Link
          className="text-primary underline"
          href={`/app/${companyId}/historico/invoices`}
        >
          Facturas históricas
        </Link>
        <Link
          className="text-primary underline"
          href={`/app/${companyId}/historico/payments`}
        >
          Pagos históricos
        </Link>
      </nav>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          ["Facturas históricas", result.summary.invoices],
          ["Sin diferencias numéricas", result.summary.arithmeticClear],
          ["Con importes por revisar", result.summary.arithmeticReview],
          ["Pagos históricos", result.summary.payments],
        ].map(([label, count]) => (
          <div className="card" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-2">{count}</p>
          </div>
        ))}
      </div>
      <section className="card mb-5 text-sm">
        <p>
          Se suman los pagos con estado APPLIED. Se excluyen los anulados y los
          asociados a facturas anuladas. Una factura VOID tiene saldo esperado
          cero; cualquier pago aplicado que conserve se señala.
        </p>
        <p className="mt-2">
          Las diferencias se muestran como valor calculado menos valor guardado.
          “Sin diferencias numéricas” solo confirma esa comparación: todavía se
          deben comprobar documentos, detalle de factura, dependencias y cambios
          posteriores al respaldo.
        </p>
        <p className="mt-2">
          {result.summary.dataReview} facturas con datos por revisar ·{" "}
          {result.summary.dependencyReview} con dependencias pendientes. Una
          factura puede aparecer en varios grupos.
        </p>
        {!!result.summary.retainedVoidAmounts && (
          <p className="mt-2">
            {result.summary.retainedVoidAmounts} facturas anuladas conservan
            importes que coinciden con sus pagos asociados a la anulación.
            Puedes revisar ese grupo en la vista «Importes conservados al
            anular». Siguen incluidas entre los importes por revisar; esta
            coincidencia no confirma devoluciones.
          </p>
        )}
      </section>
      <form className="card flex flex-wrap items-end gap-4 mb-5">
        <label className="field grow">
          Factura o cliente
          <Input name="q" defaultValue={q} />
        </label>
        <label className="field">
          Vista
          <select name="view" defaultValue={view}>
            <option value="">Todas</option>
            <option value="amounts">Revisar importes</option>
            <option value="void-retained">
              Importes conservados al anular
            </option>
            <option value="data">Revisar datos</option>
            <option value="dependencies">Dependencias pendientes</option>
            <option value="clear">Sin diferencias numéricas</option>
          </select>
        </label>
        <Button>Filtrar</Button>
      </form>
      <FinancialReconciliationTable
        companyId={companyId}
        rows={filtered.slice((page - 1) * 20, page * 20)}
      />
      <ListPagination
        path={`/app/${companyId}/facturas/conciliacion`}
        page={page}
        count={filtered.length}
        query={{ q, view }}
      />
      {!!result.orphans.length && (
        <section className="card mt-6">
          <h2 className="font-semibold">
            Pagos sin factura histórica vinculada: {result.orphans.length}
          </h2>
          <p className="text-sm mt-2">
            Estos pagos no están incluidos en las comparaciones anteriores.
          </p>
          <ul className="mt-3 space-y-2">
            {result.orphans.slice(0, 20).map((p) => (
              <li key={p.id}>
                <Link
                  className="text-primary underline"
                  href={`/app/${companyId}/historico/payments/${p.id}`}
                >
                  {p.title || "Ver pago"}
                </Link>{" "}
                · {p.status} · {historicalMoney(p.amount)}
              </li>
            ))}
          </ul>
          {result.orphans.length > 20 && (
            <Link
              className="underline"
              href={`/app/${companyId}/historico/payments`}
            >
              Consultar todos los pagos históricos
            </Link>
          )}
        </section>
      )}
    </>
  );
}
