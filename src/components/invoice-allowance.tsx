import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ReceiptText } from "lucide-react";

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
      className="card mb-5 flex flex-wrap items-start gap-4 border-indigo-100 bg-indigo-50/40 text-sm"
      aria-label="Cupo mensual de facturas"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-white text-primary">
        <ReceiptText size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {quota.limit === null
            ? "Facturas ilimitadas"
            : `${quota.used} de ${quota.limit} facturas este mes`}
        </p>
        <p className="mt-2 text-muted-foreground">
          Cupo compartido entre todas las empresas de la suscripción. Se renueva
          el {quota.resets_at} a las 00:00 UTC. Anular una factura no devuelve
          el cupo.
        </p>
        {quota.limit !== null && quota.used >= quota.limit && (
          <p role="status" className="mt-2">
            Llegaste al límite mensual. Puedes seguir consultando facturas y
            registrando sus pagos. Para crear más, espera la renovación del cupo
            o solicita ampliar el plan.
          </p>
        )}
      </div>
    </section>
  );
}
