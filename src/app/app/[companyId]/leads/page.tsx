import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { leadStatuses, leadLabels } from "@/lib/commercial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/list-pagination";
export default async function Leads({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    archived?: string;
    page?: string;
  }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "crm"),
    s = await searchParams;
  const q = (s.q ?? "").trim().slice(0, 100),
    status = leadStatuses.find((x) => x === s.status) ?? "",
    archived = s.archived === "true",
    page = Math.min(100000, Math.max(1, Number.parseInt(s.page ?? "1") || 1));
  let query = db
    .from("leads")
    .select("id,full_name,email,phone,service,lead_date,status,customer_id", {
      count: "exact",
    })
    .eq("company_id", companyId)
    .eq("archived", archived)
    .order("lead_date", { ascending: false })
    .order("id");
  if (q) query = query.ilike("full_name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query.range(
    (page - 1) * 20,
    page * 20 - 1,
  );
  if (error) throw new Error("No se pudieron cargar los leads.");
  const base = `/app/${companyId}/leads`;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <p className="eyebrow">Comercial</p>
          <h1 className="page-title mt-2">Leads</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Desde el primer contacto hasta convertirse en cliente.
          </p>
        </div>
        {canAccess(member, "crm", "write") && (
          <Button asChild>
            <Link href={`${base}/nuevo`}>Nuevo lead</Link>
          </Button>
        )}
      </div>
      <form className="card grid gap-4 mb-5 md:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="field">
          Buscar por nombre
          <Input
            name="q"
            defaultValue={q}
            placeholder="Nombre del lead"
            maxLength={100}
          />
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={status}>
            <option value="">Todos</option>
            {leadStatuses.map((s) => (
              <option key={s} value={s}>
                {leadLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Disponibilidad
          <select name="archived" defaultValue={String(archived)}>
            <option value="false">Activos</option>
            <option value="true">Archivados</option>
          </select>
        </label>
        <Button className="self-end">Filtrar</Button>
      </form>
      <div className="card overflow-x-auto p-0">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Contacto</th>
                <th>Servicio</th>
                <th>Ingreso</th>
                <th>Estado</th>
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
                      {r.full_name}
                    </Link>
                  </td>
                  <td>
                    <div>{r.email || "—"}</div>
                    <div className="text-muted-foreground">{r.phone}</div>
                  </td>
                  <td>{r.service || "—"}</td>
                  <td className="whitespace-nowrap">{r.lead_date}</td>
                  <td>
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold whitespace-nowrap">
                      {leadLabels[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <h2 className="font-semibold">No hay leads en esta vista</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Crea un lead o ajusta los filtros para comenzar.
            </p>
          </div>
        )}
      </div>
      <ListPagination
        path={base}
        page={page}
        count={count ?? 0}
        query={{ q, status, archived: String(archived) }}
      />
    </>
  );
}
