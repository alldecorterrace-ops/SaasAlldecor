import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { todayInTimezone } from "@/lib/commercial";
import { ExpenseBatchForm } from "@/components/expense-batch-form";
export default async function Batch({
  params,
}: {
  params: Promise<{ companyId: string; batchId: string }>;
}) {
  const { companyId, batchId } = await params;
  if (!uuid.safeParse(batchId).success) notFound();
  const { db, member, company } = await requireModule(
    companyId,
    "gastos",
    "write",
  );
  if (!["owner", "admin"].includes(member.role)) notFound();
  const { data, error } = await db
    .from("expense_batches")
    .select("expense_ids")
    .eq("company_id", companyId)
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw new Error("No se pudo comprobar el resultado del lote.");
  return (
    <div className="space-y-5">
      <h1 className="page-title">
        {data ? "Lote registrado" : "Registrar varios gastos"}
      </h1>
      <Link className="underline" href={`/app/${companyId}/gastos`}>
        Volver al registro
      </Link>
      {data ? (
        <section className="card space-y-4">
          <p role="status">
            Este lote ya se guardó. Reabrir esta página no crea nuevos gastos.
          </p>
          <ol className="space-y-2">
            {(data.expense_ids as string[]).map((id, i) => (
              <li key={id}>
                <Link
                  className="underline"
                  href={`/app/${companyId}/gastos/${id}`}
                >
                  Gasto {i + 1} · Ver ficha y comprobante
                </Link>
              </li>
            ))}
          </ol>
          <Link className="underline" href={`/app/${companyId}/gastos/lote`}>
            Registrar otro lote
          </Link>
        </section>
      ) : (
        <ExpenseBatchForm
          companyId={companyId}
          batchId={batchId}
          firstId={randomUUID()}
          date={todayInTimezone(company.timezone)}
          projects={canAccess(member, "fin-proyectos")}
          workers={canAccess(member, "trabajadores")}
        />
      )}
    </div>
  );
}
