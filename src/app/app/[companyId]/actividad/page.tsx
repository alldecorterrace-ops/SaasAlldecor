import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { Button } from "@/components/ui/button";
export default async function Activity({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { companyId } = await params,
    { db, company } = await requireModule(companyId, "activity"),
    { before } = await searchParams;
  const { data, error } = await db.rpc("activity_feed", {
    p_company: companyId,
    p_before: before && /^\d{1,18}$/.test(before) ? before : null,
  });
  if (error) throw new Error("No se pudo cargar la actividad.");
  const labels: Record<string, string> = {
    web_forms: "Formularios web",
    web_requests: "Solicitudes web",
    designs: "Diseños",
    price_books: "Precios",
    client_shares: "Enlaces del cliente",
    assistant_settings: "Configuración de IA",
    time_entries: "Horas",
    time_requests: "Solicitudes de horas",
    time_periods: "Cierre de semanas",
    work_records: "Operaciones",
    work_attachments: "Documentos de operaciones",
    inventory_movements: "Movimientos de inventario",
    customers: "Clientes",
    leads: "Leads",
    products: "Productos",
    estimates: "Estimados",
    invoices: "Facturas",
    workers: "Trabajadores",
    expenses: "Gastos",
    payments: "Pagos",
    projects: "Proyectos",
    companies: "Empresa",
    memberships: "Usuarios y permisos",
  };
  const dates = new Intl.DateTimeFormat("es", {
    timeZone: company.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Administración</p>
        <h1 className="page-title mt-2">Actividad</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cambios registrados en los módulos a los que tienes acceso. Horario de{" "}
          {company.timezone}.
        </p>
      </div>
      <div className="card overflow-x-auto p-0">
        {data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Módulo</th>
                <th>Acción</th>
                <th>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {data.map(
                (r: {
                  id: number;
                  entity: string;
                  entity_id: string;
                  operation: string;
                  created_at: string;
                }) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      {dates.format(new Date(r.created_at))}
                    </td>
                    <td>{labels[r.entity] ?? r.entity}</td>
                    <td>
                      {r.operation === "INSERT" ? "Creado" : "Actualizado"}
                    </td>
                    <td className="font-mono text-xs">{r.entity_id}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <p className="p-10 text-center text-muted-foreground">
            No hay eventos en esta vista.
          </p>
        )}
      </div>
      <div className="mt-5 flex gap-3">
        {before && (
          <Button variant="outline" asChild>
            <Link href={`/app/${companyId}/actividad`}>Más recientes</Link>
          </Button>
        )}
        {data?.length === 50 && (
          <Button variant="outline" asChild>
            <Link href={`/app/${companyId}/actividad?before=${data.at(-1).id}`}>
              Eventos anteriores
            </Link>
          </Button>
        )}
      </div>
    </>
  );
}
