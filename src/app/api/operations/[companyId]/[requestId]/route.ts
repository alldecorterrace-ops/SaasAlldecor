import { uuid } from "@/lib/validation";
import { operationContext, operationResponse } from "@/lib/operation-api";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; requestId: string }> },
) {
  const { companyId, requestId } = await params;
  if (!uuid.safeParse(companyId).success || !uuid.safeParse(requestId).success)
    return operationResponse({ error: "Solicitud no encontrada." }, 404);
  const context = await operationContext();
  if (!context.db) return context.response;
  const { data, error } = await context.db.rpc("get_operation_status", {
    p_company: companyId,
    p_request: requestId,
  });
  if (error)
    return operationResponse(
      { error: "No se pudo consultar la solicitud." },
      503,
    );
  if (!data)
    return operationResponse({ error: "Solicitud no encontrada." }, 404);
  return operationResponse(data);
}
