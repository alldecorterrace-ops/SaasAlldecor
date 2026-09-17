import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule, companyContext } from "@/lib/auth";
import { workspaceKind, workspaces } from "@/lib/workspaces";
import { uuid } from "@/lib/validation";
const entities: Record<string, { module: string; label: string }> = {
  web_forms: { module: "estimadosweb", label: "Formulario web" },
  web_requests: { module: "estimadosweb", label: "Solicitud web" },
  price_books: { module: "adm-precios", label: "Precios" },
  assistant_settings: { module: "ia", label: "Configuración de IA" },
  time_entries: { module: "horasfix", label: "Marcación" },
  time_requests: { module: "horasfix", label: "Solicitud de horas" },
  time_periods: { module: "horasfix", label: "Cierre de semana" },
  workers: { module: "trabajadores", label: "Trabajador" },
  expenses: { module: "gastos", label: "Gasto" },
  customers: { module: "clientes", label: "Cliente" },
  leads: { module: "crm", label: "Lead" },
  products: { module: "productos", label: "Producto" },
  estimates: { module: "fin-estimados", label: "Estimado" },
  invoices: { module: "fin-invoices", label: "Factura" },
  payments: { module: "fin-invoices", label: "Pago" },
  projects: { module: "fin-proyectos", label: "Proyecto" },
};
const labels: Record<string, string> = {
  name: "Nombre",
  status: "Estado",
  full_name: "Nombre",
  notes: "Notas",
  invoice_date: "Fecha factura",
  due_date: "Vencimiento",
  payment_date: "Fecha del pago",
  amount: "Importe",
  method: "Método",
  reference: "Referencia",
  void_reason: "Motivo de anulación",
  balance_due: "Saldo",
  paid_amount: "Pagado",
  payment_status: "Estado de pago",
  total: "Total",
  version: "Revisión",
  start_date: "Inicio",
  end_date: "Fin",
  project_date: "Fecha proyecto",
  approval_note: "Constancia de aprobación",
};
type Event = {
  id: number;
  operation: string;
  created_at: string;
  actor_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};
function show(value: unknown) {
  if (value === null || value === undefined) return "—";
  return typeof value === "object"
    ? JSON.stringify(value, null, 2)
    : String(value);
}
export default async function History({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; entity: string; recordId: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { companyId, entity, recordId } = await params;
  let info = entities[entity];
  if (
    (entity === "designs" || entity === "client_shares") &&
    uuid.safeParse(recordId).success
  ) {
    const { db } = await companyContext(companyId);
    const { data, error } = await db
      .from(entity)
      .select("kind")
      .eq("company_id", companyId)
      .eq("id", recordId)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar el historial.");
    if (!data) notFound();
    info = {
      module:
        entity === "designs"
          ? data.kind
          : data.kind === "estimate"
            ? "estimadosweb"
            : "portal",
      label: entity === "designs" ? "Diseño" : "Enlace del cliente",
    };
  }
  if (entity === "work_records" && uuid.safeParse(recordId).success) {
    const { db } = await companyContext(companyId);
    const { data, error } = await db
      .from("work_records")
      .select("kind")
      .eq("company_id", companyId)
      .eq("id", recordId)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar el historial.");
    const kind = data && workspaceKind(data.kind);
    if (!kind) notFound();
    info = { module: workspaces[kind].module, label: workspaces[kind].title };
  }
  if (!info || !uuid.safeParse(recordId).success) notFound();
  const { db, company } = await requireModule(companyId, info.module),
    { before } = await searchParams;
  const { data, error } = await db.rpc("record_history", {
    p_company: companyId,
    p_entity: entity,
    p_id: recordId,
    p_before: before && /^\d{1,18}$/.test(before) ? before : null,
  });
  if (error) throw new Error("No se pudo cargar el historial.");
  const dates = new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: company.timezone,
    }),
    base = `/app/${companyId}/historial/${entity}/${recordId}`;
  return (
    <>
      <h1 className="page-title mb-3">Historial · {info.label}</h1>
      <p className="text-sm mb-7 text-muted-foreground">
        Cambios conservados con fecha y autor. Horario: {company.timezone}.
      </p>
      <div className="space-y-4">
        {(data as Event[])?.map((e) => (
          <details className="card" key={e.id}>
            <summary className="cursor-pointer font-semibold">
              {dates.format(new Date(e.created_at))} ·{" "}
              {e.operation === "INSERT" ? "Creación" : "Actualización"} ·
              Revisión {String(e.after_data?.version ?? "—")}
            </summary>
            <p className="my-4 text-xs">Autor: {e.actor_id}</p>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Antes</th>
                    <th>Después</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(e.after_data ?? {})
                    .filter(
                      (k) =>
                        ![
                          "id",
                          "company_id",
                          "created_by",
                          "updated_by",
                          "created_at",
                          "updated_at",
                        ].includes(k) &&
                        JSON.stringify(e.before_data?.[k]) !==
                          JSON.stringify(e.after_data?.[k]),
                    )
                    .map((k) => (
                      <tr key={k}>
                        <td>{labels[k] ?? k}</td>
                        <td>
                          <pre className="whitespace-pre-wrap text-xs max-w-lg">
                            {show(e.before_data?.[k])}
                          </pre>
                        </td>
                        <td>
                          <pre className="whitespace-pre-wrap text-xs max-w-lg">
                            {show(e.after_data?.[k])}
                          </pre>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {!data?.length && <p className="card">No hay cambios en esta vista.</p>}
      </div>
      <div className="flex gap-5 mt-5">
        {before && (
          <Link className="underline" href={base}>
            Más recientes
          </Link>
        )}
        {data?.length === 30 && (
          <Link className="underline" href={`${base}?before=${data.at(-1).id}`}>
            Anteriores
          </Link>
        )}
      </div>
    </>
  );
}
