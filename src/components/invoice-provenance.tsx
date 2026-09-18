import Link from "next/link";
export function InvoiceProvenance({
  companyId,
  historicalId,
}: {
  companyId: string;
  historicalId: string;
}) {
  return (
    <section className="card text-sm">
      <h2 className="font-semibold">Factura incorporada desde ADT</h2>
      <p className="mt-2">
        Conserva el número, las partidas, los importes y los pagos del respaldo
        revisado. La incorporación no genera una aprobación ni un cobro nuevo.
        Los cambios posteriores en ADT no se sincronizan automáticamente.
      </p>
      <Link
        className="mt-3 inline-block text-primary underline"
        href={`/app/${companyId}/historico/invoices/${historicalId}`}
      >
        Consultar factura original
      </Link>
    </section>
  );
}
