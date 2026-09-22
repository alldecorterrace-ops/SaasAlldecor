import { uuid } from "@/lib/validation";
import { operationContext, operationResponse } from "@/lib/operation-api";
import { operationError, sameOriginRequest } from "@/lib/operation-queue";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { companyId } = await params;
  if (!uuid.safeParse(companyId).success)
    return operationResponse({ error: "Empresa no encontrada." }, 404);
  const context = await operationContext();
  if (!context.db) return context.response;
  const { data, error } = await context.db.rpc("get_transition_status", {
    p_company: companyId,
  });
  if (error) {
    const safe = operationError(error.code);
    return operationResponse({ error: safe.message }, safe.status);
  }
  return operationResponse(data);
}
// A manager can stop claims. There is deliberately no public enable/switch API
// before complete writer coverage and an isolated rehearsal are established.
export async function POST(request: Request, { params }: Context) {
  if (!sameOriginRequest(request, process.env.NEXT_PUBLIC_SITE_URL))
    return operationResponse({ error: "Origen no autorizado." }, 403);
  const { companyId } = await params;
  if (!uuid.safeParse(companyId).success)
    return operationResponse({ error: "Empresa no encontrada." }, 404);
  const context = await operationContext();
  if (!context.db) return context.response;
  const { data, error } = await context.db.rpc("pause_operation_queue", {
    p_company: companyId,
  });
  if (error) {
    const safe = operationError(error.code);
    return operationResponse({ error: safe.message }, safe.status);
  }
  return operationResponse(data);
}
