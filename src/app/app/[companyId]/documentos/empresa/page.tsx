import { companyContext } from "@/lib/auth";
import {
  commercialIdentity,
  emptyCommercialIdentity,
} from "@/lib/commercial-identity";
import { CommercialIdentityForm } from "@/components/commercial-identity-form";
import { notFound } from "next/navigation";
import Link from "next/link";
export default async function CommercialIdentityPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { db, member, company } = await companyContext(companyId);
  if (member.role === "member") notFound();
  const { data, error } = await db
    .from("commercial_profiles")
    .select("identity,version")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error("No se pudieron cargar los datos comerciales.");
  const identity = data
    ? commercialIdentity.parse(data.identity)
    : emptyCommercialIdentity;
  return (
    <>
      <p className="eyebrow">Comercial / Documentos</p>
      <h1 className="page-title mt-2 mb-4">
        Datos comerciales de {company.name}
      </h1>
      <p className="max-w-3xl mb-4 text-muted-foreground">
        Configura la identidad y el contacto que aparecerán en los próximos PDF
        y correos de Estimados y Facturas. Deja vacío lo que no esté confirmado.
        Las instrucciones de pago se usan en Facturas.
      </p>
      <p className="max-w-3xl mb-6 text-sm">
        Los documentos ya conservados mantienen su contenido. Estos datos no
        cambian precios, abonos, saldos ni el correo del destinatario. El correo
        comercial indicado aquí es de contacto.
      </p>
      <CommercialIdentityForm
        companyId={companyId}
        identity={identity}
        version={data?.version ?? 0}
      />
      <div className="flex gap-4 mt-5">
        <Link className="underline" href={`/app/${companyId}/estimados`}>
          Volver a Estimados
        </Link>
        <Link className="underline" href={`/app/${companyId}/facturas`}>
          Volver a Facturas
        </Link>
      </div>
    </>
  );
}
