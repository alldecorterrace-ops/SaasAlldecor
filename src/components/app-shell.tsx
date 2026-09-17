"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  LayoutDashboard,
  Users,
  Settings2,
  Menu,
  X,
  ArrowLeftRight,
  LogOut,
  PanelTop,
  ChevronRight,
} from "lucide-react";
import { modules, canAccess, moduleHref, type Membership } from "@/lib/modules";
import { signOut } from "@/app/auth/actions";
export function AppShell({
  company,
  member,
  email,
  children,
}: {
  company: { id: string; name: string };
  member: Membership;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    [open, setOpen] = useState(false);
  const visible = modules.filter((m) => canAccess(member, m.id));
  const current = visible.find(
    (m) =>
      pathname === moduleHref(company.id, m.id) ||
      (m.id === "clientes" &&
        pathname.startsWith(moduleHref(company.id, m.id) + "/")),
  );
  return (
    <div className="min-h-screen lg:pl-64">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:p-3"
      >
        Saltar al contenido
      </a>
      {open && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-[#fbfcfa] transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="flex items-center justify-between px-6 pt-7 pb-6">
          <Link href="/empresas" className="text-2xl font-bold tracking-tight">
            all decor<span className="text-primary">.</span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden"
            aria-label="Cerrar navegación"
          >
            <X size={19} />
          </button>
        </div>
        <Link
          href="/empresas"
          className="mx-4 mb-5 flex items-center gap-3 rounded-xl border border-border bg-white p-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
            <Building2 size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {company.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Cambiar empresa
            </span>
          </span>
          <ArrowLeftRight size={13} className="text-muted-foreground" />
        </Link>
        <nav aria-label="Módulos" className="flex-1 overflow-y-auto px-3 pb-6">
          {[
            "General",
            "Comercial",
            "Operaciones",
            "Finanzas",
            "Administración",
          ].map((group) => {
            const list = visible.filter((m) => m.group === group);
            return list.length ? (
              <section key={group} className="mb-5">
                <p className="eyebrow px-3 py-2 text-[9px]">{group}</p>
                {list.map((m) => {
                  const selected = current?.id === m.id;
                  const Icon =
                    m.id === "dashboard"
                      ? LayoutDashboard
                      : m.id === "clientes"
                        ? Users
                        : m.id === "config"
                          ? Settings2
                          : PanelTop;
                  return (
                    <Link
                      aria-current={selected ? "page" : undefined}
                      key={m.id}
                      href={moduleHref(company.id, m.id)}
                      onClick={() => setOpen(false)}
                      className={`my-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] ${selected ? "bg-[#e7f0e8] font-semibold text-primary" : "text-[#607269] hover:bg-accent"}`}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="flex-1">{m.label}</span>
                      {!m.ready && (
                        <span
                          title="En preparación"
                          aria-label="En preparación"
                          className="size-1.5 rounded-full bg-[#c6cfc8]"
                        />
                      )}
                    </Link>
                  );
                })}
              </section>
            ) : null;
          })}
        </nav>
        <div className="border-t border-border p-4">
          <p className="truncate text-xs font-medium">{email}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {member.role === "owner"
              ? "Propietario"
              : member.role === "admin"
                ? "Administrador"
                : "Miembro"}
          </p>
          <form action={signOut}>
            <button className="mt-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
              <LogOut size={13} />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <header className="flex min-h-18 items-center justify-between gap-4 border-b border-border bg-white/80 px-5 sm:px-9">
        <div className="flex items-center gap-3">
          <button
            className="lg:hidden"
            aria-label="Abrir navegación"
            onClick={() => setOpen(true)}
          >
            <Menu size={21} />
          </button>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Espacio de trabajo
          </span>
          <ChevronRight className="hidden size-3 text-muted-foreground sm:block" />
          <span className="text-sm font-medium">
            {current?.label ?? "Empresa"}
          </span>
        </div>
        <span className="rounded-full border border-[#d3dfd4] bg-[#f0f5ec] px-3 py-1.5 text-[10px] font-medium text-primary">
          Nueva plataforma · En desarrollo
        </span>
      </header>
      <main id="main-content" className="mx-auto max-w-7xl p-5 sm:p-9">
        {children}
      </main>
    </div>
  );
}
