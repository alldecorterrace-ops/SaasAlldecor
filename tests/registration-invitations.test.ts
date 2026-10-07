import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  checkRegistrationInvitation,
  invitationRequiredMessage,
} from "../src/lib/registration";

test("registration lookup fails closed and returns only a safe invitation message", async () => {
  assert.deepEqual(
    await checkRegistrationInvitation(async () => ({
      data: true,
      error: null,
    })),
    {},
  );
  for (const data of [false, null, undefined, "true", {}, 1])
    assert.deepEqual(
      await checkRegistrationInvitation(async () => ({ data, error: null })),
      { error: invitationRequiredMessage },
    );
  assert.match(
    (
      await checkRegistrationInvitation(async () => ({
        data: true,
        error: new Error("private database detail"),
      }))
    ).error!,
    /comprobar/,
  );
  assert.match(
    (
      await checkRegistrationInvitation(async () => {
        throw new Error("private");
      })
    ).error!,
    /comprobar/,
  );
});

test("Auth hook permits only live administrator-to-manager or manager-to-team invitations", async (t) => {
  const { db } = await fullDatabase(undefined, { managedOnboarding: true });
  const admin = randomUUID(),
    manager = randomUUID(),
    team = randomUUID(),
    company = randomUUID();
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const hook = async (event: unknown) => {
    await db.exec("reset role;set role supabase_auth_admin");
    return (
      await db.query<{
        result: { error?: { message: string; http_code: number } };
      }>("select require_signup_invitation($1::jsonb) result", [
        JSON.stringify(event),
      ])
    ).rows[0].result;
  };
  const event = (email: string) => ({
    user: {
      id: randomUUID(),
      email,
      is_anonymous: false,
      app_metadata: { role: "manager" },
      user_metadata: { role: "administrator" },
    },
  });
  const allowed = async (email: string) =>
    assert.deepEqual(await hook(event(email)), {});
  const denied = async (email: string) =>
    assert.deepEqual(await hook(event(email)), {
      error: { http_code: 403, message: "signup_invitation_required" },
    });
  const managerInvite = randomUUID(),
    teamInvite = randomUUID();
  try {
    await db.query(
      "insert into auth.users values($1,'admin@saasalldecor.invalid',now())",
      [admin],
    );
    await db.query("select app_private.bootstrap_platform_administrator($1)", [
      admin,
    ]);
    await t.test(
      "anonymous direct hook access and direct tables are denied; lookup reveals boolean only",
      async () => {
        await db.exec("set role anon");
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select registration_invitation_available('unknown@saasalldecor.invalid') allowed",
            )
          ).rows[0].allowed,
          false,
        );
        await assert.rejects(
          db.query("select require_signup_invitation('{}')"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from manager_invitations"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from company_invitations"),
          /permission denied/,
        );
        await db.exec("reset role;set role authenticated");
        await assert.rejects(
          db.query("select require_signup_invitation('{}')"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "uninvited, malformed, phone-only and anonymous events cannot create an account",
      async () => {
        await denied("unknown@saasalldecor.invalid");
        for (const value of [
          null,
          [],
          {},
          { user: {} },
          { user: { phone: "123" } },
          event("bad"),
          { user: { email: "admin@saasalldecor.invalid", is_anonymous: true } },
        ])
          assert.equal((await hook(value)).error?.http_code, 403);
        await db.exec("reset role");
        assert.equal(
          (await db.query<{ n: number }>("select count(*) n from auth.users"))
            .rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "administrator invitation permits signup without granting manager before confirmed acceptance",
      async () => {
        await as(admin);
        await db.query(
          "select invite_platform_manager($1,'manager@saasalldecor.invalid')",
          [managerInvite],
        );
        await allowed(" MANAGER@saasalldecor.invalid ");
        await db.exec("reset role");
        await db.query(
          "insert into auth.users values($1,'manager@saasalldecor.invalid',null)",
          [manager],
        );
        await as(manager);
        assert.deepEqual(
          (await db.query("select * from platform_context()")).rows,
          [],
        );
        await assert.rejects(
          db.query("select create_company($1,'Before confirmation')", [
            company,
          ]),
          /authentication_required/,
        );
        await assert.rejects(
          db.query("select respond_manager_invitation($1,true)", [
            managerInvite,
          ]),
          /authentication_required/,
        );
        await db.exec("reset role");
        await db.query(
          "update auth.users set email_confirmed_at=now() where id=$1",
          [manager],
        );
        await as(manager);
        await assert.rejects(
          db.query("select create_company($1,'Before acceptance')", [company]),
          /manager_invitation_required/,
        );
        await db.query("select respond_manager_invitation($1,true)", [
          managerInvite,
        ]);
        await db.query("select create_company($1,'Invitation test company')", [
          company,
        ]);
        await denied("manager@saasalldecor.invalid");
      },
    );
    await t.test(
      "manager invitation applies company role and permissions, never platform-manager privileges",
      async () => {
        await as(manager);
        await db.query(
          "select invite_company_user($1,$2,'team@saasalldecor.invalid','member','{\"clientes\":[\"read\"]}')",
          [company, teamInvite],
        );
        await allowed("team@saasalldecor.invalid");
        await db.exec("reset role");
        await db.query(
          "insert into auth.users values($1,'team@saasalldecor.invalid',now())",
          [team],
        );
        await as(team);
        assert.deepEqual(
          (await db.query("select * from memberships")).rows,
          [],
        );
        await db.query("select respond_company_invitation($1,true)", [
          teamInvite,
        ]);
        assert.deepEqual(
          (await db.query("select role,permissions from memberships")).rows,
          [{ role: "member", permissions: { clientes: ["read"] } }],
        );
        assert.deepEqual(
          (await db.query("select * from platform_context()")).rows,
          [],
        );
        await assert.rejects(
          db.query("select create_company($1,'Team company')", [randomUUID()]),
          /manager_invitation_required/,
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'outsider@saasalldecor.invalid','member','{}')",
            [company, randomUUID()],
          ),
          /permission_denied/,
        );
        await denied("team@saasalldecor.invalid");
      },
    );
    await t.test(
      "vencida, revoked, declined and accepted invitations all deny signup",
      async () => {
        for (const status of ["expired", "revoked", "declined", "accepted"]) {
          const email = `${status}@saasalldecor.invalid`,
            id = randomUUID();
          await as(admin);
          await db.query("select invite_platform_manager($1,$2)", [id, email]);
          await db.exec("reset role");
          await db.query(
            "update manager_invitations set status=$2,resolved_at=now(),accepted_by=case when $2='accepted' then $3::uuid else null end where id=$1",
            [id, status, manager],
          );
          await denied(email);
          await as(manager);
          const i = randomUUID();
          await db.query("select invite_company_user($1,$2,$3,'member','{}')", [
            company,
            i,
            email,
          ]);
          await db.exec("reset role");
          await db.query(
            "update company_invitations set status=$2,resolved_at=now(),accepted_by=case when $2='accepted' then $3::uuid else null end where id=$1",
            [i, status, team],
          );
          await denied(email);
        }
        await as(admin);
        const expired = randomUUID();
        await db.query(
          "select invite_platform_manager($1,'clock-expired@saasalldecor.invalid')",
          [expired],
        );
        await db.exec("reset role");
        await db.query(
          "update manager_invitations set expires_at=now()-interval '1 second' where id=$1",
          [expired],
        );
        await denied("clock-expired@saasalldecor.invalid");
      },
    );
    await t.test(
      "inactive or unconfirmed issuers cannot admit accounts",
      async () => {
        await as(admin);
        await db.query(
          "select invite_platform_manager($1,'future-manager@saasalldecor.invalid')",
          [randomUUID()],
        );
        await as(manager);
        await db.query(
          "select invite_company_user($1,$2,'future-team@saasalldecor.invalid','member','{}')",
          [company, randomUUID()],
        );
        for (const uid of [admin, manager]) {
          const email =
            uid === admin
              ? "future-manager@saasalldecor.invalid"
              : "future-team@saasalldecor.invalid";
          await db.exec("reset role");
          await db.query(
            "update platform_accounts set active=false where user_id=$1",
            [uid],
          );
          await denied(email);
          await db.exec("reset role");
          await db.query(
            "update platform_accounts set active=true where user_id=$1",
            [uid],
          );
          await db.query(
            "update auth.users set email_confirmed_at=null where id=$1",
            [uid],
          );
          await denied(email);
          await db.exec("reset role");
          await db.query(
            "update auth.users set email_confirmed_at=now() where id=$1",
            [uid],
          );
          await allowed(email);
        }
        await db.exec("reset role");
        await db.query(
          "update memberships set active=false where user_id=$1 and company_id=$2",
          [manager, company],
        );
        await denied("future-team@saasalldecor.invalid");
      },
    );
  } finally {
    await db.close();
  }
});
