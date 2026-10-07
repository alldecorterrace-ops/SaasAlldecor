import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { composeInvitationMail } from "../src/lib/invitation-mail";
import { notifyManagerInvitation } from "../src/lib/manager-mail";

test("Platform invitations enforce administrator -> manager -> companies -> scoped teams", async (t) => {
  const { db } = await fullDatabase(undefined, { managedOnboarding: true });
  const admin = randomUUID(),
    manager = randomUUID(),
    other = randomUUID(),
    worker = randomUUID(),
    unverified = randomUUID(),
    company = randomUUID(),
    second = randomUUID(),
    foreign = randomUUID();
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const invite = async (email: string, id: string = randomUUID()) =>
    (
      await db.query<{ id: string }>(
        "select invite_platform_manager($1,$2) id",
        [id, email],
      )
    ).rows[0].id;
  const accept = (id: string, yes = true) =>
    db.query("select respond_manager_invitation($1,$2)", [id, yes]);
  try {
    for (const [id, email] of [
      [admin, "admin@saasalldecor.invalid"],
      [manager, "manager@saasalldecor.invalid"],
      [other, "other@saasalldecor.invalid"],
      [worker, "worker@saasalldecor.invalid"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await db.query(
      "insert into auth.users values($1,'unverified@saasalldecor.invalid',null)",
      [unverified],
    );
    await t.test(
      "bootstrap is operator-only, verified and cannot promote a second account",
      async () => {
        await assert.rejects(
          db.query("select app_private.bootstrap_platform_administrator($1)", [
            unverified,
          ]),
          /verified_account_required/,
        );
        await db.query(
          "select app_private.bootstrap_platform_administrator($1)",
          [admin],
        );
        await assert.rejects(
          db.query("select app_private.bootstrap_platform_administrator($1)", [
            manager,
          ]),
          /already_bootstrapped/,
        );
        await as(worker);
        await assert.rejects(
          db.query("select app_private.bootstrap_platform_administrator($1)", [
            worker,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "insert into platform_accounts(user_id,role) values($1,'administrator')",
            [worker],
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "confirmed ordinary users and the global admin cannot self-enroll as company managers",
      async () => {
        await as(worker);
        await assert.rejects(
          db.query("select create_company($1,'Uninvited')", [company]),
          /manager_invitation_required/,
        );
        await assert.rejects(
          invite("manager@saasalldecor.invalid"),
          /permission_denied/,
        );
        await as(admin);
        assert.deepEqual(
          (await db.query("select * from platform_context()")).rows,
          [{ role: "administrator", active: true, can_create_company: false }],
        );
        await assert.rejects(
          db.query("select create_company($1,'Global account')", [company]),
          /manager_invitation_required/,
        );
      },
    );
    let invitation = "",
      otherInvitation = "";
    await t.test(
      "manager invite is idempotent, email-bound and does not grant companies before acceptance",
      async () => {
        await as(admin);
        invitation = await invite(" MANAGER@saasalldecor.invalid ");
        assert.equal(
          await invite("manager@saasalldecor.invalid", invitation),
          invitation,
        );
        assert.equal(await invite("manager@saasalldecor.invalid"), invitation);
        await assert.rejects(
          invite("changed@saasalldecor.invalid", invitation),
          /invitation_conflict/,
        );
        await as(other);
        assert.deepEqual(
          (await db.query("select * from manager_invitations")).rows,
          [],
        );
        await assert.rejects(accept(invitation), /invitation_unavailable/);
        await as(manager);
        assert.equal(
          (await db.query("select * from my_manager_invitations()")).rows
            .length,
          1,
        );
        await assert.rejects(
          db.query("select create_company($1,'Before acceptance')", [company]),
          /manager_invitation_required/,
        );
        await accept(invitation);
        await accept(invitation);
        assert.deepEqual(
          (await db.query("select * from platform_context()")).rows,
          [{ role: "manager", active: true, can_create_company: true }],
        );
      },
    );
    await t.test(
      "one manager creates multiple isolated companies and sees no other tenant",
      async () => {
        await db.query(
          "select create_company($1,'Manager A one'),create_company($2,'Manager A two')",
          [company, second],
        );
        await db.query("select create_company($1,'Manager A one')", [company]);
        await as(admin);
        otherInvitation = await invite("other@saasalldecor.invalid");
        await as(other);
        await accept(otherInvitation);
        await db.query("select create_company($1,'Manager B')", [foreign]);
        assert.deepEqual(
          (await db.query<{ id: string }>("select id from companies")).rows.map(
            (r) => r.id,
          ),
          [foreign],
        );
        await assert.rejects(
          db.query("select create_company($1,'Manager A one')", [company]),
          /request_conflict/,
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'x@saasalldecor.invalid','admin','{}')",
            [company, randomUUID()],
          ),
          /permission_denied/,
        );
        assert.deepEqual(
          (await db.query("select * from platform_company_overview()")).rows,
          [],
        );
        await as(admin);
        assert.equal(
          (await db.query("select * from platform_company_overview()")).rows
            .length,
          3,
        );
        assert.deepEqual((await db.query("select * from companies")).rows, []);
        assert.deepEqual(
          (await db.query("select * from memberships")).rows,
          [],
        );
      },
    );
    await t.test(
      "the global administrator cannot join or operate a company even through an invitation or old membership",
      async () => {
        await as(manager);
        const globalTeamInvitation = randomUUID();
        await db.query(
          "select invite_company_user($1,$2,'admin@saasalldecor.invalid','admin','{}')",
          [company, globalTeamInvitation],
        );
        await as(admin);
        assert.deepEqual(
          (await db.query("select * from my_company_invitations()")).rows,
          [],
        );
        assert.deepEqual(
          (await db.query("select * from my_company_role_invitations()")).rows,
          [],
        );
        await assert.rejects(
          db.query("select respond_company_invitation($1,true)", [
            globalTeamInvitation,
          ]),
          /account_suspended/,
        );
        await db.exec("reset role");
        await db.query(
          "insert into memberships(company_id,user_id,email,role) values($1,$2,'admin@saasalldecor.invalid','admin')",
          [company, admin],
        );
        await db.query(
          "insert into web_notice_settings(company_id,staff_email,updated_by) values($1,'notice@saasalldecor.invalid',$2)",
          [company, manager],
        );
        await as(admin);
        assert.deepEqual((await db.query("select * from companies")).rows, []);
        assert.deepEqual(
          (await db.query("select * from memberships")).rows,
          [],
        );
        assert.deepEqual(
          (await db.query("select * from web_notice_settings")).rows,
          [],
        );
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select app_private.can_access($1,'clientes','write') allowed",
              [company],
            )
          ).rows[0].allowed,
          false,
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'new@saasalldecor.invalid','member','{}')",
            [company, randomUUID()],
          ),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select set_member_access($1,$2,'member',true,'{}')", [
            company,
            worker,
          ]),
          /permission_denied/,
        );
        await db.exec("reset role");
        await db.query(
          "delete from memberships where company_id=$1 and user_id=$2",
          [company, admin],
        );
        await as(manager);
        assert.equal(
          (await db.query("select * from web_notice_settings")).rows.length,
          1,
        );
      },
    );
    let memberInvitation = "";
    const permissions = { clientes: ["read"], "fin-estimados": ["write"] };
    await t.test(
      "team invitation freezes role and permissions, refuses escalation and does not overwrite membership on replay",
      async () => {
        await as(manager);
        memberInvitation = randomUUID();
        await db.query(
          "select invite_company_user($1,$2,'worker@saasalldecor.invalid','member',$3)",
          [company, memberInvitation, JSON.stringify(permissions)],
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'worker@saasalldecor.invalid','admin','{}')",
            [company, memberInvitation],
          ),
          /invitation_conflict/,
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'x@saasalldecor.invalid','owner','{}')",
            [company, randomUUID()],
          ),
          /permission_denied/,
        );
        for (const p of [
          { invented: ["read"] },
          { clientes: ["execute"] },
          { ia: ["write"] },
          { clientes: "read" },
        ])
          await assert.rejects(
            db.query(
              "select invite_company_user($1,$2,'x@saasalldecor.invalid','member',$3)",
              [company, randomUUID(), JSON.stringify(p)],
            ),
            /invalid_permissions/,
          );
        await as(worker);
        const incoming = (
          await db.query<{ permissions: unknown; role: string }>(
            "select * from my_company_role_invitations()",
          )
        ).rows[0];
        assert.deepEqual(incoming.permissions, permissions);
        assert.equal(incoming.role, "member");
        await db.query("select respond_company_invitation($1,true)", [
          memberInvitation,
        ]);
        assert.deepEqual(
          (
            await db.query<{ permissions: unknown }>(
              "select permissions from memberships where company_id=$1",
              [company],
            )
          ).rows[0].permissions,
          permissions,
        );
        await assert.rejects(
          db.query("select create_company($1,'Team cannot create')", [
            randomUUID(),
          ]),
          /manager_invitation_required/,
        );
        await assert.rejects(
          invite("x@saasalldecor.invalid"),
          /permission_denied/,
        );
        await as(manager);
        await db.query(
          "select set_member_access($1,$2,'member',true,'{\"clientes\":[\"write\"]}')",
          [company, worker],
        );
        await as(worker);
        await db.query("select respond_company_invitation($1,true)", [
          memberInvitation,
        ]);
        assert.deepEqual(
          (
            await db.query<{ permissions: unknown }>(
              "select permissions from memberships where company_id=$1",
              [company],
            )
          ).rows[0].permissions,
          { clientes: ["write"] },
        );
      },
    );
    await t.test(
      "only a company owner can invite an administrator, never a global administrator",
      async () => {
        await as(manager);
        const teamAdmin = randomUUID();
        await db.exec("reset role");
        await db.query(
          "insert into auth.users values($1,'team-admin@saasalldecor.invalid',now()) on conflict do nothing",
          [teamAdmin],
        );
        await as(manager);
        const adminInvitation = randomUUID();
        await db.query(
          "select invite_company_user($1,$2,'team-admin@saasalldecor.invalid','admin','{}')",
          [company, adminInvitation],
        );
        await as(teamAdmin);
        await db.query("select respond_company_invitation($1,true)", [
          adminInvitation,
        ]);
        assert.equal(
          (
            await db.query<{ role: string }>(
              "select role from memberships where company_id=$1 and user_id=$2",
              [company, teamAdmin],
            )
          ).rows[0].role,
          "admin",
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'new-admin@saasalldecor.invalid','admin','{}')",
            [company, randomUUID()],
          ),
          /permission_denied/,
        );
        await assert.rejects(
          invite("new-manager@saasalldecor.invalid"),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "manager suspension preserves business rows and cannot be bypassed by old acceptance or company memberships",
      async () => {
        await as(admin);
        await assert.rejects(
          db.query("select set_platform_manager_active($1,1,false,false)", [
            manager,
          ]),
          /confirmation_required/,
        );
        await db.query("select set_platform_manager_active($1,1,false,true)", [
          manager,
        ]);
        await assert.rejects(
          db.query("select set_platform_manager_active($1,1,true,true)", [
            manager,
          ]),
          /version_conflict/,
        );
        await assert.rejects(
          db.query("select set_platform_manager_active($1,1,false,true)", [
            admin,
          ]),
          /version_conflict/,
        );
        await as(manager);
        assert.deepEqual((await db.query("select * from companies")).rows, []);
        await assert.rejects(accept(invitation), /account_suspended/);
        await assert.rejects(
          db.query("select create_company($1,'Suspended')", [randomUUID()]),
          /manager_invitation_required/,
        );
        await assert.rejects(
          db.query(
            "select invite_company_user($1,$2,'suspended@saasalldecor.invalid','member','{}')",
            [company, randomUUID()],
          ),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select set_member_access($1,$2,'admin',true,'{}')", [
            company,
            worker,
          ]),
          /permission_denied/,
        );
        await as(worker);
        assert.equal(
          (await db.query("select * from companies")).rows.length,
          1,
        );
        await as(admin);
        await db.query("select set_platform_manager_active($1,2,true,true)", [
          manager,
        ]);
        await as(manager);
        assert.equal(
          (await db.query("select * from companies")).rows.length,
          2,
        );
      },
    );
    await t.test(
      "revoked, expired and unverified invitations cannot grant manager access",
      async () => {
        await as(admin);
        const revoked = await invite("revoked@saasalldecor.invalid"),
          expired = await invite("expired@saasalldecor.invalid"),
          notVerified = await invite("unverified@saasalldecor.invalid");
        await db.query("select revoke_manager_invitation($1)", [revoked]);
        await db.query("select revoke_manager_invitation($1)", [revoked]);
        await db.exec("reset role");
        const revokedUser = randomUUID(),
          expiredUser = randomUUID();
        await db.query(
          "insert into auth.users values($1,'revoked@saasalldecor.invalid',now()),($2,'expired@saasalldecor.invalid',now())",
          [revokedUser, expiredUser],
        );
        await db.query(
          "update manager_invitations set expires_at=now()-interval '1 day' where id=$1",
          [expired],
        );
        await as(revokedUser);
        await assert.rejects(accept(revoked), /invitation_unavailable/);
        await as(expiredUser);
        await assert.rejects(accept(expired), /invitation_unavailable/);
        await as(unverified);
        await assert.rejects(accept(notVerified), /authentication_required/);
      },
    );
    await t.test(
      "manager email claims are admin-only, durable and rate limited",
      async () => {
        await as(admin);
        const i = await invite("email@saasalldecor.invalid");
        const first = (
          await db.query<{ attempt_id: string; email: string }>(
            "select * from claim_manager_invitation_email($1,false)",
            [i],
          )
        ).rows[0];
        assert.equal(first.email, "email@saasalldecor.invalid");
        assert.equal(
          (
            await db.query(
              "select * from claim_manager_invitation_email($1,false)",
              [i],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select * from claim_manager_invitation_email($1,true)", [
            i,
          ]),
          /mail_rate_limited/,
        );
        await db.query("select finish_manager_invitation_email($1,'unknown')", [
          first.attempt_id,
        ]);
        await assert.rejects(
          db.query("select finish_manager_invitation_email($1,'queued')", [
            first.attempt_id,
          ]),
          /mail_attempt_unavailable/,
        );
        await as(manager);
        await assert.rejects(
          db.query("select * from claim_manager_invitation_email($1,false)", [
            i,
          ]),
          /permission_denied/,
        );
        assert.deepEqual(
          (await db.query("select * from manager_email_attempts")).rows,
          [],
        );
      },
    );
  } finally {
    await db.close();
  }
});

