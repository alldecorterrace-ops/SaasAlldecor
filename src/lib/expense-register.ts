import { z } from "zod";
import { uuid } from "./validation";
export const registerStates = {
  ACTIVOS: "Activos",
  TODOS: "Todos",
  PENDIENTE: "Pendientes",
  APROBADO: "Aprobados",
  RECHAZADO: "Rechazados",
  ANULADO: "Anulados",
} as const;
const dateFilter = z.union([z.literal(""), z.iso.date()]).default("");
const idFilter = z.union([z.literal(""), uuid]).default("");
export const expenseFiltersSchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    status: z
      .enum(
        Object.keys(registerStates) as [
          keyof typeof registerStates,
          ...Array<keyof typeof registerStates>,
        ],
      )
      .default("ACTIVOS"),
    from: dateFilter,
    to: dateFilter,
    category: z.string().trim().max(64).default(""),
    payer: z
      .enum(["", "EMPRESA", "EFECTIVO_EMPRESA", "TRABAJADOR", "SIN_REGISTRAR"])
      .default(""),
    project: idFilter,
    customer: idFilter,
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: "La fecha inicial debe ser anterior o igual a la final.",
  });
export type ExpenseFilters = z.infer<typeof expenseFiltersSchema>;
const money = z.string().regex(/^\d+\.\d{2}$/);
export const expenseRegisterSchema = z.object({
  overview: z
    .object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      monthly: money,
      active: money,
      reimbursements: money,
    })
    .optional(),
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  total: money,
  active: money,
  reimbursements: money,
  rows: z
    .array(
      z.object({
        id: uuid,
        date: z.iso.date(),
        vendor: z.string(),
        document_number: z.string(),
        category: z.string(),
        description: z.string(),
        amount: money,
        payer: z
          .enum(["EMPRESA", "EFECTIVO_EMPRESA", "TRABAJADOR"])
          .nullable()
          .optional(),
        worker_id: uuid.nullable().optional(),
        worker_name: z.string().nullable().optional(),
        status: z.enum(["PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO"]),
        method: z.string(),
        reimbursement_status: z.string(),
        project_id: uuid.nullable(),
        project_name: z.string().nullable(),
        customer_id: uuid.nullable(),
        customer_name: z.string().nullable(),
        has_receipt: z.boolean(),
      }),
    )
    .max(5000),
});
export type ExpenseRegisterResult = z.infer<typeof expenseRegisterSchema>;
export function expenseCsv(data: ExpenseRegisterResult) {
  if (data.rows.length !== data.count) throw new Error("Incomplete export");
  const cell = (value: string) =>
    '"' +
    (/^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value).replaceAll(
      '"',
      '""',
    ) +
    '"';
  const rows = [
    [
      "ID",
      "Fecha",
      "Cliente",
      "Proyecto",
      "Proveedor",
      "Documento",
      "Categoría",
      "Descripción",
      "Importe USD",
      "Estado",
      "Método",
      "Reembolso",
      "Pagado por",
      "Trabajador",
      "Comprobante",
    ],
    ...data.rows.map((r) => [
      r.id,
      r.date,
      r.customer_name ?? "",
      r.project_name ?? "",
      r.vendor,
      r.document_number,
      r.category,
      r.description,
      r.amount,
      r.status,
      r.method,
      r.reimbursement_status,
      r.payer ?? "Sin registrar",
      r.worker_name ?? "",
      r.has_receipt ? "Sí" : "No",
    ]),
  ];
  return (
    "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
export type ExpenseExportClient = {
  auth: {
    getUser(): Promise<{ data: { user: unknown | null }; error: unknown }>;
  };
  rpc(
    name: "expense_register",
    args: {
      p_company: string;
      p_filters: ExpenseFilters;
      p_page: number;
      p_export: boolean;
    },
  ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};
export async function exportExpenses(
  companyId: string,
  filters: Record<string, unknown>,
  connect: () => Promise<ExpenseExportClient>,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status: number, error = "Exportación no disponible.") =>
    Response.json({ error }, { status, headers });
  if (!uuid.safeParse(companyId).success) return fail(404);
  try {
    const db = await connect();
    const auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return fail(401);
    const parsed = expenseFiltersSchema.safeParse(filters);
    if (!parsed.success)
      return fail(400, "Revisa los filtros y el intervalo de fechas.");
    const { data, error } = await db.rpc("expense_register", {
      p_company: companyId,
      p_filters: parsed.data,
      p_page: 1,
      p_export: true,
    });
    if (error)
      return error.code === "54000"
        ? fail(
            422,
            "Hay más de 5.000 gastos. Reduce el intervalo o añade filtros para exportar.",
          )
        : fail(
            error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503,
          );
    return new Response(expenseCsv(expenseRegisterSchema.parse(data)), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="gastos-saas.csv"',
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return fail(503);
  }
}
