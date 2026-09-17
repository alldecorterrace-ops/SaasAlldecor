import Link from "next/link";
import { Plus, Search, Users, ArrowRight } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default async function Customers({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { companyId } = await params,
    {
      q: raw = "",
      status: rawStatus = "active",
      page: rawPage = "1",
    } = await searchParams;
  const q = raw.slice(0, 120).trim(),
    status = rawStatus === "archived" ? "archived" : "active",
    page = Math.max(1, Math.min(100000, Math.floor(Number(rawPage) || 1))),
    size = 20;
  const { db, member } = await requireModule(companyId, "clientes");
  let query = db
    .from("customers")
    .select("id,full_name,email,phone,city,status,client_date", {
      count: "exact",
    })
    .eq("company_id", companyId)
    .eq("status", status)
    .order("full_name")
    .order("id")
    .range((page - 1) * size, page * size - 1);
  if (q)
    query = query.ilike(
      "full_name",
      `%${q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
    );
  const { data, error, count } = await query;
  if (error) throw new Error("Customers unavailable");
  const href = (p: number) =>
    `/app/${companyId}/clientes?${new URLSearchParams({ q, status, page: String(p) })}`;
  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Relaciones que crecen</p>
          <h1 className="page-title mt-3">Clientes</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            El contacto y la información de cada cliente, siempre a mano.
          </p>
        </div>
        {canAccess(member, "clientes", "write") && (
          <Button asChild>
            <Link href={`/app/${companyId}/clientes/nuevo`}>
              <Plus size={16} />
              Nuevo cliente
            </Link>
          </Button>
        )}
      </div>
      <section className="card p-0! overflow-hidden">
        <form
          className="flex flex-wrap items-end gap-3 border-b border-border p-5"
          method="get"
        >
          <label className="field min-w-48 flex-1">
            <span className="text-xs">Buscar por nombre</span>
            <Input
              name="q"
              maxLength={120}
              defaultValue={q}
              placeholder="Nombre del cliente"
            />
          </label>
          <label className="field w-40">
            <span className="text-xs">Estado</span>
            <select name="status" defaultValue={status}>
              <option value="active">Activos</option>
              <option value="archived">Archivados</option>
            </select>
          </label>
          <Button variant="outline">
            <Search size={16} />
            Buscar
          </Button>
        </form>
        {data?.length ? (
          <div className="overflow-x-auto">
            <table>
              <caption className="sr-only">
                Clientes de la empresa seleccionada
              </caption>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th>Ciudad</th>
                  <th>Fecha</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="hover:bg-background">
                    <td>
                      <Link
                        href={`/app/${companyId}/clientes/${c.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {c.full_name}
                      </Link>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {c.status === "active" ? "Activo" : "Archivado"}
                      </p>
                    </td>
                    <td>
                      <p>{c.email || "—"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.phone || "—"}
                      </p>
                    </td>
                    <td>{c.city || "—"}</td>
                    <td className="whitespace-nowrap">{c.client_date}</td>
                    <td>
                      <Link
                        aria-label={`Abrir ${c.full_name}`}
                        href={`/app/${companyId}/clientes/${c.id}`}
                        className="inline-flex rounded-lg p-2 hover:bg-accent"
                      >
                        <ArrowRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
              <Users size={25} />
            </span>
            <h2 className="mt-5 text-lg font-semibold">
              {q
                ? "No encontramos coincidencias"
                : status === "archived"
                  ? "No hay clientes archivados"
                  : "Aquí comienza tu próxima relación"}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {q
                ? "Prueba con otro nombre o revisa el estado seleccionado."
                : "Los clientes que registres en esta empresa aparecerán aquí. Los datos de ADT todavía no se han migrado."}
            </p>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground">
          <p>
            {count ?? 0} clientes · Página {page}
          </p>
          <div className="flex gap-4">
            {page > 1 && (
              <Link
                href={href(page - 1)}
                className="font-semibold text-primary"
              >
                Anterior
              </Link>
            )}
            {page * size < (count ?? 0) && (
              <Link
                href={href(page + 1)}
                className="font-semibold text-primary"
              >
                Siguiente
              </Link>
            )}
          </div>
        </footer>
      </section>
    </>
  );
}
