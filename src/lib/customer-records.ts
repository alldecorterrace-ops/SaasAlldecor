import {
  commercialDocumentList,
  type CommercialDocumentList,
} from "./commercial-documents";
import {
  customerPermitsSchema,
  type CustomerPermitsResult,
} from "./customer-permits";
import {
  historyCursor,
  customerHistorySchema,
  type CustomerHistoryResult,
} from "./customer-history";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccess, type Membership } from "./modules";
import {
  customerLedgerSchema,
  type CustomerLedgerResult,
} from "./customer-ledger";

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
  { id: "pagos", label: "Pagos", module: "fin-invoices" },
  { id: "gastos", label: "Gastos de proyectos", module: "gastos" },
  { id: "permisos", label: "Permisos de obra", module: "permisos" },
  { id: "documentos", label: "Documentos de permisos", module: "permisos" },
  { id: "comerciales", label: "Documentos comerciales", module: "clientes" },
  { id: "historial", label: "Historial", module: "clientes" },
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
  ledger?: CustomerLedgerResult;
  history?: CustomerHistoryResult;
  permits?: CustomerPermitsResult;
  commercial?: CommercialDocumentList;
  before?: string | null;
};

export async function loadCustomerRecords(
  db: Pick<SupabaseClient, "from" | "rpc">,
  member: Membership,
  companyId: string,
  customerId: string,
  requestedSection?: string,
  requestedPage?: string,
  requestedBefore?: string,
): Promise<CustomerRecordsResult> {
  if (member.company_id !== companyId || !canAccess(member, "clientes"))
    throw new Error("No tienes acceso al expediente de este cliente.");
  const sections = customerRecordSections.filter(
    (s) =>
      canAccess(member, s.module) &&
      (s.id !== "comerciales" ||
        canAccess(member, "fin-estimados") ||
        canAccess(member, "fin-invoices")) &&
      (!["gastos", "permisos", "documentos"].includes(s.id) ||
        canAccess(member, "fin-proyectos")),
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
  if (section.id === "comerciales") {
    const result = await db.rpc("customer_commercial_documents", {
      p_company: companyId,
      p_customer: customerId,
      p_page: page,
    });
    const parsed = commercialDocumentList.safeParse(result.data);
    if (result.error || !parsed.success)
      throw new Error("No se pudieron cargar los PDF comerciales del cliente.");
    return {
      sections,
      section,
      page: parsed.data.page,
      count: parsed.data.count,
      rows: [],
      commercial: parsed.data,
    };
  }
  if (section.id === "permisos" || section.id === "documentos") {
    const result = await db.rpc("customer_permits", {
      p_company: companyId,
      p_customer: customerId,
      p_section: section.id,
      p_page: page,
    });
    const parsed = customerPermitsSchema.safeParse(result.data);
    if (
      result.error ||
      !parsed.success ||
      parsed.data.rows.some(
        (r) => r.kind !== (section.id === "permisos" ? "permit" : "document"),
      )
    )
      throw new Error(
        "No se pudieron cargar los permisos o documentos del cliente. Inténtalo de nuevo.",
      );
    return {
      sections,
      section,
      page: parsed.data.page,
      count: parsed.data.count,
      rows: [],
      permits: parsed.data,
    };
  }
  if (section.id === "historial") {
    const before = historyCursor(requestedBefore);
    const result = await db.rpc("customer_history", {
      p_company: companyId,
      p_customer: customerId,
      p_before: before,
    });
    const parsed = customerHistorySchema.safeParse(result.data);
    if (result.error || !parsed.success)
      throw new Error(
        "No se pudo cargar el historial del cliente. Inténtalo de nuevo.",
      );
    return {
      sections,
      section,
      page: 1,
      count: 0,
      rows: [],
      history: parsed.data,
      before,
    };
  }
  if (section.id === "pagos" || section.id === "gastos") {
    const result = await db.rpc("customer_ledger", {
      p_company: companyId,
      p_customer: customerId,
      p_section: section.id,
      p_page: page,
    });
    const parsed = customerLedgerSchema.safeParse(result.data);
    if (result.error || !parsed.success)
      throw new Error(
        "No se pudo cargar el movimiento financiero del cliente. Inténtalo de nuevo.",
      );
    return {
      sections,
      section,
      page: parsed.data.page,
      count: parsed.data.count,
      rows: [],
      ledger: parsed.data,
    };
  }
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
