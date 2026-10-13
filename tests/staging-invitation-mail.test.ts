import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  authRegistrationAllowed,
  authRecoveryAllowed,
  assertDeploymentEnvironment,
  externalEffectsAllowed,
} from "../src/lib/deployment-environment";
import {
  stagingInvitationTest,
  stagingInvitationTestFormAllowed,
} from "../src/lib/staging-invitation-test";
import {
  invitationMailConfig,
  composeInvitationMail,
  notifyInvitation,
  type InvitationNotice,
} from "../src/lib/invitation-mail";
import {
  invitationMailConfig as managerMailConfig,
  notifyManagerInvitation,
} from "../src/lib/manager-mail";

const setup = () => {
  const company = randomUUID(),
    invitation = randomUUID();
  const env = {
    APP_ENVIRONMENT: "staging",
    STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
    NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
    NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
    STAGING_AUTH_EMAIL_CAPTURE_VERIFIED: "true",
    INVITATION_MAIL_ENABLED: "false",
    MAIL_FROM_ADDRESS: "notice@example.test",
    STAGING_INVITATION_TEST_ENABLED: "true",
    STAGING_INVITATION_TEST_COMPANY: company,
    STAGING_INVITATION_TEST_INVITATION: invitation,
    STAGING_INVITATION_TEST_EMAIL: "approved@example.test",
    STAGING_INVITATION_TEST_EXPIRES_AT: new Date(
      Date.now() + 3600000,
    ).toISOString(),
  };
  const notice: InvitationNotice = {
    attempt_id: randomUUID(),
    email: env.STAGING_INVITATION_TEST_EMAIL,
    company_name: "Synthetic mail company",
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  return { env, company, invitation, notice };
};

test("staging rehearsal stays closed by default, expires automatically and cannot target a live backend", () => {
  const { env } = setup();
  assert.doesNotThrow(() => assertDeploymentEnvironment(env));
  assert.equal(externalEffectsAllowed(env), false);
  assert.equal(
    invitationMailConfig(env)?.stagingTest?.email,
    env.STAGING_INVITATION_TEST_EMAIL,
  );
  assert.equal(managerMailConfig(env), null);
  assert.equal(
    authRegistrationAllowed(env, env.STAGING_INVITATION_TEST_EMAIL),
    true,
  );
  assert.equal(authRegistrationAllowed(env, "other@example.test"), false);
  assert.equal(
    authRecoveryAllowed(env, env.STAGING_INVITATION_TEST_EMAIL),
    false,
  );
  assert.equal(
    authRecoveryAllowed(env, "synthetic@saasalldecor.invalid"),
    true,
  );
  for (const change of [
    { STAGING_INVITATION_TEST_ENABLED: "false" },
    { STAGING_INVITATION_TEST_EMAIL: "x@example.test\nBcc: bad@example.test" },
    { STAGING_INVITATION_TEST_COMPANY: "not-a-uuid" },
    { STAGING_AUTH_EMAIL_CAPTURE_VERIFIED: "false" },
    { NEXT_PUBLIC_SITE_URL: "https://app.alldecorpatio.com" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://loqbmrlkhskqzozknehx.supabase.co" },
    { INVITATION_MAIL_ENABLED: "true" },
    { INVOICE_MAIL_ENABLED: "true" },
    {
      STAGING_INVITATION_TEST_EXPIRES_AT: new Date(
        Date.now() - 1,
      ).toISOString(),
    },
    {
      STAGING_INVITATION_TEST_EXPIRES_AT: new Date(
        Date.now() + 3 * 3600000,
      ).toISOString(),
    },
  ]) {
    assert.equal(invitationMailConfig({ ...env, ...change }), null);
    assert.equal(
      authRegistrationAllowed(
        { ...env, ...change },
        env.STAGING_INVITATION_TEST_EMAIL,
      ),
      false,
    );
  }
  assert.equal(
    stagingInvitationTest({ ...env, APP_ENVIRONMENT: "production" }),
    null,
  );
});

test("the approved test form cannot widen the role, modules, action, company, invitation or recipient", () => {
  const { env, company, invitation } = setup();
  const policy = stagingInvitationTest(env)!;
  const input: Parameters<typeof stagingInvitationTestFormAllowed>[1] = {
    company,
    invitation,
    email: policy.email,
    role: "member",
    permissions: { clientes: ["read"] },
  };
  assert.equal(stagingInvitationTestFormAllowed(policy, input), true);
  const changes: Array<Partial<typeof input>> = [
    { company: randomUUID() },
    { invitation: randomUUID() },
    { email: "other@example.test" },
    { role: "admin" },
    { permissions: {} },
    { permissions: { clientes: ["read", "write"] } },
    { permissions: { clientes: ["read"], config: ["read"] } },
  ];
  for (const change of changes)
    assert.equal(
      stagingInvitationTestFormAllowed(policy, { ...input, ...change }),
      false,
    );
});

test("only the bound DB recipient receives the first message; retry, mismatch and expired claims never send", async () => {
  const { env, company, invitation, notice } = setup();
  const config = invitationMailConfig(env)!;
  const calls: string[] = [];
  let sends = 0,
    duplicate = false;
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name + ":" + String(args.p_status ?? ""));
      return {
        data:
          name === "claim_invitation_email"
            ? duplicate
              ? []
              : [notice]
            : null,
        error: null,
      };
    },
  };
  const send = async (_: unknown, n: InvitationNotice) => {
    assert.equal(n.email, config.stagingTest!.email);
    sends++;
    return "queued" as const;
  };
  for (const [cid, iid, retry] of [
    [randomUUID(), invitation, false],
    [company, randomUUID(), false],
    [company, invitation, true],
  ] as const)
    assert.ok(
      (await notifyInvitation(db, cid, iid, retry, config, send)).error,
    );
  assert.equal(calls.length, 0);
  assert.equal(sends, 0);
  assert.ok(
    (await notifyInvitation(db, company, invitation, false, config, send))
      .success,
  );
  duplicate = true;
  await notifyInvitation(db, company, invitation, false, config, send);
  assert.equal(sends, 1);
  const wrong = {
    rpc: async (name: string) => ({
      data:
        name === "claim_invitation_email"
          ? [{ ...notice, email: "other@example.test" }]
          : null,
      error: null,
    }),
  };
  assert.ok(
    (await notifyInvitation(wrong, company, invitation, false, config, send))
      .error,
  );
  assert.equal(sends, 1);
  const expiredDuringClaim = {
    rpc: async (name: string) => {
      if (name === "claim_invitation_email")
        config.stagingTest!.expiresAt = new Date(Date.now() - 1).toISOString();
      return {
        data: name === "claim_invitation_email" ? [notice] : null,
        error: null,
      };
    },
  };
  const validUntil = config.stagingTest!.expiresAt;
  assert.ok(
    (
      await notifyInvitation(
        expiredDuringClaim,
        company,
        invitation,
        false,
        config,
        send,
      )
    ).error,
  );
  assert.equal(sends, 1);
  config.stagingTest!.expiresAt = validUntil;
  const expired = {
    ...config,
    stagingTest: {
      ...config.stagingTest!,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    },
  };
  await assert.rejects(composeInvitationMail(expired, notice), /outside_scope/);
  await assert.rejects(
    composeInvitationMail(config, { ...notice, kind: "manager" }),
    /outside_scope/,
  );
  await notifyManagerInvitation(db, invitation, false, config, send);
  assert.equal(sends, 1);
  const mime = (await composeInvitationMail(config, notice)).message.toString(
    "utf8",
  );
  assert.match(mime, /To: approved@example\.test/);
  assert.match(mime, /https:\/\/staging\.example\.test\/registro/);
  assert.doesNotMatch(mime, /access_token|token_hash|^Bcc:/im);
});
