import { z } from "zod";

type Environment = Record<string, string | undefined>;
const scope = z.object({
  email: z
    .email()
    .max(254)
    .refine((v) => v === v.trim().toLowerCase() && !v.endsWith(".invalid")),
  expiresAt: z.iso.datetime({ offset: true }),
});

// Operator-verified SMTP rehearsal only. This does not configure Supabase,
// disable its signup hook, or enable business mail. Never store SMTP credentials.
export function configuredStagingAuthSmtpTest(env: Environment) {
  if (
    env.APP_ENVIRONMENT !== "staging" ||
    env.STAGING_AUTH_SMTP_TEST_ENABLED !== "true"
  )
    return null;
  return scope.safeParse({
    email: env.STAGING_AUTH_SMTP_TEST_EMAIL,
    expiresAt: env.STAGING_AUTH_SMTP_TEST_EXPIRES_AT,
  });
}

export function stagingAuthSmtpTest(env: Environment, now = Date.now()) {
  const parsed = configuredStagingAuthSmtpTest(env);
  if (
    !parsed?.success ||
    env.STAGING_AUTH_SMTP_CONFIG_VERIFIED !== "true" ||
    env.STAGING_AUTH_EMAIL_CAPTURE_VERIFIED === "true"
  )
    return null;
  const until = Date.parse(parsed.data.expiresAt);
  return until > now && until <= now + 2 * 3600000 ? parsed.data : null;
}
