import { uuid } from "@/lib/validation";
import { operationContext, operationResponse } from "@/lib/operation-api";
import {
  operationError,
  readOperationInput,
  sameOriginRequest,
} from "@/lib/operation-queue";

export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  if (!sameOriginRequest(request, process.env.NEXT_PUBLIC_SITE_URL))
    return operationResponse({ error: "Origen no autorizado." }, 403);
  const { companyId } = await params;
  if (!uuid.safeParse(companyId).success)
    return operationResponse({ error: "Solicitud inválida." }, 400);
  const context = await operationContext();
  if (!context.db) return context.response;
  let input;
  try {
    input = await readOperationInput(request);
  } catch {
    return operationResponse({ error: "Solicitud inválida." }, 400);
  }
  const { data, error } = await context.db.rpc("enqueue_operation", {
    p_company: companyId,
    p_request: input.id,
    p_action: input.action,
    p_payload: input.payload,
  });
  if (error) {
    const safe = operationError(error.code);
    return operationResponse({ error: safe.message }, safe.status);
  }
  return operationResponse(
    data,
    ["succeeded", "rejected"].includes(data?.status) ? 200 : 202,
  );
}
