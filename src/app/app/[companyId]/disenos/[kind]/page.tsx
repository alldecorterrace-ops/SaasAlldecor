import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { designModule } from "@/lib/designs";
export default async function Designs({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; kind: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { companyId, kind } = await params;
  if (!designModule(kind)) notFound();
  const { db, member } = await requireModule(companyId, kind),
    sp = await searchParams,
    page = Math.max(1, Math.min(100000, Number(sp.page) || 1)),
    q = (sp.q ?? "").slice(0, 100);
  const { data, error, count } = await db
    .from("designs")
    .select("id,name,total,version,archived,updated_at", { count: "exact" })
    .eq("company_id", companyId)
    .eq("kind", kind)
    .ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`)
    .order("updated_at", { ascending: false })
    .order("id")
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("No se pudieron cargar los diseños.");
  const base = `/app/${companyId}/disenos/${kind}`;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {kind === "nuevo3d" ? "Nuevo estimado 3D" : "Pérgola sin 3D"}
      </h1>
      {canAccess(member, kind, "write") && (
        <Link className="underline" href={`${base}/nuevo`}>
          Crear diseño
        </Link>
      )}
      <form className="flex gap-3">
        <input name="q" defaultValue={q} placeholder="Buscar diseño" />
        <button>Buscar</button>
      </form>
      <div className="card divide-y">
        {data.map((d) => (
          <Link key={d.id} className="block py-4" href={`${base}/${d.id}`}>
            {d.name} · ${Number(d.total).toFixed(2)} · revisión {d.version}
            {d.archived ? " · Archivado" : ""}
          </Link>
        ))}
        {!data.length && <p>Aún no hay diseños.</p>}
      </div>
      <div className="flex gap-4">
        {page > 1 && (
          <Link href={`${base}?page=${page - 1}&q=${encodeURIComponent(q)}`}>
            Anterior
          </Link>
        )}
        {page * 20 < (count ?? 0) && (
          <Link href={`${base}?page=${page + 1}&q=${encodeURIComponent(q)}`}>
            Siguiente
          </Link>
        )}
      </div>
    </div>
  );
}
