import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, ArrowUpRight, Building2, Settings2 } from "lucide-react";
import { companyContext } from "@/lib/auth";
import { canAccess, modules, moduleHref, companyHomeHref } from "@/lib/modules";
import { Button } from "@/components/ui/button";
export default async function Dashboard({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { db, company, member } = await companyContext(companyId);
  if (!canAccess(member, "dashboard"))
    redirect(companyHomeHref(companyId, member));
  const allowed = canAccess(member, "clientes");
  let count: number | null = null;
  if (allowed) {
    const result = await db
      .from("customers")
      .select("id", { head: true, count: "exact" })
      .eq("company_id", companyId)
      .eq("status", "active");
    if (result.error) throw new Error("Customer count unavailable");
    count = result.count;
  }
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Tu empresa, en un solo lugar</p>
          <h1 className="page-title mt-3">Hola, {company.name}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Un espacio para organizar el trabajo y avanzar juntos.
          </p>
        </div>
        {canAccess(member, "clientes", "write") && (
          <Button asChild>
            <Link href={`/app/${companyId}/clientes/nuevo`}>
              Nuevo cliente
              <ArrowUpRight size={16} />
            </Link>
          </Button>
        )}
      </div>
      <section className="relative mb-7 overflow-hidden rounded-2xl bg-[#174b3b] p-7 text-white sm:p-9">
        <div className="absolute right-[-50px] bottom-[-120px] size-80 rounded-full border border-white/10" />
        <div className="absolute right-[-10px] bottom-[-160px] size-80 rounded-full border border-white/10" />
        <p className="text-[10px] font-semibold tracking-[.18em] text-[#c8dbab] uppercase">
          El comienzo de una nueva etapa
        </p>
        <h2 className="relative mt-4 text-2xl font-semibold tracking-tight">
          Tu espacio ya tiene una base.
        </h2>
        <p className="relative mt-3 max-w-lg text-sm leading-6 text-white/70">
          Comienza con tus clientes y configura el acceso del equipo. Los demás
          módulos se incorporarán conservando las funciones de ADT Admin.
        </p>
      </section>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {allowed && (
          <div className="card">
            <Users size={19} className="text-primary" />
            <p className="mt-5 text-sm text-muted-foreground">
              Clientes activos
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              {count ?? 0}
            </p>
            <Link
              className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-primary"
              href={`/app/${companyId}/clientes`}
            >
              Ver clientes
              <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <div className="card">
          <Building2 size={19} className="text-primary" />
          <p className="mt-5 text-sm text-muted-foreground">Espacio actual</p>
          <p className="mt-2 truncate text-xl font-semibold">{company.name}</p>
          <Link
            href="/empresas"
            className="mt-5 inline-block text-xs font-semibold text-primary"
          >
            Cambiar de empresa
          </Link>
        </div>
        {canAccess(member, "config") && (
          <div className="card">
            <Settings2 size={19} className="text-primary" />
            <p className="mt-5 text-sm text-muted-foreground">
              Equipo y acceso
            </p>
            <p className="mt-2 text-xl font-semibold">A tu manera</p>
            <Link
              href={`/app/${companyId}/configuracion`}
              className="mt-5 inline-block text-xs font-semibold text-primary"
            >
              Administrar configuración
            </Link>
          </div>
        )}
      </div>
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Avance de la nueva plataforma</h2>
          <span className="text-xs text-muted-foreground">
            23 módulos en alcance
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Esta es la primera entrega. El expediente completo de clientes y la
          migración de datos siguen pendientes. Los módulos señalados como «En
          preparación» todavía no realizan operaciones.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {modules
            .filter((m) => canAccess(member, m.id))
            .map((m) => (
              <Link
                href={moduleHref(companyId, m.id)}
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-background p-3 text-xs"
              >
                <span>{m.label}</span>
                <span
                  className={m.ready ? "text-primary" : "text-muted-foreground"}
                >
                  {m.ready ? "Base disponible" : "En preparación"}
                </span>
              </Link>
            ))}
        </div>
      </section>
    </>
  );
}
