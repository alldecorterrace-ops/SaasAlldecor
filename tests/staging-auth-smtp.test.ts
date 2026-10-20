import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDeploymentEnvironment,
  authRecoveryAllowed,
  authRegistrationAllowed,
  externalEffectsAllowed,
} from "../src/lib/deployment-environment";
import { stagingAuthSmtpTest } from "../src/lib/staging-auth-smtp-test";
import { registrationConfirmationMessage } from "../src/lib/auth-feedback";
import { sendRecoveryRequest } from "../src/lib/password-recovery";

const fixture = () => ({
  APP_ENVIRONMENT: "staging",
  STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
  NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
  NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
  STAGING_AUTH_EMAIL_CAPTURE_VERIFIED: "false",
  STAGING_AUTH_SMTP_TEST_ENABLED: "true",
  STAGING_AUTH_SMTP_CONFIG_VERIFIED: "true",
  STAGING_AUTH_SMTP_TEST_EMAIL: "approved+registration@example.test",
  STAGING_AUTH_SMTP_TEST_EXPIRES_AT: new Date(
    Date.now() + 3600000,
  ).toISOString(),
});

test("SMTP rehearsal permits one addressed Auth flow and leaves general effects disabled", () => {
  const env = fixture();
  assert.doesNotThrow(() => assertDeploymentEnvironment(env));
  assert.equal(externalEffectsAllowed(env), false);
  assert.equal(
    authRegistrationAllowed(env, env.STAGING_AUTH_SMTP_TEST_EMAIL),
    true,
  );
  assert.equal(
    authRecoveryAllowed(env, env.STAGING_AUTH_SMTP_TEST_EMAIL),
    true,
  );
  for (const email of [
    "other@example.test",
    "approved@example.test",
    "owner@saasalldecor.invalid",
  ])
    for (const check of [authRegistrationAllowed, authRecoveryAllowed])
      assert.equal(check(env, email), false);
});

test("unverified, expired, overlong, mixed and live-backend scopes fail before requesting Auth mail", () => {
  const env = fixture();
  for (const patch of [
    { STAGING_AUTH_SMTP_CONFIG_VERIFIED: "false" },
    { STAGING_AUTH_SMTP_TEST_ENABLED: "false" },
    { STAGING_AUTH_EMAIL_CAPTURE_VERIFIED: "true" },
    { STAGING_INVITATION_TEST_ENABLED: "true" },
    { STAGING_AUTH_SMTP_TEST_EMAIL: "invalid" },
    { STAGING_AUTH_SMTP_TEST_EMAIL: "owner@saasalldecor.invalid" },
    {
      STAGING_AUTH_SMTP_TEST_EXPIRES_AT: new Date(Date.now() - 1).toISOString(),
    },
    {
      STAGING_AUTH_SMTP_TEST_EXPIRES_AT: new Date(
        Date.now() + 3 * 3600000,
      ).toISOString(),
    },
    { NEXT_PUBLIC_SUPABASE_URL: "https://loqbmrlkhskqzozknehx.supabase.co" },
    { NEXT_PUBLIC_SITE_URL: "https://app.alldecorpatio.com" },
    { INVITATION_MAIL_ENABLED: "true" },
  ])
    for (const check of [authRegistrationAllowed, authRecoveryAllowed])
      assert.equal(
        check({ ...env, ...patch }, env.STAGING_AUTH_SMTP_TEST_EMAIL),
        false,
        JSON.stringify(patch),
      );
  assert.equal(stagingAuthSmtpTest({}), null);
});

test("approved SMTP signup and recovery direct the user to their mailbox without claiming private capture", async () => {
  const env = fixture();
  let calls = 0;
  const result = await sendRecoveryRequest(
    {
      async resetPasswordForEmail(email, options) {
        calls++;
        assert.equal(email, env.STAGING_AUTH_SMTP_TEST_EMAIL);
        assert.equal(
          options.redirectTo,
          "https://staging.example.test/auth/callback?next=%2Factualizar-contrasena",
        );
        return { error: null };
      },
    },
    env.STAGING_AUTH_SMTP_TEST_EMAIL,
    env.NEXT_PUBLIC_SITE_URL,
    env,
  );
  assert.equal(calls, 1);
  assert.match(result.success ?? "", /recibirás un enlace/);
  assert.doesNotMatch(result.success ?? "", /privado|No se enviará/);
  assert.doesNotMatch(
    registrationConfirmationMessage(true, true),
    /privado|No se enviará/,
  );
  assert.match(registrationConfirmationMessage(true), /receptor privado/);
});
