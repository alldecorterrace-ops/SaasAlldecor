import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCostRegister } from "./cost-register";
import { expenseFiltersSchema, expenseCsv } from "./expense-register";
import { uuid } from "./validation";
export async function exportCostRegister(
  company: string,
  filters: Record<string, unknown>,
  connect: () => Promise<SupabaseClient>,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status: number, message = "Exportación no disponible.") =>
    Response.json({ error: message }, { status, headers });
  if (!uuid.safeParse(company).success) return fail(404);
  try {
    const db = await connect(),
      auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return fail(401);
    const f = expenseFiltersSchema.safeParse(filters);
    if (!f.success)
      return fail(400, "Revisa los filtros y el intervalo de fechas.");
    const data = await loadCostRegister(db, company, f.data, 1, true);
    return new Response(expenseCsv(data), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="costos-saas.csv"',
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return fail(
      code === "42501"
        ? 403
        : code === "22023"
          ? 400
          : code === "54000"
            ? 422
            : 503,
      code === "54000"
        ? "Hay más de 5.000 registros. Reduce el intervalo o añade filtros para exportar."
        : undefined,
    );
  }
}
