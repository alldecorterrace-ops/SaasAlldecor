import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { historicalEstimateSchema } from "@/lib/historical-estimates";
import { HistoricalEstimateDetail } from "@/components/historical-estimate-detail";
import { Button } from "@/components/ui/button";

export default async function HistoricalEstimatePage({
  params,
}: {
  params: Promise<{ companyId: string; historicalId: string }>;
}) {
  const { companyId, historicalId } = await params;
  if (!uuid.safeParse(historicalId).success) notFound();
  const { db } = await requireModule(companyId, "fin-estimados");
  const { data, error } = await db
    .from("historical_estimates")
    .select("presentation")
    .eq("company_id", companyId)
    .eq("id", historicalId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el estimado histórico.");
  if (!data) notFound();
  const record = historicalEstimateSchema.parse(data.presentation);
  const { data: copy, error: copyError } = await db
    .from("estimates")
    .select("id")
    .eq("company_id", companyId)
    .eq("historical_estimate_id", historicalId)
    .maybeSingle();
  if (copyError) throw new Error("No se pudo comprobar la copia del estimado.");
  return (
    <>
      <div className="mb-5">
        <Button asChild variant="outline">
          <Link href={`/app/${companyId}/estimados/historico`}>
            Volver al histórico
          </Link>
        </Button>
      </div>
      {copy && (
        <p className="card mb-5">
          Este documento tiene una{" "}
          <Link
            className="text-primary underline"
            href={`/app/${companyId}/estimados/${copy.id}`}
          >
            copia de consulta en Estimados
          </Link>
          .
        </p>
      )}
      <HistoricalEstimateDetail record={record} />
    </>
  );
}
