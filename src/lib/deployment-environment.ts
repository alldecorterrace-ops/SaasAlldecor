type Environment = Record<string, string | undefined>;
import {
  configuredStagingInvitationTest,
  stagingInvitationTest,
} from "./staging-invitation-test";
import {
  configuredStagingAuthSmtpTest,
  stagingAuthSmtpTest,
} from "./staging-auth-smtp-test";
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

// This flag records an operator-verified Supabase Send Email hook. It does not
// configure that hook; the private capture must already be installed and tested.
export function authRecoveryAllowed(env: Environment, email: string) {
  if (externalEffectsAllowed(env)) return true;
  if (env.STAGING_AUTH_SMTP_TEST_ENABLED === "true") {
    if (stagingAuthSmtpTest(env)?.email !== email.toLowerCase()) return false;
    try {
      assertDeploymentEnvironment(env);
      return true;
    } catch {
      return false;
    }
  }
  if (
    env.APP_ENVIRONMENT !== "staging" ||
    env.STAGING_AUTH_EMAIL_CAPTURE_VERIFIED !== "true" ||
    !/^[a-z0-9][a-z0-9._+-]{0,63}@saasalldecor[.]invalid$/.test(
      email.toLowerCase(),
    )
  )
    return false;
  try {
    assertDeploymentEnvironment(env);
    return true;
  } catch {
    return false;
  }
}

export function authRegistrationAllowed(env: Environment, email: string) {
  if (authRecoveryAllowed(env, email)) return true;
  if (
    env.APP_ENVIRONMENT !== "staging" ||
    env.STAGING_AUTH_EMAIL_CAPTURE_VERIFIED !== "true" ||
    stagingInvitationTest(env)?.email !== email.toLowerCase()
  )
    return false;
  try {
    assertDeploymentEnvironment(env);
    return true;
  } catch {
    return false;
  }
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
  if (
    env.INVITATION_MAIL_ENABLED === "true" ||
    env.INVOICE_MAIL_ENABLED === "true" ||
    env.ESTIMATE_MAIL_ENABLED === "true" ||
    env.WEB_NOTICE_MAIL_ENABLED === "true" ||
    env.WEB_NOTICE_SUPABASE_SERVICE_KEY ||
    env.OPENAI_API_KEY
  )
    throw new Error("External email and AI must be disabled in staging");
  if (
    env.STAGING_INVITATION_TEST_ENABLED === "true" &&
    (!configuredStagingInvitationTest(env)?.success ||
      env.STAGING_AUTH_EMAIL_CAPTURE_VERIFIED !== "true" ||
      site.protocol !== "https:")
  )
    throw new Error(
      "Staging invitation test requires a complete private scope and verified Auth capture",
    );
  if (
    env.STAGING_AUTH_SMTP_TEST_ENABLED === "true" &&
    (!configuredStagingAuthSmtpTest(env)?.success ||
      env.STAGING_AUTH_SMTP_CONFIG_VERIFIED !== "true" ||
      env.STAGING_AUTH_EMAIL_CAPTURE_VERIFIED === "true" ||
      env.STAGING_INVITATION_TEST_ENABLED === "true" ||
      site.protocol !== "https:")
  )
    throw new Error(
      "Staging SMTP rehearsal requires a single private scope and exclusive verified transport",
    );
}
