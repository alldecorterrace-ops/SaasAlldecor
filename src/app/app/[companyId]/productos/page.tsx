import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { priceBases } from "@/lib/commercial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/list-pagination";
export default async function Products({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    active?: string;
    page?: string;
  }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "productos"),
    s = await searchParams;
  const q = (s.q ?? "").trim().slice(0, 100),
    category = (s.category ?? "").trim().slice(0, 128),
    active = s.active !== "false",
    page = Math.min(100000, Math.max(1, Number.parseInt(s.page ?? "1") || 1));
  let query = db
    .from("products")
    .select("id,name,category,base,unit_price,active", { count: "exact" })
    .eq("company_id", companyId)
    .eq("active", active)
    .order("name")
    .order("id");
  if (q) query = query.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (category)
    query = query.ilike("category", `%${category.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error, count } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudieron cargar los productos.");
  const base = `/app/${companyId}/productos`,
    money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <p className="eyebrow">Comercial</p>
          <h1 className="page-title mt-2">Productos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Catálogo, medidas y opciones de precio de tu empresa.
          </p>
        </div>
        {canAccess(member, "productos", "write") && (
          <Button asChild>
            <Link href={`${base}/nuevo`}>Nuevo producto</Link>
          </Button>
        )}
      </div>
      <form className="card grid gap-4 mb-5 md:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="field">
          Buscar por nombre
          <Input
            name="q"
            defaultValue={q}
            placeholder="Nombre del producto"
            maxLength={100}
          />
        </label>
        <label className="field">
          Categoría
          <Input
            name="category"
            defaultValue={category}
            maxLength={128}
            placeholder="Todas"
          />
        </label>
        <label className="field">
          Disponibilidad
          <select name="active" defaultValue={String(active)}>
            <option value="true">Activos</option>
            <option value="false">Archivados</option>
          </select>
        </label>
        <Button className="self-end">Filtrar</Button>
      </form>
      <div className="card overflow-x-auto p-0">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Base de precio</th>
                <th>Precio base</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                      href={`${base}/${r.id}`}
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td>{r.category}</td>
                  <td>{priceBases[r.base as keyof typeof priceBases]}</td>
                  <td className="whitespace-nowrap">
                    {r.base === "manual"
                      ? "Se define al cotizar"
                      : money.format(Number(r.unit_price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <h2 className="font-semibold">No hay productos en esta vista</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Agrega el primer producto o ajusta los filtros.
            </p>
          </div>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ q, category, active: String(active) }}
      />
    </>
  );
}
