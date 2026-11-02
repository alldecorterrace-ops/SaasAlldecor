"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  ReceiptText,
  FileCheck2,
  Package,
  BriefcaseBusiness,
  Clock3,
  Wallet,
  UserRoundCog,
  MapPin,
  CalendarDays,
  ClipboardCheck,
  BookOpen,
  Boxes,
  Activity,
  Globe,
  Tags,
  ContactRound,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  workspaceModules as modules,
  canAccess,
  moduleHref,
  type Membership,
} from "@/lib/modules";
import { signOut } from "@/app/auth/actions";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import type { InvSection } from "@/lib/inventory";

const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  crm: ContactRound,
  clientes: Users,
  productos: Package,
  estimadosweb: Globe,
  "adm-precios": Tags,
  "fin-estimados": FileCheck2,
  "fin-invoices": ReceiptText,
  "fin-proyectos": BriefcaseBusiness,
  horasfix: Clock3,
  manualfab: BookOpen,
  permisos: ClipboardCheck,
  inventario: Boxes,
  gastos: Wallet,
  trabajadores: UserRoundCog,
  mapazonas: MapPin,
  instalaciones: CalendarDays,
  portal: PanelTop,
  activity: Activity,
  config: Settings2,
};
const groups = [
  "General",
  "Comercial",
  "Compras y productos",
  "Inventario",
  "Operaciones",
  "Finanzas",
  "Administración",
];
const inventoryIcons: Record<InvSection["slug"], LucideIcon> = {
  compras: ReceiptText,
  proveedores: Building2,
  productos: Tags,
  existencias: Boxes,
  movimientos: ArrowLeftRight,
  ubicaciones: Package,
  ajustes: ClipboardCheck,
};

export function AppShell({
  company,
  member,
  email,
  inventorySections = [],
  lotInventory = false,
  children,
}: {
  company: { id: string; name: string };
  member: Membership;
  email: string;
  inventorySections?: readonly InvSection[];
  lotInventory?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const visible = modules.filter(
    (m) =>
      canAccess(member, m.id) &&
      !(lotInventory && m.id === "inventario" && member.role === "member"),
  );
  const invCurrent = inventorySections.find((s) =>
    pathname.startsWith(`/app/${company.id}/inventario/${s.slug}`),
  );
  const current = visible.find(
    (m) =>
      pathname === moduleHref(company.id, m.id) ||
      (m.id !== "dashboard" &&
        pathname.startsWith(moduleHref(company.id, m.id) + "/")),
  );
  const role =
    member.role === "owner"
      ? "Propietario"
      : member.role === "admin"
        ? "Administrador"
        : "Miembro";

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) drawer.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previous;
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [open]);

  function navigation(mobile = false) {
    return (
      <>
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Brand href="/empresas" />
          {mobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => drawer.current?.close()}
              aria-label="Cerrar navegación"
            >
              <X size={20} />
            </Button>
          )}
        </div>
        <Link
          href="/empresas"
          onClick={() => drawer.current?.close()}
          className="mx-4 mb-5 flex items-center gap-3 rounded-xl border border-border bg-slate-50 p-3 transition-colors hover:border-indigo-200 hover:bg-accent"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-xs">
            <Building2 size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-xs font-bold"
              title={company.name}
            >
              {company.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Cambiar empresa
            </span>
          </span>
          <ArrowLeftRight
            size={14}
            className="shrink-0 text-muted-foreground"
          />
        </Link>
        <nav
          aria-label="Módulos"
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-5"
        >
          {groups.map((group) => {
            const links = [
              ...visible
                .filter((m) => m.group === group)
                .map((m) => ({
                  key: m.id,
                  href: moduleHref(company.id, m.id),
                  active: m.id === current?.id,
                  ready: m.ready,
                  Icon: icons[m.id] ?? PanelTop,
                  label:
                    m.id === "productos"
                      ? "Catálogo comercial"
                      : m.id === "inventario" && lotInventory
                        ? "Archivo de inventario"
                        : m.label,
                })),
              ...inventorySections
                .filter((s) => s.group === group)
                .map((s) => ({
                  key: s.slug,
                  href: `/app/${company.id}/inventario/${s.slug}`,
                  active: s.slug === invCurrent?.slug,
                  ready: true,
                  Icon: inventoryIcons[s.slug],
                  label: s.label,
                })),
            ];
            return (
              links.length > 0 && (
                <section key={group} className="mb-4">
                  <p className="eyebrow px-3 py-2 text-[10px]">{group}</p>
                  {links.map(({ key, href, active, ready, Icon, label }) => (
                    <Link
                      key={key}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className="workspace-nav-link"
                      onClick={() => drawer.current?.close()}
                    >
                      <Icon
                        size={17}
                        strokeWidth={1.7}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      <span className="flex-1">{label}</span>
                      {!ready && (
                        <span
                          title="En preparación"
                          aria-label="En preparación"
                          className="size-1.5 rounded-full bg-slate-300"
                        />
                      )}
                    </Link>
                  ))}
                </section>
              )
            );
          })}
        </nav>
        <div className="border-t border-border px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary"
              aria-hidden="true"
            >
              {email.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold" title={email}>
                {email}
              </p>
              <p className="text-[11px] text-muted-foreground">{role}</p>
            </div>
          </div>
          <form action={signOut}>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-start text-xs text-muted-foreground"
            >
              <LogOut size={15} />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </>
    );
  }
  return (
    <div className="workspace-frame lg:pl-64 print:pl-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
      >
        Saltar al contenido
      </a>
      <aside
        className="workspace-sidebar fixed inset-y-0 left-0 z-20 hidden w-64 flex-col lg:flex print:hidden"
        aria-label="Navegación del espacio de trabajo"
      >
        {navigation()}
      </aside>
      <dialog
        ref={drawer}
        id="mobile-navigation"
        className="mobile-navigation print:hidden"
        aria-label="Navegación del espacio de trabajo"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) drawer.current?.close();
        }}
      >
        <div className="workspace-sidebar flex h-full flex-col">
          {navigation(true)}
        </div>
      </dialog>
      <header className="workspace-topbar flex min-h-20 items-center justify-between gap-4 px-4 sm:px-8 print:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon"
            aria-label="Abrir navegación"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => {
              drawer.current?.showModal();
              setOpen(true);
            }}
          >
            <Menu size={22} />
          </Button>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Espacio de trabajo
          </span>
          <ChevronRight
            className="hidden size-3 text-muted-foreground sm:block"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold">
            {invCurrent?.label ?? current?.label ?? "Empresa"}
          </span>
        </div>
        <span className="hidden items-center gap-2 rounded-full border border-indigo-100 bg-accent px-3 py-1.5 text-[10px] font-semibold text-primary sm:inline-flex">
          <ShieldCheck size={13} aria-hidden="true" />
          Nueva plataforma · En desarrollo
        </span>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto min-w-0 max-w-7xl p-4 sm:p-8 lg:p-9"
      >
        {children}
      </main>
    </div>
  );
}
