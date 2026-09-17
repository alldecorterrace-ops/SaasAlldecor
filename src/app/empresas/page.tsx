import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Building2, ArrowUpRight, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
import { CompanyForm } from "@/components/company-form";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function Companies() {
  const { db, user } = await requireUser();
  const { data, error } = await db
    .from("companies")
    .select("id,name,timezone")
    .order("name");
  if (error) throw new Error("Companies unavailable");
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/empresas" className="text-2xl font-bold tracking-tight">
          all decor<span className="text-primary">.</span>
        </Link>
        <form action={signOut}>
          <Button variant="ghost" size="sm">
            <LogOut size={14} />
            Cerrar sesión
          </Button>
        </form>
      </header>
      <div className="mt-16 mb-8">
        <p className="eyebrow">Espacios de trabajo</p>
        <h1 className="page-title mt-3">Tus empresas</h1>
        <p className="mt-3 text-muted-foreground">
          Selecciona dónde quieres trabajar. Sesión de {user.email}.
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <section className="grid content-start gap-4">
          {data?.length ? (
            data.map((c) => (
              <Link
                key={c.id}
                href={`/app/${c.id}`}
                className="card group flex items-center gap-4 transition hover:border-primary"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                  <Building2 />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold break-words">{c.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Espacio independiente
                  </p>
                </div>
                <ArrowUpRight className="size-5 text-muted-foreground group-hover:text-primary" />
              </Link>
            ))
          ) : (
            <div className="card py-12 text-center">
              <Building2 className="mx-auto mb-4 text-primary" />
              <h2 className="font-semibold">Tu primera empresa empieza aquí</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Crea un espacio o pide al administrador que agregue tu correo a
                su equipo.
              </p>
            </div>
          )}
        </section>
        <aside className="card h-fit">
          <h2 className="mb-2 text-lg font-semibold">Un nuevo espacio</h2>
          <p className="mb-6 text-sm leading-6 text-muted-foreground">
            Tendrás acceso como propietario. Los datos de cada empresa
            permanecen separados.
          </p>
          <CompanyForm requestId={randomUUID()} />
        </aside>
      </div>
    </main>
  );
}
