import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  expenseRegisterSchema,
  expenseFiltersSchema,
  type ExpenseFilters,
  type ExpenseRegisterResult,
} from "./expense-register";
import {
  laborContextSchema,
  laborReport,
  laborIssueLabels,
} from "./labor-report";
export const costContextSchema = z.object({
  ledger: expenseRegisterSchema,
  labor: laborContextSchema.nullable(),
  projects: z.record(
    z.uuid(),
    z.object({
      customer_id: z.uuid().nullable(),
      customer_name: z.string().nullable(),
    }),
  ),
});
export type CostContext = z.infer<typeof costContextSchema>;
const cents = (s: string) => {
  const n = Number(s.replace(".", ""));
  if (!Number.isSafeInteger(n)) throw new Error("Inexact cost");
  return n;
};
const money = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Inexact cost");
  return (
    (BigInt(n) / 100n).toString() +
    "." +
    (BigInt(n) % 100n).toString().padStart(2, "0")
  );
};
function projectedId(company: string, source: string) {
  const h = createHash("sha256")
    .update(company + ":" + source)
    .digest("hex");
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-8" +
    h.slice(13, 16) +
    "-a" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32)
  );
}
// Reconcile the entire company BEFORE narrowing a view. An unresolved historical
// cost can block supplements across projects; filtering must not erase that gate.
export function projectCostRegister(
  raw: CostContext,
  filters: ExpenseFilters,
  page = 1,
  exportAll = false,
): ExpenseRegisterResult {
  const base = raw.ledger;
  if (base.rows.length !== base.count)
    throw new Error("Incomplete original cost snapshot");
  const report = raw.labor ? laborReport(raw.labor) : null;
  const allDerived: ExpenseRegisterResult["rows"] = report
    ? report.supplements.map((c) => {
        const parent = raw.projects[c.projectId];
        if (!parent || !c.date) throw new Error("Unresolved Labor relation");
        return {
          id: projectedId(report.company, c.id),
          source: "LABOR",
          date: c.date,
          vendor: "",
          document_number: "",
          category: "Labor",
          description:
            c.kind === "ADJUSTMENT"
              ? "Ajuste guardado · Cuadrilla incluida"
              : "Jornada revisada · Tarifa diaria vigente",
          amount: money(c.amountCents),
          payer: null,
          worker_id: c.workerId,
          worker_name: report.names.workers[c.workerId] ?? null,
          status: "CALCULADO",
          method: "COSTO_CALCULADO",
          reimbursement_status: "NO_APLICA",
          project_id: c.projectId,
          project_name: report.names.projects[c.projectId] ?? null,
          customer_id: parent.customer_id,
          customer_name: parent.customer_name,
          has_receipt: false,
        };
      })
    : [];
  const derived = allDerived.filter(
    (c) =>
      (!filters.source || filters.source === "LABOR") &&
      ["ACTIVOS", "TODOS", "CALCULADO"].includes(filters.status) &&
      (!filters.from || c.date >= filters.from) &&
      (!filters.to || c.date <= filters.to) &&
      (!filters.worker || c.worker_id === filters.worker) &&
      (!filters.project || c.project_id === filters.project) &&
      (!filters.customer || c.customer_id === filters.customer) &&
      (!filters.category || c.category === filters.category) &&
      (!filters.payer || filters.payer === "SIN_REGISTRAR") &&
      (!filters.q ||
        [
          c.date,
          c.category,
          c.vendor,
          c.description,
          c.document_number,
          c.worker_name ?? "",
          c.customer_name ?? "",
          c.project_name ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(filters.q.toLowerCase())),
  );
  const sum = (rows: typeof derived) =>
    rows.reduce((s, c) => s + cents(c.amount), 0);
  const rows = [...base.rows, ...derived].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.source.localeCompare(b.source) ||
      a.id.localeCompare(b.id),
  );
  const pending = report?.pending
    .filter(
      (i) =>
        (!filters.project || !i.projectId || i.projectId === filters.project) &&
        (!filters.worker || !i.workerId || i.workerId === filters.worker) &&
        (!filters.customer ||
          !i.projectId ||
          raw.projects[i.projectId]?.customer_id === filters.customer) &&
        (!filters.from || !i.date || i.date >= filters.from) &&
        (!filters.to || !i.date || i.date <= filters.to),
    )
    .map((i) => ({
      reason: laborIssueLabels[i.reason] ?? "Labor pendiente de conciliación.",
      date: i.date,
      worker_name: i.workerId ? report.names.workers[i.workerId] : undefined,
      project_name: i.projectId
        ? report.names.projects[i.projectId]
        : undefined,
    }));
  if (exportAll && rows.length > 5000)
    throw Object.assign(new Error("Cost export limit"), { code: "54000" });
  const current = exportAll
    ? 1
    : Math.min(Math.max(1, page), Math.max(1, Math.ceil(rows.length / 20)));
  const overview = base.overview
    ? {
        ...base.overview,
        active: money(cents(base.overview.active) + sum(allDerived)),
        monthly: money(
          cents(base.overview.monthly) +
            sum(
              allDerived.filter((c) => c.date.startsWith(base.overview!.month)),
            ),
        ),
      }
    : undefined;
  return expenseRegisterSchema.parse({
    ...base,
    overview,
    count: rows.length,
    page: current,
    total: money(cents(base.total) + sum(derived)),
    active: money(cents(base.active) + sum(derived)),
    rows: exportAll ? rows : rows.slice((current - 1) * 20, current * 20),
    labor_pending: pending,
    labor_complete: report?.complete,
  });
}
export async function loadCostRegister(
  db: Pick<SupabaseClient, "rpc">,
  company: string,
  filters: ExpenseFilters,
  page = 1,
  exportAll = false,
) {
  const parsed = expenseFiltersSchema.parse(filters);
  const { data, error } = await db.rpc("cost_register_context", {
    p_company: company,
    p_filters: parsed,
  });
  if (error) throw error;
  const context = costContextSchema.parse(data);
  if (context.labor && context.labor.company !== company)
    throw new Error("Cost company mismatch");
  return projectCostRegister(context, parsed, page, exportAll);
}
