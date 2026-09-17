import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { projectStatuses, usd, paymentStatuses } from "@/lib/finance";
import { FinanceForm } from "@/components/finance-form";
import { Input } from "@/components/ui/input";
export default async function Project({
  params,
}: {
  params: Promise<{ companyId: string; projectId: string }>;
}) {
  const { companyId, projectId } = await params;
  if (!uuid.safeParse(projectId).success) notFound();
  const { db, member } = await requireModule(companyId, "fin-proyectos");
  const { data: p, error } = await db
    .from("projects")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el proyecto.");
  if (!p) notFound();
  const financial = canAccess(member, "fin-invoices");
  const { data: invoice, error: invoiceError } = financial
    ? await db
        .from("invoices")
        .select("id,number,total,balance_due,payment_status")
        .eq("company_id", companyId)
        .eq("project_id", projectId)
        .maybeSingle()
    : { data: null, error: null };
  if (invoiceError)
    throw new Error("No se pudo cargar la factura del proyecto.");
  const write = canAccess(member, "fin-proyectos", "write");
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Operaciones / Proyectos</p>
        <h1 className="page-title mt-2">{p.name}</h1>
        <p className="text-sm mt-2">
          {projectStatuses[p.status as keyof typeof projectStatuses]} · Revisión{" "}
          {p.version}
        </p>
      </div>
      <div className="mb-6 flex flex-wrap gap-5">
        <Link className="underline" href={`/app/${companyId}/proyectos`}>
          Todos los proyectos
        </Link>
        <Link
          className="underline print:hidden"
          href={`/app/${companyId}/historial/projects/${projectId}`}
        >
          Historial de cambios
        </Link>
        {canAccess(member, "fin-estimados") && (
          <Link
            className="underline"
            href={`/app/${companyId}/estimados/${p.estimate_id}`}
          >
            Estimado
          </Link>
        )}
        {canAccess(member, "clientes") && (
          <Link
            className="underline"
            href={`/app/${companyId}/clientes/${p.customer_id}`}
          >
            Cliente
          </Link>
        )}
      </div>
      {invoice && (
        <div className="card mb-6">
          <Link
            className="font-semibold text-primary"
            href={`/app/${companyId}/facturas/${invoice.id}`}
          >
            {invoice.number}
          </Link>
          <p className="mt-3">
            Total {usd(invoice.total)} · Saldo {usd(invoice.balance_due)} ·{" "}
            {
              paymentStatuses[
                invoice.payment_status as keyof typeof paymentStatuses
              ]
            }
          </p>
        </div>
      )}
      <section className="card">
        <FinanceForm
          key={p.version}
          companyId={companyId}
          id={projectId}
          version={p.version}
          operation="project"
          label="Guardar proyecto"
          readOnly={!write}
        >
          <fieldset disabled={!write} className="space-y-4">
            <label className="field">
              Nombre
              <Input
                name="name"
                defaultValue={p.name}
                minLength={2}
                maxLength={255}
                required
              />
            </label>
            <label className="field">
              Estado
              <select name="status" defaultValue={p.status}>
                {Object.entries(projectStatuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                Inicio
                <Input
                  name="start_date"
                  type="date"
                  defaultValue={p.start_date ?? ""}
                />
              </label>
              <label className="field">
                Fin previsto
                <Input
                  name="end_date"
                  type="date"
                  defaultValue={p.end_date ?? ""}
                />
              </label>
            </div>
            <label className="field">
              Notas
              <textarea
                name="notes"
                rows={6}
                defaultValue={p.notes}
                maxLength={10000}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Para programar un inicio o avanzar a producción se requiere un
              pago registrado en la factura.
            </p>
          </fieldset>
        </FinanceForm>
        {!write && (
          <p className="text-sm mt-3">
            Acceso de consulta. No tienes permiso para guardar cambios.
          </p>
        )}
      </section>
    </>
  );
}
