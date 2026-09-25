import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { saveCenter } from "./actions";
export default async function PostalCenter({
  params,
}: {
  params: Promise<{ companyId: string; zip: string }>;
}) {
  const { companyId, zip } = await params;
  if (!/^\d{5}$/.test(zip)) notFound();
  const { db } = await requireModule(companyId, "mapazonas", "write");
  const { data, error } = await db
    .from("postal_centers")
    .select("lat,lng,ciudad,version")
    .eq("company_id", companyId)
    .eq("zip", zip)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar la ubicación.");
  return (
    <div className="max-w-xl space-y-5">
      <h1 className="page-title">Ubicación del ZIP {zip}</h1>
      <p>
        Usa el centro del código postal, no la ubicación de una vivienda.
        Cambiarlo mueve los puntos de este ZIP en tu empresa.
      </p>
      <ActionForm action={saveCenter.bind(null, companyId, zip)}>
        <input type="hidden" name="version" value={data?.version ?? 0} />
        <label className="field">
          Ciudad
          <input
            name="city"
            maxLength={118}
            defaultValue={data?.ciudad ?? ""}
          />
        </label>
        <label className="field">
          Latitud
          <input
            name="latitude"
            type="number"
            step="any"
            min={-90}
            max={90}
            required
            defaultValue={data?.lat ?? ""}
          />
        </label>
        <label className="field">
          Longitud
          <input
            name="longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            required
            defaultValue={data?.lng ?? ""}
          />
        </label>
      </ActionForm>
      <Link className="underline" href={`/app/${companyId}/mapa-zonas`}>
        Volver al mapa
      </Link>
    </div>
  );
}
