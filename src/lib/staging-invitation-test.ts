import { z } from "zod";

type Environment = Record<string, string | undefined>;
const policy = z.object({
  companyId: z.uuid(),
  invitationId: z.uuid(),
  email: z
    .email()
    .max(254)
    .refine((v) => v === v.trim().toLowerCase()),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type StagingInvitationTest = z.infer<typeof policy>;

export function stagingInvitationTestFormAllowed(
  value: StagingInvitationTest,
  input: {
    company: string;
    invitation: string;
    email: string;
    role: string;
    permissions: Record<string, string[]>;
  },
) {
  if (
    input.email.toLowerCase() !== value.email &&
    input.invitation !== value.invitationId
  )
    return true;
  return (
    stagingInvitationTestMatches(value, input.company, input.invitation) &&
    input.email.toLowerCase() === value.email &&
    input.role === "member" &&
    Object.keys(input.permissions).length === 1 &&
    input.permissions.clientes?.length === 1 &&
    input.permissions.clientes[0] === "read"
  );
}

// A private operator flag permits one addressed company invitation for at most
// two hours. General delivery flags and the before-signup hook stay unchanged.
export function configuredStagingInvitationTest(env: Environment) {
  if (
    env.APP_ENVIRONMENT !== "staging" ||
    env.STAGING_INVITATION_TEST_ENABLED !== "true"
  )
    return null;
  return policy.safeParse({
    companyId: env.STAGING_INVITATION_TEST_COMPANY,
    invitationId: env.STAGING_INVITATION_TEST_INVITATION,
    email: env.STAGING_INVITATION_TEST_EMAIL,
    expiresAt: env.STAGING_INVITATION_TEST_EXPIRES_AT,
  });
}
export function stagingInvitationTest(
  env: Environment,
  now = Date.now(),
): StagingInvitationTest | null {
  const parsed = configuredStagingInvitationTest(env);
  if (!parsed?.success) return null;
  const until = Date.parse(parsed.data.expiresAt);
  return until > now && until <= now + 2 * 3600000 ? parsed.data : null;
}
export function stagingInvitationTestMatches(
  value: StagingInvitationTest,
  company: string,
  invitation: string,
  now = Date.now(),
) {
  return (
    company === value.companyId &&
    invitation === value.invitationId &&
    Date.parse(value.expiresAt) > now &&
    Date.parse(value.expiresAt) <= now + 2 * 3600000
  );
}
