import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { customerMigrationReason } from "@/lib/customer-migration";
import { ListPagination } from "@/components/list-pagination";
export default async function CustomerMigration({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ page?: string; state?: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "clientes"),
    s = await searchParams;
  if (member.role !== "owner" && member.role !== "admin") notFound();
  const state = s.state === "imported" ? "imported" : "review",
    page = Math.min(100000, Math.max(1, parseInt(s.page ?? "1") || 1)),
    base = `/app/${companyId}`;
  const { data, error, count } = await db
    .from("historical_customer_migrations")
    .select("historical_id,customer_id,state,review_reasons", {
      count: "exact",
    })
    .eq("company_id", companyId)
    .eq("state", state)
    .order("historical_id")
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("No se pudo cargar la revisión de clientes.");
  const ids = (data ?? []).map((r) => r.historical_id);
  const source = ids.length
    ? await db
        .from("historical_business")
        .select("id,title")
        .eq("company_id", companyId)
        .eq("kind", "clients")
        .in("id", ids)
    : { data: [], error: null };
  if (source.error)
    throw new Error("No se pudo cargar el origen de los clientes.");
  const names = new Map((source.data ?? []).map((r) => [r.id, r.title]));
  return (
    <>
      <p className="eyebrow">Migración de clientes ADT</p>
      <h1 className="page-title mt-3">
        {state === "review"
          ? "Clientes pendientes de revisión"
          : "Clientes incorporados"}
      </h1>
      <p className="text-sm text-muted-foreground mt-3 mb-6">
        Los clientes incorporados tienen una ficha editable y conservan su
        registro histórico. Las coincidencias y los datos que requieren revisión
        permanecen separados; no se han combinado automáticamente.
      </p>
      <nav className="flex flex-wrap gap-4 mb-5">
        <Link className="text-primary underline" href={`${base}/clientes`}>
          Clientes actuales
        </Link>
        <Link
          className="text-primary underline"
          href={`${base}/clientes/migracion?state=review`}
        >
          Pendientes
        </Link>
        <Link
          className="text-primary underline"
          href={`${base}/clientes/migracion?state=imported`}
        >
          Incorporados
        </Link>
      </nav>
      <div className="card p-0 overflow-x-auto">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Cliente original</th>
                <th>Resultado</th>
                <th>Ficha actual</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.historical_id}>
                  <td>
                    <Link
                      className="text-primary underline"
                      href={`${base}/historico/clients/${r.historical_id}`}
                    >
                      {names.get(r.historical_id) ?? "Ver cliente histórico"}
                    </Link>
                  </td>
                  <td>
                    {r.state === "review" ? (
                      <ul className="space-y-1">
                        {(r.review_reasons as string[]).map((reason) => (
                          <li key={reason}>
                            {customerMigrationReason(reason)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "Copia incorporada; original conservado"
                    )}
                  </td>
                  <td>
                    {r.customer_id ? (
                      <Link
                        className="text-primary underline"
                        href={`${base}/clientes/${r.customer_id}`}
                      >
                        Abrir ficha editable
                      </Link>
                    ) : (
                      "Pendiente de revisión"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-8">No hay clientes en esta vista.</p>
        )}
      </div>
      <ListPagination
        path={`${base}/clientes/migracion`}
        page={page}
        count={count ?? 0}
        query={{ state }}
      />
    </>
  );
}
