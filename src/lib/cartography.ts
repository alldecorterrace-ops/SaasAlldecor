import {
  assertDeploymentEnvironment,
  externalEffectsAllowed,
} from "./deployment-environment";

type Environment = Record<string, string | undefined>;
export type CartographyProvider = "disabled" | "openstreetmap" | "unavailable";
export type CartographyConfig = {
  provider: CartographyProvider;
  testBank: boolean;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Tile URLs contain only public z/x/y coordinates, never company or customer data.
export function cartographyTileUrl(provider: CartographyProvider) {
  if (provider === "openstreetmap")
    return "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  if (provider === "unavailable")
    return "/cartography-test-unavailable/{z}/{x}/{y}.png";
  return null;
}

export function cartographyConfig(
  env: Environment,
  companyId: string,
  testMode?: string,
): CartographyConfig {
  // Preserve the existing production behavior; a query cannot select a test layer.
  if (externalEffectsAllowed(env))
    return { provider: "openstreetmap", testBank: false };
  if (
    env.APP_ENVIRONMENT !== "staging" ||
    env.STAGING_CARTOGRAPHY_TEST_ENABLED !== "true" ||
    env.STAGING_CARTOGRAPHY_OSM_REVIEWED !== "true" ||
    !uuid.test(companyId) ||
    !uuid.test(env.STAGING_CARTOGRAPHY_TEST_COMPANY ?? "") ||
    companyId.toLowerCase() !==
      env.STAGING_CARTOGRAPHY_TEST_COMPANY?.toLowerCase()
  )
    return { provider: "disabled", testBank: false };
  try {
    assertDeploymentEnvironment(env);
  } catch {
    return { provider: "disabled", testBank: false };
  }
  return {
    provider: testMode === "unavailable" ? "unavailable" : "openstreetmap",
    testBank: true,
  };
}
