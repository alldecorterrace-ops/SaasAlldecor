export type IngressConfig = {
  enabled: boolean;
  projectRef: string;
  publicKey: string;
  siteOrigin: string;
  environment: "staging" | "production";
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set([
  "queued",
  "processing",
  "succeeded",
  "rejected",
  "review",
]);

async function boundedJson(request: Request | Response) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 32768) throw new Error("invalid_body");
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
function validConfiguration(config: IngressConfig) {
  try {
    const origin = new URL(config.siteOrigin);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== config.siteOrigin ||
      !/^[a-z]{20}$/.test(config.projectRef) ||
      !config.publicKey
    )
      return false;
    if (
      config.environment === "staging" &&
      (config.projectRef === "loqbmrlkhskqzozknehx" ||
        ["app.alldecorpatio.com", "saas.alldecorterrace.com"].includes(
          origin.hostname,
        ))
    )
      return false;
    if (config.publicKey.startsWith("sb_publishable_")) return true;
    // Legacy public keys must be anon, never a service-role key.
    const part = config.publicKey.split(".")[1];
    return (
      JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))).role ===
      "anon"
    );
  } catch {
    return false;
  }
}

/** Independent of Next.js. No service-role credential, executor or transition API.
 * GoTrue verifies identity; PostgREST runs with the same user JWT and SQL permissions. */
export function createOperationIngress(
  config: IngressConfig,
  request: typeof fetch = fetch,
) {
  return async (incoming: Request) => {
    const origin = incoming.headers.get("origin"),
      allowed = origin === config.siteOrigin;
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Robots-Tag": "noindex, nofollow",
    };
    if (allowed) {
      headers["Access-Control-Allow-Origin"] = config.siteOrigin;
      headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
      headers["Access-Control-Allow-Headers"] =
        "authorization, apikey, content-type, x-client-info";
    }
    const respond = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
    if (!validConfiguration(config) || !config.enabled)
      return respond(
        { error: "La recepción de solicitudes no está disponible." },
        503,
      );
    if (!allowed) return respond({ error: "Origen no autorizado." }, 403);
    if (incoming.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (!["POST", "GET"].includes(incoming.method))
      return respond({ error: "Método no permitido." }, 405);
    const url = new URL(incoming.url);
    const match = url.pathname.match(
      /^\/(?:functions\/v1\/)?operation-ingress\/companies\/([^/]+)\/requests(?:\/([^/]+))?$/,
    );
    if (
      !match ||
      url.search ||
      !uuid.test(match[1]) ||
      (incoming.method === "GET"
        ? !match[2] || !uuid.test(match[2])
        : !!match[2])
    )
      return respond({ error: "Solicitud no encontrada." }, 404);
    const authorization = incoming.headers.get("authorization");
    if (
      !authorization ||
      authorization.length > 8192 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
        authorization,
      )
    )
      return respond({ error: "Inicia sesión de nuevo." }, 401);
    const upstreamHeaders = {
      apikey: config.publicKey,
      Authorization: authorization,
      "Content-Type": "application/json",
    };
    const upstream = `https://${config.projectRef}.supabase.co`;
    try {
      const auth = await request(`${upstream}/auth/v1/user`, {
        headers: upstreamHeaders,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!auth.ok) return respond({ error: "Inicia sesión de nuevo." }, 401);
      const user = await boundedJson(auth);
      if (!uuid.test(user?.id ?? "") || !user.email_confirmed_at)
        return respond({ error: "Inicia sesión de nuevo." }, 401);
      let rpc: string, args: Record<string, unknown>;
      if (incoming.method === "POST") {
        if (
          incoming.headers.get("content-type")?.split(";")[0].trim() !==
          "application/json"
        )
          return respond({ error: "Solicitud inválida." }, 400);
        let input;
        try {
          input = await boundedJson(incoming);
        } catch {
          return respond({ error: "Solicitud inválida." }, 400);
        }
        if (
          !input ||
          Array.isArray(input) ||
          Object.keys(input).sort().join(",") !== "action,id,payload" ||
          !uuid.test(input.id ?? "") ||
          typeof input.action !== "string" ||
          !/^[a-z][a-z0-9_.]{2,79}$/.test(input.action) ||
          !input.payload ||
          typeof input.payload !== "object" ||
          Array.isArray(input.payload)
        )
          return respond({ error: "Solicitud inválida." }, 400);
        rpc = "enqueue_operation";
        args = {
          p_company: match[1],
          p_request: input.id,
          p_action: input.action,
          p_payload: input.payload,
        };
      } else {
        rpc = "get_operation_status";
        args = { p_company: match[1], p_request: match[2] };
      }
      const result = await request(`${upstream}/rest/v1/rpc/${rpc}`, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(args),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      const data = await boundedJson(result);
      if (!result.ok) {
        const code = data?.code;
        const status =
          code === "42501"
            ? 403
            : code === "23505" || code === "40001"
              ? 409
              : code === "22023"
                ? 400
                : code === "54000"
                  ? 429
                  : 503;
        return respond(
          {
            error:
              "No se pudo completar la solicitud. Conserva el mismo identificador al reintentar.",
          },
          status,
        );
      }
      if (!data) return respond({ error: "Solicitud no encontrada." }, 404);
      if (data.id !== args.p_request || !statuses.has(data.status))
        throw new Error("invalid_receipt");
      // Do not accidentally expose a future private payload/token added to an RPC.
      const safe: Record<string, unknown> = {
        id: data.id,
        status: data.status,
      };
      for (const field of [
        "replayed",
        "createdAt",
        "completedAt",
        "resultReference",
        "resultCode",
      ])
        if (field in data) safe[field] = data[field];
      return respond(
        safe,
        incoming.method === "POST" &&
          !["succeeded", "rejected"].includes(data.status)
          ? 202
          : 200,
      );
    } catch {
      return respond(
        {
          error:
            "No se pudo confirmar la solicitud. Consulta su estado y conserva el mismo identificador.",
        },
        503,
      );
    }
  };
}
