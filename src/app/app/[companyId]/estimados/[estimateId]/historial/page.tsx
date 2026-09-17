import Link from "next/link";
import { estimateRecord } from "@/lib/estimate-record";
import { Button } from "@/components/ui/button";
export default async function History({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; estimateId: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { companyId, estimateId } = await params,
    { db, record, company } = await estimateRecord(companyId, estimateId),
    { before } = await searchParams;
  let query = db
    .from("estimate_revisions")
    .select("version,created_at")
    .eq("company_id", companyId)
    .eq("estimate_id", estimateId)
    .order("version", { ascending: false })
    .limit(50);
  if (before && /^[1-9]\d{0,8}$/.test(before))
    query = query.lt("version", Number(before));
  const { data, error } = await query;
  if (error) throw new Error("No se pudo cargar el historial.");
  const dates = new Intl.DateTimeFormat("es", {
      timeZone: company.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }),
    base = `/app/${companyId}/estimados/${estimateId}`;
  return (
    <>
      <p className="eyebrow">Estimados / Historial</p>
      <h1 className="page-title my-3">Revisiones de {record.number}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cada revisión conserva los datos del cliente, las líneas y los importes
        de ese momento.
      </p>
      <div className="card space-y-3">
        {data.map((r) => (
          <div
            key={r.version}
            className="flex flex-wrap justify-between gap-3 border-b border-border pb-3"
          >
            <span>
              Revisión {r.version} · {dates.format(new Date(r.created_at))}
            </span>
            <Link
              className="text-primary underline"
              href={`${base}?revision=${r.version}`}
            >
              Consultar revisión
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-3">
        <Button variant="outline" asChild>
          <Link href={base}>Volver al estimado</Link>
        </Button>
        {data.length === 50 && (
          <Button variant="outline" asChild>
            <Link href={`${base}/historial?before=${data.at(-1)!.version}`}>
              Anteriores
            </Link>
          </Button>
        )}
      </div>
    </>
  );
}
