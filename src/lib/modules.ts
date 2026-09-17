export const modules = [
  { id: "dashboard", label: "Dashboard", group: "General", ready: true },
  { id: "crm", label: "Leads", group: "Comercial", ready: true },
  { id: "clientes", label: "Clientes", group: "Comercial", ready: true },
  {
    id: "nuevo3d",
    label: "Nuevo estimado 3D",
    group: "Comercial",
    ready: false,
  },
  { id: "productos", label: "Productos", group: "Comercial", ready: true },
  {
    id: "pergolamotor",
    label: "Pérgola sin 3D",
    group: "Comercial",
    ready: false,
  },
  {
    id: "estimadosweb",
    label: "Estimados web",
    group: "Comercial",
    ready: false,
  },
  { id: "adm-precios", label: "Precios", group: "Comercial", ready: false },
  { id: "fin-estimados", label: "Estimados", group: "Comercial", ready: true },
  { id: "fin-invoices", label: "Facturas", group: "Finanzas", ready: true },
  {
    id: "fin-proyectos",
    label: "Proyectos",
    group: "Operaciones",
    ready: true,
  },
  {
    id: "horasfix",
    label: "Horas y solicitudes",
    group: "Operaciones",
    ready: false,
  },
  {
    id: "manualfab",
    label: "Manual de fabricación",
    group: "Operaciones",
    ready: false,
  },
  { id: "permisos", label: "Permisos", group: "Operaciones", ready: false },
  { id: "inventario", label: "Inventario", group: "Operaciones", ready: false },
  { id: "gastos", label: "Gastos", group: "Finanzas", ready: true },
  {
    id: "trabajadores",
    label: "Trabajadores",
    group: "Operaciones",
    ready: true,
  },
  {
    id: "mapazonas",
    label: "Mapa de zonas",
    group: "Operaciones",
    ready: false,
  },
  {
    id: "instalaciones",
    label: "Instalaciones",
    group: "Operaciones",
    ready: false,
  },
  { id: "portal", label: "Portal del cliente", group: "General", ready: false },
  { id: "ia", label: "IA Assistant", group: "General", ready: false },
  { id: "activity", label: "Actividad", group: "Administración", ready: true },
  {
    id: "config",
    label: "Configuración",
    group: "Administración",
    ready: true,
  },
] as const;
export type ModuleId = (typeof modules)[number]["id"];
export type Membership = {
  company_id: string;
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  active: boolean;
  permissions: Record<string, string[]>;
};
export function canAccess(
  member: Membership,
  module: string,
  action: "read" | "write" = "read",
) {
  if (!member.active) return false;
  if (member.role === "owner" || member.role === "admin") return true;
  const granted = member.permissions[module] ?? [];
  return (
    granted.includes(action) || (action === "read" && granted.includes("write"))
  );
}
export function moduleHref(company: string, module: string) {
  const base = `/app/${company}`;
  if (module === "gastos" || module === "trabajadores")
    return `${base}/${module}`;
  if (module === "crm") return `${base}/leads`;
  if (module === "productos") return `${base}/productos`;
  if (module === "activity") return `${base}/actividad`;
  if (module === "fin-estimados") return `${base}/estimados`;
  if (module === "fin-invoices") return `${base}/facturas`;
  if (module === "fin-proyectos") return `${base}/proyectos`;
  return module === "dashboard"
    ? base
    : module === "clientes"
      ? `${base}/clientes`
      : module === "config"
        ? `${base}/configuracion`
        : `${base}/modulos/${module}`;
}
export function companyHomeHref(company: string, member: Membership) {
  const first = modules.find((m) => canAccess(member, m.id));
  return first ? moduleHref(company, first.id) : `/app/${company}/sin-acceso`;
}
