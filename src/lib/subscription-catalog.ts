export const billingCatalogVersion = "20261016";
export const legacyBillingCatalogVersion = "20261007";

export const subscriptionPlans = [
  {
    code: "inicial",
    name: "Inicial",
    amount: 2999,
    users: 1,
    companies: 1,
    invoices: 10,
    support: "standard",
    customWebsite: false,
    customModules: false,
    description: "Tu empresa, tus clientes y tus primeras facturas.",
  },
  {
    code: "equipo",
    name: "Equipo",
    amount: 9999,
    users: 5,
    companies: 3,
    invoices: 100,
    support: "standard",
    customWebsite: false,
    customModules: false,
    description: "Coordina hasta tres empresas con tu equipo.",
  },
  {
    code: "profesional",
    name: "Profesional",
    amount: 29999,
    users: 21,
    companies: null,
    invoices: null,
    support: "email",
    customWebsite: false,
    customModules: false,
    description: "Más equipo, empresas y facturación sin límites.",
  },
  {
    code: "crecimiento",
    name: "Crecimiento",
    amount: 49999,
    users: null,
    companies: null,
    invoices: null,
    support: "phone",
    customWebsite: true,
    customModules: true,
    description: "Toda tu operación, con atención y desarrollo personalizados.",
  },
] as const;

export type SubscriptionPlan = (typeof subscriptionPlans)[number];
export type PlanCode = SubscriptionPlan["code"];
export const legacySubscriptionPlans = [
  { code: "inicial", amount: 2900 },
  { code: "equipo", amount: 5900 },
  { code: "profesional", amount: 9900 },
  { code: "crecimiento", amount: 17900 },
] as const;

export function planUsersLabel(users: number | null) {
  return users === null
    ? "Usuarios ilimitados"
    : users === 1
      ? "Solo tú, como dueño principal"
      : `Tú + ${users - 1} usuarios`;
}
export function planCompaniesLabel(companies: number | null) {
  return companies === null
    ? "Empresas ilimitadas"
    : companies === 1
      ? "1 empresa"
      : `Hasta ${companies} empresas`;
}
export function planInvoicesLabel(invoices: number | null) {
  return invoices === null
    ? "Facturas ilimitadas"
    : `${invoices} facturas al mes`;
}
export function planServices(plan: SubscriptionPlan): string[] {
  return [
    ...(plan.support === "email" || plan.support === "phone"
      ? ["Atención al cliente por email"]
      : []),
    ...(plan.support === "phone" ? ["Atención al cliente por teléfono"] : []),
    ...(plan.customWebsite ? ["Creación de sitio web personalizado"] : []),
    ...(plan.customModules ? ["Cambios personalizados en los módulos"] : []),
  ];
}
