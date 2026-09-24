import { z } from "zod";
import { isRecordConflict } from "./database-errors";

export const operationInput = z
  .object({
    id: z.uuid(),
    action: z.string().regex(/^[a-z][a-z0-9_.]{2,79}$/),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const operationLabels: Record<string, string> = {
  queued: "Procesando",
  processing: "Procesando",
  succeeded: "Completado",
  rejected: "No se pudo completar",
  review: "Resultado en revisión",
};

export function sameOriginRequest(
  request: Request,
  siteUrl: string | undefined,
) {
  if (!siteUrl) return false;
  try {
    const site = new URL(siteUrl);
    return (
      ["http:", "https:"].includes(site.protocol) &&
      !site.username &&
      !site.password &&
      request.headers.get("origin") === site.origin
    );
  } catch {
    return false;
  }
}

// Read with an actual byte limit; Content-Length is attacker-controlled.
export async function readOperationInput(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new Error("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new Error("invalid_request");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return operationInput.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } finally {
    reader.releaseLock();
  }
}

export function operationError(code: string | undefined) {
  if (code === "42501")
    return { status: 403, message: "Acceso no autorizado." };
  if (code === "23505" || isRecordConflict(code))
    return {
      status: 409,
      message: "Ese identificador ya corresponde a otra solicitud.",
    };
  if (code === "22023") return { status: 400, message: "Solicitud inválida." };
  if (code === "54000")
    return {
      status: 429,
      message:
        "Hay demasiadas solicitudes pendientes. Conserva el mismo identificador al reintentar.",
    };
  return {
    status: 503,
    message: "La recepción de solicitudes no está disponible.",
  };
}
