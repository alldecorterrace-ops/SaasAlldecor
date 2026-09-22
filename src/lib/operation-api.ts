import "server-only";
import { createClient } from "./supabase/server";

export function operationResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function operationContext() {
  try {
    const db = await createClient();
    const { data, error } = await db.auth.getUser();
    if (error || !data.user)
      return {
        response: operationResponse(
          { error: "Inicia sesión para continuar." },
          401,
        ),
      };
    if (process.env.OPERATION_QUEUE_ENABLED !== "true")
      return {
        response: operationResponse(
          { error: "La recepción de solicitudes no está habilitada." },
          503,
        ),
      };
    return { db };
  } catch {
    return {
      response: operationResponse({ error: "Servicio no disponible." }, 503),
    };
  }
}
