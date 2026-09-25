import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { missingZonePermissions } from "@/lib/commercial-zones";
import { analyzeAdtZones, type ZoneSource } from "@/lib/zone-analysis";
import { externalEffectsAllowed } from "@/lib/deployment-environment";
import { usd } from "@/lib/finance";
import { CommercialZoneMap } from "@/components/commercial-zone-map";

export default async function CommercialZones({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { companyId } = await params;
  const { db, member } = await requireModule(companyId, "mapazonas");
  const missing = missingZonePermissions(member),
    base = `/app/${companyId}/mapa-zonas`;
  if (missing.length)
    return (
      <div className="space-y-5">
        <h1 className="page-title">Mapa de zonas</h1>
        <p role="alert">
          Para consultar el mapa comercial necesitas acceso de lectura a:{" "}
          {missing.map(([, label]) => label).join(", ")}.
        </p>
        <p>Solicita esos permisos al administrador de tu empresa.</p>
        <Link
          className="underline"
          href={`/app/${companyId}/operaciones/zones`}
        >
          Abrir zonas de trabajo
        </Link>
      </div>
    );
  const { data, error } = await db.rpc("commercial_zone_source", {
    p_company: companyId,
  });
  if (error || !data)
    throw new Error("No se pudo cargar el mapa completo. Vuelve a intentarlo.");
  const source = data as ZoneSource,
    report = analyzeAdtZones(source),
    write = canAccess(member, "mapazonas", "write");
  const sp = await searchParams;
  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow">Comercial</p>
          <h1 className="page-title mt-2">Mapa de zonas</h1>
          <p className="mt-2">
            Dónde están tus clientes y cuáles zonas cierran.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link className="underline" href={base}>
            Actualizar
          </Link>
          <Link
            className="underline"
            href={`/app/${companyId}/operaciones/zones`}
          >
            Zonas de trabajo
          </Link>
        </div>
      </div>
      {sp.saved === "1" && (
        <p role="status">Ubicación del código postal guardada.</p>
      )}
      <CommercialZoneMap
        report={report}
        tilesAllowed={externalEffectsAllowed(process.env)}
      />
      <div className="card space-y-2 text-sm">
        <p>
          Ordenada por dinero recibido de facturas no anuladas. «Facturado»
          conserva la regla de ADT: pagos recibidos; no es el total emitido.
        </p>
        <p>
          Los estados representan clientes clasificados por pagos y saldo, no el
          avance de obra. El área usa los ZIP con prefijos 32, 33 y 34. Las
          capas solo cambian los puntos.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <a
          className="underline font-semibold"
          href={`/api/zone-export/${companyId}`}
        >
          Exportar CSV de zonas
        </a>
        <span>{report.zonas.length} zona(s) con actividad</span>
      </div>
      <div className="card overflow-x-auto">
        <table>
          <caption className="text-left mb-3 font-semibold">
            Resultados por código postal
          </caption>
          <thead>
            <tr>
              <th>Código postal</th>
              <th>Ciudad</th>
              <th>Contactos</th>
              <th>Cerrados</th>
              <th>Cierre</th>
              <th>Facturado</th>
              <th>Ticket promedio</th>
            </tr>
          </thead>
          <tbody>
            {report.zonas.map((z) => (
              <tr key={z.zip}>
                <td>{z.zip}</td>
                <td>{z.ciudad || "—"}</td>
                <td>{z.contactos}</td>
                <td>{z.cerrados}</td>
                <td>{z.cierre}%</td>
                <td>{usd(z.ingresos)}</td>
                <td>{z.ticket ? usd(z.ticket) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.zonas.length && (
          <p className="py-5">Todavía no hay zonas con actividad.</p>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Los puntos se ubican por el centro del código postal, no por la
        dirección de cada casa. Sin ZIP válido: {report.resumen.sin_zip}. Sin
        ubicación guardada: {report.resumen.sin_punto}.
      </p>
      <details className="card">
        <summary>
          Códigos sin ubicación ({report.zips_faltantes.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {report.zips_faltantes.map((z) => (
            <li key={z.zip}>
              {z.zip} · {z.ciudad}
              {write && (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    className="underline"
                    href={`${base}/ubicacion/${z.zip}`}
                  >
                    Configurar ubicación de {z.zip}
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
      {write && (
        <details className="card">
          <summary>
            Ubicaciones guardadas ({source.postalCenters.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {source.postalCenters.map((z) => (
              <li key={z.zip}>
                <Link className="underline" href={`${base}/ubicacion/${z.zip}`}>
                  {z.zip} · {z.ciudad || "Editar ubicación"}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
