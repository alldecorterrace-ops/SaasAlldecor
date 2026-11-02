import Link from "next/link";
import { redirect } from "next/navigation";
import { inventoryHome } from "@/lib/inventory-server";
export default async function NoModules({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const home = await inventoryHome(companyId);
  if (home !== `/app/${companyId}/sin-acceso`) redirect(home);
  return (
    <section className="card">
      <h1 className="page-title">Tu acceso está pendiente de configurar</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Pide al administrador de esta empresa que seleccione los módulos que
        necesitas.
      </p>
      <Link
        href="/empresas"
        className="mt-5 inline-block text-sm text-primary underline"
      >
        Volver a mis empresas
      </Link>
    </section>
  );
}
