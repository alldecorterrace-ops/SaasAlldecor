import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { pricingSettingsSchema } from "@/lib/pricing-settings";
import { PricingSettingsForm } from "@/components/pricing-settings-form";
export default async function Prices({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ saved?: string; restored?: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "adm-precios"),
    query = await searchParams;
  const { data, error } = await db
    .from("pricing_settings")
    .select("id,version,settings")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error("No se pudieron cargar los precios.");
  const initial =
    data?.settings == null ? null : pricingSettingsSchema.parse(data.settings);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Precios</h1>
      <p>
        Tarifas, costos y catálogo. Versión {data?.version ?? 0}. Los estimados
        conservan sus precios guardados.
      </p>
      <PricingSettingsForm
        key={data?.version ?? 0}
        companyId={companyId}
        version={data?.version ?? 0}
        initial={initial}
        readOnly={!canAccess(member, "adm-precios", "write")}
        saved={query.saved === "1"}
        restored={query.restored === "1"}
      />
      {data && (
        <Link
          className="underline"
          href={`/app/${companyId}/historial/pricing_settings/${data.id}`}
        >
          Historial de precios
        </Link>
      )}
    </div>
  );
}
