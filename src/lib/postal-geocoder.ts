import { hostname } from "node:os";
import { isAbsolute } from "node:path";
import {
  assertDeploymentEnvironment,
  externalEffectsAllowed,
} from "./deployment-environment";

export type PostalPoint = { lat: number; lng: number };
export type PostalLookup =
  | { status: "found"; point: PostalPoint }
  | { status: "missing" }
  | { status: "busy"; retryAfterMs: number }
  | { status: "unavailable" };
export type GeocoderConfig =
  | { provider: "disabled" }
  | { provider: "synthetic" }
  | {
      provider: "nominatim";
      endpoint: string;
      userAgent: string;
      directory: string;
    };

// Deliberate operator opt-in; this service must have one egress host and a
// persistent directory shared by every web process/release on that host.
export function geocoderConfig(
  env: Record<string, string | undefined>,
  host = hostname(),
): GeocoderConfig {
  if (env.ZONE_GEOCODER_PROVIDER === "synthetic") {
    try {
      assertDeploymentEnvironment(env);
      if (env.APP_ENVIRONMENT === "staging") return { provider: "synthetic" };
    } catch {
      /* Fail closed on a copied or incomplete staging configuration. */
    }
    return { provider: "disabled" };
  }
  if (
    env.APP_ENVIRONMENT !== "production" ||
    !externalEffectsAllowed(env) ||
    env.ZONE_GEOCODER_PROVIDER !== "nominatim" ||
    env.ZONE_GEOCODER_SINGLE_HOST !== host ||
    env.ZONE_GEOCODER_POLICY_REVIEWED !== "true" ||
    !env.ZONE_GEOCODER_DIRECTORY ||
    !isAbsolute(env.ZONE_GEOCODER_DIRECTORY)
  )
    return { provider: "disabled" };
  try {
    const url = new URL(env.ZONE_GEOCODER_ENDPOINT ?? "");
    const contact = new URL(env.ZONE_GEOCODER_CONTACT_URL ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      contact.protocol !== "https:" ||
      contact.username ||
      contact.password ||
      contact.hash ||
      contact.search
    )
      return { provider: "disabled" };
    return {
      provider: "nominatim",
      endpoint: url.href,
      userAgent: `SaasAlldecor/1.0 (+${contact.href})`,
      directory: env.ZONE_GEOCODER_DIRECTORY,
    };
  } catch {
    return { provider: "disabled" };
  }
}

export interface PostalLookupStore {
  // Atomically return cached data or reserve the ONLY application-wide request.
  reserve(zip: string): { token: string } | { result: PostalLookup };
  finish(zip: string, token: string, result: PostalLookup): boolean;
}

export function parsePostalResponse(value: unknown): PostalLookup {
  if (!Array.isArray(value)) return { status: "unavailable" };
  if (!value.length) return { status: "missing" };
  const first = value[0];
  if (
    !first ||
    typeof first !== "object" ||
    !["string", "number"].includes(typeof first.lat) ||
    !["string", "number"].includes(typeof first.lon)
  )
    return { status: "unavailable" };
  const lat = Number(first.lat),
    lng = Number(first.lon);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat === 0 ||
    lng === 0 ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return { status: "unavailable" };
  return { status: "found", point: { lat, lng } };
}

export async function lookupPostalCode(
  zip: string,
  config: GeocoderConfig,
  store: PostalLookupStore | undefined,
  request: typeof fetch = fetch,
): Promise<PostalLookup> {
  if (!/^\d{5}$/.test(zip) || config.provider === "disabled")
    return { status: "unavailable" };
  if (config.provider === "synthetic") {
    // Explicit fixtures, never a simulated success for arbitrary/customer ZIPs.
    return zip === "33198"
      ? { status: "found", point: { lat: 25.81, lng: -80.31 } }
      : zip === "33199"
        ? { status: "missing" }
        : { status: "unavailable" };
  }
  if (!store) return { status: "unavailable" };
  const reservation = store.reserve(zip);
  if ("result" in reservation) return reservation.result;
  let result: PostalLookup = { status: "unavailable" };
  try {
    const url = new URL(config.endpoint);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("postalcode", zip);
    const response = await request(url, {
      headers: { Accept: "application/json", "User-Agent": config.userAgent },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      cache: "no-store",
    });
    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 65_536) throw new Error("oversized response");
          chunks.push(value);
        }
        result = parsePostalResponse(
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    }
  } catch {
    /* Never return provider errors, URLs or raw response data to users. */
  }
  return store.finish(zip, reservation.token, result)
    ? result
    : { status: "unavailable" };
}
