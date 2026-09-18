import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";

test("Company invitations preserve recipient, membership and tenant boundaries", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    recipient = randomUUID(),
    outsider = randomUUID(),
    unverified = randomUUID(),
    manager = randomUUID();
  const company = randomUUID(),
    foreign = randomUUID();
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const create = async (email: string, id: string = randomUUID()) => {
    const r = await db.query<{ id: string }>(
      "select public.create_company_invitation($1,$2,$3) id",
      [company, id, email],
    );
    return r.rows[0].id;
  };
  const respond = (id: string, accept = true) =>
    db.query<{ company: string | null }>(
      "select public.respond_company_invitation($1,$2) company",
      [id, accept],
    );
  try {
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [recipient, "recipient@example.test"],
      [outsider, "outsider@example.test"],
      [manager, "manager@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await db.query(
      "insert into auth.users values($1,'unverified@example.test',null)",
      [unverified],
    );
    await as(owner);
    await db.query("select public.create_company($1,'Invitation company')", [
      company,
    ]);
    await as(outsider);
    await db.query("select public.create_company($1,'Other company')", [
      foreign,
    ]);
    let invitation = "";
    await t.test(
      "creation works before signup, does not grant access, and normalized retries retain the original expiry",
      async () => {
        await as(owner);
        invitation = await create(" Recipient@EXAMPLE.test ");
        assert.equal(await create("recipient@example.test"), invitation);
        assert.equal(
          await create("recipient@example.test", invitation),
          invitation,
        );
        await assert.rejects(
          create("other@example.test", invitation),
          /invitation_conflict/,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.memberships where company_id=$1",
              [company],
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.company_invitations where company_id=$1",
              [company],
            )
          ).rows.length,
          1,
        );
        await create("not-registered-yet@example.test");
        await assert.rejects(create("not an email"), /invalid_invitation/);
      },
    );
    await t.test(
      "other company managers cannot read, create, revoke or accept the invitation",
      async () => {
        await as(outsider);
        assert.deepEqual(
          (await db.query("select * from public.company_invitations")).rows,
          [],
        );
        assert.deepEqual(
          (await db.query("select * from public.my_company_invitations()"))
            .rows,
          [],
        );
        await assert.rejects(
          create("anything@example.test"),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select public.revoke_company_invitation($1,$2)", [
            company,
            invitation,
          ]),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select public.revoke_company_invitation($1,$2)", [
            foreign,
            invitation,
          ]),
          /invitation_unavailable/,
        );
        await assert.rejects(respond(invitation), /invitation_unavailable/);
      },
    );
    await t.test(
      "recipient sees only safe invitation details before membership; acceptance starts with zero modules",
      async () => {
        await as(recipient);
        assert.deepEqual(
          (await db.query("select * from public.companies")).rows,
          [],
        );
        assert.deepEqual(
          (await db.query("select * from public.company_invitations")).rows,
          [],
        );
        const pending = (
          await db.query<{ id: string }>(
            "select * from public.my_company_invitations()",
          )
        ).rows;
        assert.equal(pending.length, 1);
        assert.equal(pending[0].id, invitation);
        assert.equal((await respond(invitation)).rows[0].company, company);
        assert.equal((await respond(invitation)).rows[0].company, company);
        const members = (
          await db.query("select role,permissions from public.memberships")
        ).rows;
        assert.deepEqual(members, [{ role: "member", permissions: {} }]);
        assert.equal(
          (await db.query("select * from public.my_company_invitations()")).rows
            .length,
          0,
        );
        await assert.rejects(
          create("illegal@example.test"),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("update public.company_invitations set status='pending'"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "retry preserves changed permissions and cannot reactivate a suspended account",
      async () => {
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,'{\"clientes\":[\"read\"]}')",
          [company, recipient],
        );
        await as(recipient);
        await respond(invitation);
        assert.deepEqual(
          (
            await db.query<{ permissions: Record<string, string[]> }>(
              "select permissions from public.memberships",
            )
          ).rows[0].permissions,
          { clientes: ["read"] },
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [company, recipient],
        );
        await as(recipient);
        await assert.rejects(respond(invitation), /invitation_unavailable/);
        await as(owner);
        await assert.rejects(create("recipient@example.test"), /member_exists/);
      },
    );
    await t.test(
      "unconfirmed email and JWT email spoofing cannot accept",
      async () => {
        await as(owner);
        const id = await create("unverified@example.test");
        await as(unverified);
        assert.equal(
          (await db.query("select * from public.my_company_invitations()")).rows
            .length,
          0,
        );
        await assert.rejects(respond(id), /authentication_required/);
        await as(outsider);
        await db.query(
          "select set_config('request.jwt.claim.email','unverified@example.test',false)",
        );
        await assert.rejects(respond(id), /invitation_unavailable/);
      },
    );
    await t.test(
      "revoked and declined invitations cannot be accepted; history is retained",
      async () => {
        await as(owner);
        const revoked = await create("outsider@example.test");
        await db.query("select public.revoke_company_invitation($1,$2)", [
          company,
          revoked,
        ]);
        await db.query("select public.revoke_company_invitation($1,$2)", [
          company,
          revoked,
        ]);
        await as(outsider);
        await assert.rejects(respond(revoked), /invitation_unavailable/);
        await as(owner);
        const declined = await create("outsider@example.test");
        await as(outsider);
        await respond(declined, false);
        await respond(declined, false);
        await assert.rejects(respond(declined), /invitation_unavailable/);
        await as(owner);
        assert.equal(
          (
            await db.query(
              "select * from public.company_invitations where email='outsider@example.test'",
            )
          ).rows.length,
          2,
        );
        assert.ok(
          (
            await db.query(
              "select * from public.audit_events where entity='company_invitations'",
            )
          ).rows.length >= 4,
        );
      },
    );
    await t.test(
      "expired invitations fail and a new invitation preserves the expired record",
      async () => {
        await as(owner);
        const expired = await create("outsider@example.test");
        await db.exec("reset role");
        await db.query(
          "update public.company_invitations set expires_at=now()-interval '1 second' where id=$1",
          [expired],
        );
        await as(outsider);
        await assert.rejects(respond(expired), /invitation_unavailable/);
        assert.equal(
          (await db.query("select * from public.my_company_invitations()")).rows
            .length,
          0,
        );
        await as(owner);
        const fresh = await create("outsider@example.test");
        assert.notEqual(fresh, expired);
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from public.company_invitations where id=$1",
              [expired],
            )
          ).rows[0].status,
          "expired",
        );
        await db.query("select public.revoke_company_invitation($1,$2)", [
          company,
          fresh,
        ]);
      },
    );
    await t.test(
      "suspending the issuer prevents pending acceptance",
      async () => {
        await as(owner);
        await db.query(
          "select public.add_company_member($1,'manager@example.test')",
          [company],
        );
        await db.query(
          "select public.set_member_access($1,$2,'admin',true,'{}')",
          [company, manager],
        );
        await as(manager);
        const id = await create("outsider@example.test");
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [company, manager],
        );
        await as(outsider);
        await assert.rejects(respond(id), /invitation_unavailable/);
        assert.equal(
          (await db.query("select * from public.my_company_invitations()")).rows
            .length,
          0,
        );
      },
    );
    await t.test(
      "anonymous callers cannot list or mutate invitations",
      async () => {
        await db.exec("reset role; set role anon");
        await assert.rejects(
          db.query("select * from public.company_invitations"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from public.my_company_invitations()"),
          /permission denied/,
        );
        await assert.rejects(respond(invitation), /permission denied/);
      },
    );
  } finally {
    await db.close();
  }
});