test("manager notice names the actual manager onboarding flow and never uses a bearer token", async () => {
  const config = {
    from: "notice@saasalldecor.invalid",
    name: "SaaS QA",
    site: "https://app.example.invalid",
  };
  const mail = await composeInvitationMail(config, {
    attempt_id: randomUUID(),
    email: "manager@saasalldecor.invalid",
    company_name: "Administración del SaaS",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    kind: "manager",
  });
  const text = mail.message.toString();
  assert.match(text, /manager@saasalldecor.invalid/);
  assert.match(text, /app[.]example[.]invalid\/empresas/);
  assert.match(text, /gerente/);
  assert.match(text, /crear tus propias/);
  assert.doesNotMatch(text, /token=|password=|Cc:|Bcc:/i);
});
test("disabled manager mail never claims or sends, and uncertain handoffs are never retried automatically", async () => {
  let calls = 0,
    sends = 0;
  const db = {
    rpc: async (name: string) => {
      calls++;
      return {
        data: name.startsWith("claim")
          ? [
              {
                attempt_id: randomUUID(),
                email: "manager@saasalldecor.invalid",
                company_name: "Administración del SaaS",
                expires_at: new Date().toISOString(),
              },
            ]
          : null,
        error: null,
      };
    },
  };
  await notifyManagerInvitation(db, randomUUID(), false, null, async () => {
    sends++;
    return "queued";
  });
  assert.equal(calls, 0);
  assert.equal(sends, 0);
  const result = await notifyManagerInvitation(
    db,
    randomUUID(),
    false,
    {
      from: "notice@saasalldecor.invalid",
      name: "QA",
      site: "https://app.example.invalid",
    },
    async () => {
      sends++;
      throw new Error("uncertain");
    },
  );
  assert.equal(sends, 1);
  assert.equal(calls, 2);
  assert.match(result.error!, /sin confirmar/);
});
