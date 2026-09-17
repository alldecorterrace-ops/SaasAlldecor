import { requireModule } from "@/lib/auth";
import Link from "next/link";
import { canAccess } from "@/lib/modules";
import { rateLabels } from "@/lib/designs";
import { ActionForm } from "@/components/action-form";
import { priceAction } from "../disenos/actions";
export default async function Prices({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "adm-precios");
  const { data, error } = await db
    .from("price_books")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error("No se pudieron cargar las tarifas.");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Precios</h1>
      <p>
        Tarifas de venta en USD. Versión {data?.version ?? 0}. Cada diseño
        conserva una copia de sus tarifas. Los cambios no alteran estimados
        existentes.
      </p>
      <ActionForm
        key={data?.version ?? 0}
        action={priceAction.bind(null, companyId)}
        disabled={!canAccess(member, "adm-precios", "write")}
      >
        <input type="hidden" name="version" value={data?.version ?? 0} />
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(rateLabels).map(([k, label]) => (
            <label className="field" key={k}>
              {label}
              <input
                name={k}
                required
                inputMode="decimal"
                pattern="[0-9]{1,7}([.][0-9]{1,2})?"
                defaultValue={data?.rates[k] ?? ""}
              />
            </label>
          ))}
        </div>
      </ActionForm>
      {data && (
        <Link
          className="underline"
          href={`/app/${companyId}/historial/price_books/${data.id}`}
        >
          Historial de tarifas
        </Link>
      )}
      <p className="text-sm text-muted-foreground">
        Estas tarifas calculan techo, paredes, cocina, refuerzos y permiso.
        Equipos y partidas especiales se agregan desde Productos al estimado. El
        catálogo de costos y márgenes de ADT aún requiere conciliación antes de
        su importación.
      </p>
    </div>
  );
}
