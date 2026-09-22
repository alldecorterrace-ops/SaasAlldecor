import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDeploymentEnvironment,
  externalEffectsAllowed,
} from "../src/lib/deployment-environment";
import { invitationMailConfig } from "../src/lib/invitation-mail";

test("staging rejects a live backend, live domain and enabled external delivery", () => {
  const safe = {
    APP_ENVIRONMENT: "staging",
    STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
    NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
    NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
    INVITATION_MAIL_ENABLED: "false",
  };
  assert.doesNotThrow(() => assertDeploymentEnvironment(safe));
  for (const patch of [
    { APP_ENVIRONMENT: "stagign" },
    { STAGING_SUPABASE_PROJECT_REF: "loqbmrlkhskqzozknehx" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://loqbmrlkhskqzozknehx.supabase.co" },
    { NEXT_PUBLIC_SITE_URL: "https://app.alldecorpatio.com" },
    { INVITATION_MAIL_ENABLED: "true" },
    { OPENAI_API_KEY: "synthetic-key" },
    { STAGING_SUPABASE_PROJECT_REF: "" },
  ])
    assert.throws(() => assertDeploymentEnvironment({ ...safe, ...patch }));
  assert.equal(externalEffectsAllowed(safe), false);
  assert.equal(externalEffectsAllowed({ APP_ENVIRONMENT: "stagign" }), false);
  assert.equal(
    invitationMailConfig({ ...safe, INVITATION_MAIL_ENABLED: "true" }),
    null,
  );
  assert.doesNotThrow(() => assertDeploymentEnvironment({}));
  assert.equal(externalEffectsAllowed({ APP_ENVIRONMENT: "production" }), true);
});
