import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function InvoiceAllowance({ companyId }: { companyId: string }) {
  const db = await createClient();
  const { data, error } = await db.rpc("company_invoice_allowance", {
    p_company: companyId,
  });
  if (error) throw new Error("No se pudo comprobar el cupo de facturas.");
  if (!data) return null;
  const quota = z
    .object({
      limit: z.number().nullable(),
      used: z.number(),
      resets_at: z.string(),
    })
    .parse(data);
  return (
    <section
      className="card mb-5 text-sm"
      aria-label="Cupo mensual de facturas"
    >
      <p className="font-semibold">
        {quota.limit === null
          ? "Facturas ilimitadas"
          : `${quota.used} de ${quota.limit} facturas este mes`}
      </p>
      <p className="mt-2 text-muted-foreground">
        Cupo compartido entre todas las empresas de la suscripción. Se renueva
        el {quota.resets_at} a las 00:00 UTC. Anular una factura no devuelve el
        cupo.
      </p>
      {quota.limit !== null && quota.used >= quota.limit && (
        <p role="status" className="mt-2">
          Llegaste al límite mensual. Puedes seguir consultando facturas y
          registrando sus pagos. Para crear más, espera la renovación del cupo o
          solicita ampliar el plan.
        </p>
      )}
    </section>
  );
}
