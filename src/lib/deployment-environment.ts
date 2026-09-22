type Environment = Record<string, string | undefined>;
// Destination identity, not a credential. Prevent a staging configuration from
// pointing to the live project even if someone copies the production env file.
const productionProject = "loqbmrlkhskqzozknehx";
const productionOrigins = new Set([
  "https://app.alldecorpatio.com",
  "https://saas.alldecorterrace.com",
]);

export function externalEffectsAllowed(env: Environment) {
  return (
    env.APP_ENVIRONMENT === undefined || env.APP_ENVIRONMENT === "production"
  );
}

export function assertDeploymentEnvironment(env: Environment) {
  if (env.APP_ENVIRONMENT === undefined || env.APP_ENVIRONMENT === "production")
    return;
  if (env.APP_ENVIRONMENT !== "staging")
    throw new Error("Invalid deployment environment");
  const ref = env.STAGING_SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref) || ref === productionProject)
    throw new Error("Staging requires its own Supabase project");
  const db = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const site = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
  if (
    db.origin !== `https://${ref}.supabase.co` ||
    db.pathname !== "/" ||
    db.username ||
    db.password ||
    db.search ||
    db.hash
  )
    throw new Error("Staging project does not match configuration");
  if (
    productionOrigins.has(site.origin) ||
    site.username ||
    site.password ||
    !["http:", "https:"].includes(site.protocol)
  )
    throw new Error("Staging must use a separate application origin");
  if (env.INVITATION_MAIL_ENABLED === "true" || env.OPENAI_API_KEY)
    throw new Error("External email and AI must be disabled in staging");
}
