import type { SupabaseClient } from "@supabase/supabase-js";
import { uuid } from "./validation";
import {
  loadTimeSummary,
  timeSummaryCsv,
  timeSummaryFiltersSchema,
} from "./time-summary";

export async function exportTimeSummary(
  company: string,
  filters: Record<string, unknown>,
  connect: () => Promise<SupabaseClient>,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (
    status: number,
    error = "No se pudo exportar el resumen de días.",
  ) => Response.json({ error }, { status, headers });
  if (!uuid.safeParse(company).success) return fail(404);
  try {
    const db = await connect();
    const auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return fail(401);
    const parsed = timeSummaryFiltersSchema.safeParse(filters);
    if (!parsed.success) return fail(400, "Revisa las fechas y los filtros.");
    const report = await loadTimeSummary(db, company, parsed.data);
    return new Response(timeSummaryCsv(report), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="resumen-dias.csv"',
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return fail(
      code === "42501" ? 403 : code === "22023" ? 400 : 503,
      code === "22023"
        ? "Revisa el intervalo: el máximo es de 62 días transcurridos."
        : undefined,
    );
  }
}
