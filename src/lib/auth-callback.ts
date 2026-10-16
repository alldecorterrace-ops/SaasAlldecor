import { authCallbackPath } from "./password-recovery";
import type { AuthFailure } from "./auth-feedback";

// Supported by the pinned Auth SDK. Each email flow keeps its own verifier;
// the URL carries only the flow ID, never the verifier.
export const emailFlowAuthOptions = {
  experimental: { appendPkceFlowIdToRedirects: true },
} as const;

const missingLink =
  "El enlace de acceso está incompleto. Abre el enlace original de tu correo.";
const unavailableLink =
  "No pudimos abrir la sesión con este enlace. Ábrelo en el navegador donde lo solicitaste. Si tu correo ya está confirmado, inicia sesión con tu contraseña.";
const expiredLink =
  "El enlace venció o ya se utilizó. Si confirmaste tu correo, inicia sesión; para recuperar la contraseña, solicita un nuevo enlace.";

function failurePath(message: string) {
  return `/login?${new URLSearchParams({ error: message })}`;
}

function callbackFailure(error?: AuthFailure | null) {
  if (error?.status === 429)
    return failurePath(
      "Hay demasiados intentos de acceso. Espera unos minutos antes de abrir el enlace otra vez.",
    );
  if (
    ["otp_expired", "flow_state_expired", "flow_state_not_found"].includes(
      error?.code ?? "",
    )
  )
    return failurePath(expiredLink);
  return failurePath(unavailableLink);
}

function callbackInput(params: URLSearchParams) {
  const code = params.get("code");
  const flowId = params.get("sb_flow_id");
  if (
    !code ||
    code.length > 2048 ||
    [...code].some(
      (char) =>
        /\s/.test(char) ||
        char.charCodeAt(0) < 32 ||
        char.charCodeAt(0) === 127,
    ) ||
    params.getAll("code").length !== 1 ||
    params.getAll("sb_flow_id").length > 1 ||
    (flowId !== null && !/^[a-zA-Z0-9_-]{8,64}$/.test(flowId))
  )
    return null;
  return { code, flowId };
}

type CallbackAuth = {
  exchangeCodeForSession(
    code: string,
    options?: { flowId: string },
  ): Promise<{
    data: { session: unknown; user: { id: string } | null };
    error: AuthFailure | null;
  }>;
};

export async function completeAuthCallback(
  getAuth: () => Promise<CallbackAuth>,
  params: URLSearchParams,
) {
  // Provider redirects can contain an explanation or credentials. Only
  // recognize a known error code; never copy that description to the login URL.
  if (params.has("error") || params.has("error_code"))
    return callbackFailure({ code: params.get("error_code") ?? undefined });
  const input = callbackInput(params);
  if (!input) return failurePath(missingLink);
  try {
    const auth = await getAuth();
    const { data, error } = await auth.exchangeCodeForSession(
      input.code,
      input.flowId ? { flowId: input.flowId } : undefined,
    );
    if (error || !data.session || !data.user?.id) return callbackFailure(error);
    return authCallbackPath(params.get("next"));
  } catch {
    return callbackFailure();
  }
}

// Keep legacy Site URL redirects working, including the flow ID and recovery
// destination. Only these named parameters can reach the callback.
export function forwardAuthCallback(
  search: Record<string, string | string[] | undefined>,
) {
  if (!search.code && !search.error && !search.error_code) return null;
  const params = new URLSearchParams();
  for (const key of ["code", "sb_flow_id", "error", "error_code"])
    if (typeof search[key] === "string") params.set(key, search[key]);
    else if (search[key] !== undefined) return failurePath(missingLink);
  if (search.next === "/actualizar-contrasena")
    params.set("next", "/actualizar-contrasena");
  if (
    !params.has("error") &&
    !params.has("error_code") &&
    !callbackInput(params)
  )
    return failurePath(missingLink);
  // Do not forward provider-supplied free text.
  if (params.has("error")) params.set("error", "access_unavailable");
  if (
    params.has("error_code") &&
    !["otp_expired", "flow_state_expired", "flow_state_not_found"].includes(
      params.get("error_code")!,
    )
  )
    params.set("error_code", "access_unavailable");
  return `/auth/callback?${params}`;
}
