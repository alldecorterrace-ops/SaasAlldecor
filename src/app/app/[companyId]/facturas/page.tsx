import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { paymentStatuses, usd } from "@/lib/finance";
import { ListPagination } from "@/components/list-pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default async function Invoices({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "fin-invoices"),
    s = await searchParams;
  const q = (s.q ?? "").trim().slice(0, 100),
    status = Object.hasOwn(paymentStatuses, s.status ?? "") ? s.status! : "",
    page = Math.max(1, Math.min(100000, parseInt(s.page ?? "1") || 1));
  let query = db
    .from("invoices")
    .select(
      "id,number,customer_snapshot,invoice_date,due_date,total,paid_amount,balance_due,payment_status",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false })
    .order("id");
  if (q) query = query.ilike("number", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (status) query = query.eq("payment_status", status);
  const { data, count, error } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudieron cargar las facturas.");
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Finanzas</p>
        <h1 className="page-title mt-2">Facturas</h1>
        <div className="flex flex-wrap gap-2 mt-4">
          {(member.role === "owner" || member.role === "admin") && (
            <Button asChild variant="outline">
              <Link href={`/app/${companyId}/facturas/conciliacion`}>
                Conciliación ADT
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/app/${companyId}/historico/invoices`}>
              Facturas históricas
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/${companyId}/historico/payments`}>
              Pagos históricos
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Se generan al registrar la aprobación de un estimado. Los pagos se
          registran por separado.
        </p>
      </div>
      <form className="card mb-5 flex flex-wrap gap-4 items-end">
        <label className="field grow">
          Número
          <Input name="q" defaultValue={q} />
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={status}>
            <option value="">Todos</option>
            {Object.entries(paymentStatuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Button>Filtrar</Button>
      </form>
      <div className="card overflow-x-auto">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Fecha / vencimiento</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Saldo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link
                      className="text-primary font-semibold"
                      href={`/app/${companyId}/facturas/${i.id}`}
                    >
                      {i.number}
                    </Link>
                  </td>
                  <td>{i.customer_snapshot.full_name}</td>
                  <td>
                    {i.invoice_date}
                    <p>{i.due_date ?? "Sin vencimiento"}</p>
                  </td>
                  <td>{usd(i.total)}</td>
                  <td>{usd(i.paid_amount)}</td>
                  <td>{usd(i.balance_due)}</td>
                  <td>
                    {
                      paymentStatuses[
                        i.payment_status as keyof typeof paymentStatuses
                      ]
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No hay facturas en esta vista.</p>
        )}
      </div>
      <ListPagination
        path={`/app/${companyId}/facturas`}
        page={page}
        count={count ?? 0}
        query={{ q, status }}
      />
    </>
  );
}
