import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccess, type Membership } from "./modules";

export const customerRecordSections = [
  {
    id: "estimados",
    label: "Estimados",
    module: "fin-estimados",
    table: "estimates",
    date: "estimate_date",
    fields: "id,number,estimate_date,status,total",
  },
  {
    id: "facturas",
    label: "Facturas",
    module: "fin-invoices",
    table: "invoices",
    date: "invoice_date",
    fields: "id,number,invoice_date,payment_status,total,balance_due",
  },
  {
    id: "proyectos",
    label: "Proyectos",
    module: "fin-proyectos",
    table: "projects",
    date: "project_date",
    fields: "id,name,project_date,status,start_date,end_date",
  },
] as const;
export type CustomerRecordSection = (typeof customerRecordSections)[number];
export type CustomerRecord = {
  id: string;
  number?: string;
  name?: string;
  estimate_date?: string;
  invoice_date?: string;
  project_date?: string;
  status?: string;
  payment_status?: string;
  total?: string | number;
  balance_due?: string | number;
  start_date?: string | null;
  end_date?: string | null;
};

// The caller first resolves the customer under its company and RLS. This loader
// also gates each module before querying, including counts and empty states.
export type CustomerRecordsResult = {
  sections: CustomerRecordSection[];
  section: CustomerRecordSection | undefined;
  page: number;
  count: number;
  rows: CustomerRecord[];
};

export async function loadCustomerRecords(
  db: Pick<SupabaseClient, "from">,
  member: Membership,
  companyId: string,
  customerId: string,
  requestedSection?: string,
  requestedPage?: string,
): Promise<CustomerRecordsResult> {
  if (member.company_id !== companyId || !canAccess(member, "clientes"))
    throw new Error("No tienes acceso al expediente de este cliente.");
  const sections = customerRecordSections.filter((s) =>
    canAccess(member, s.module),
  );
  const section =
    sections.find((s) => s.id === requestedSection) ?? sections[0];
  let page = /^\d{1,6}$/.test(requestedPage ?? "")
    ? Math.max(1, Math.min(100000, Number(requestedPage)))
    : 1;
  if (!section)
    return {
      sections,
      section,
      page: 1,
      count: 0,
      rows: [] as CustomerRecord[],
    };
  const query = (p: number) =>
    db
      .from(section.table)
      .select(section.fields, { count: "exact" })
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order(section.date, { ascending: false })
      .order("id")
      .range((p - 1) * 20, p * 20 - 1);
  let result = await query(page);
  if (result.error)
    throw new Error(
      "No se pudieron cargar los registros del cliente. Inténtalo de nuevo.",
    );
  // A removed record or stale link must not strand the user on an empty page.
  const lastPage = Math.max(1, Math.ceil((result.count ?? 0) / 20));
  if (page > lastPage) {
    page = lastPage;
    result = await query(page);
    if (result.error)
      throw new Error(
        "No se pudieron cargar los registros del cliente. Inténtalo de nuevo.",
      );
  }
  return {
    sections,
    section,
    page,
    count: result.count ?? 0,
    rows: (result.data ?? []) as unknown as CustomerRecord[],
  };
}
