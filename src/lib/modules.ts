export const modules = [
  { id: "dashboard", label: "Dashboard", group: "General", ready: true },
  { id: "crm", label: "Leads", group: "Comercial", ready: true },
  { id: "clientes", label: "Clientes", group: "Comercial", ready: true },
  {
    id: "nuevo3d",
    label: "Nuevo estimado 3D",
    group: "Comercial",
    ready: true,
  },
  { id: "productos", label: "Productos", group: "Comercial", ready: true },
  {
    id: "pergolamotor",
    label: "Pérgola sin 3D",
    group: "Comercial",
    ready: true,
  },
  {
    id: "estimadosweb",
    label: "Estimados web",
    group: "Comercial",
    ready: true,
  },
  { id: "adm-precios", label: "Precios", group: "Comercial", ready: true },
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
    ready: true,
  },
  {
    id: "manualfab",
    label: "Manual de fabricación",
    group: "Operaciones",
    ready: true,
  },
  { id: "permisos", label: "Permisos", group: "Operaciones", ready: true },
  { id: "inventario", label: "Inventario", group: "Operaciones", ready: true },
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
    ready: true,
  },
  {
    id: "instalaciones",
    label: "Instalaciones",
    group: "Operaciones",
    ready: true,
  },
  { id: "portal", label: "Portal del cliente", group: "General", ready: true },
  { id: "ia", label: "IA Assistant", group: "General", ready: true },
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
  if (module === "nuevo3d" || module === "pergolamotor")
    return `${base}/disenos/${module}`;
  if (module === "adm-precios") return `${base}/precios`;
  if (module === "estimadosweb") return `${base}/solicitudes-web`;
  if (module === "portal") return `${base}/compartir/portal`;
  if (module === "ia") return `${base}/ia`;
  if (module === "horasfix") return `${base}/horas`;
  const workspaceRoutes: Record<string, string> = {
    permisos: "permits",
    inventario: "inventory",
    instalaciones: "installations",
    manualfab: "manuals",
    mapazonas: "zones",
  };
  if (workspaceRoutes[module])
    return `${base}/operaciones/${workspaceRoutes[module]}`;
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
