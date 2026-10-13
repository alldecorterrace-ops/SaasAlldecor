import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";

test("optional staging capture admits only the approved unconfirmed employee signup and never a real recovery/email change", async () => {
  const { db } = await fullDatabase(undefined, { managedOnboarding: true });
  const owner = randomUUID(),
    recipient = randomUUID(),
    foreign = randomUUID(),
    order = randomUUID(),
    invitation = randomUUID();
  const email = "approved@example.test";
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const payload = (change: Record<string, unknown> = {}) => ({
    user: { id: recipient, email },
    email_data: { email_action_type: "signup", token_hash: "SYNTHETIC_ONLY" },
    ...change,
  });
  const capture = async (body: object) => {
    await db.exec("reset role;set role supabase_auth_admin");
    return db.query("select staging_capture_auth_email($1)", [
      JSON.stringify(body),
    ]);
  };
  try {
    await db.query(
      "insert into auth.users values($1,'owner@saasalldecor.invalid',now()),($2,$4,null),($3,'other@example.test',null)",
      [owner, recipient, foreign, email],
    );
    await db.exec("set role service_role");
    await db.query(
      "select prepare_billing_order($1,'owner@saasalldecor.invalid','Auth mail test','equipo','test')",
      [order],
    );
    await db.query("select attach_billing_checkout($1,'cs_test_mail')", [
      order,
    ]);
    await db.query(
      "select apply_billing_snapshot('evt_mail',1900000000,$1,$2)",
      [
        "a".repeat(64),
        JSON.stringify({
          order_id: order,
          mode: "test",
          plan_code: "equipo",
          subscription_id: "sub_mail",
          customer_id: "cus_mail",
          checkout_id: "cs_test_mail",
          email: "owner@saasalldecor.invalid",
          status: "active",
          paid: true,
          paid_through: new Date(Date.now() + 30 * 86400000).toISOString(),
          initial: true,
        }),
      ],
    );
    await as(owner);
    await db.query("select activate_my_paid_companies()");
    await db.query(
      "select invite_company_user($1,$2,$3,'member','{\"clientes\":[\"read\"]}')",
      [order, invitation, email],
    );
    await db.exec(`reset role;
      create schema staging_private;
      create table staging_private.auth_mail(user_id uuid,recipient text,new_recipient text,email_data jsonb);
      create table staging_private.reactivation_activation_20261013(key text,value jsonb);
      insert into staging_private.reactivation_activation_20261013 values('release','{"project_ref":"ejeuxzukutzzlbzjnyio"}');
      grant usage on schema staging_private to supabase_auth_admin;
      grant insert on staging_private.auth_mail to supabase_auth_admin;
      create function public.staging_capture_auth_email(jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    `);
    await db.exec(
      await readFile(
        new URL(
          "../scripts/ops/staging-invitation-auth-test.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await assert.rejects(capture(payload()), /synthetic_recipient_required/);
    await db.exec("reset role");
    await db.query(
      "insert into staging_private.invitation_delivery_test(enabled,company_id,invitation_id,email,expires_at) values(true,$1,$2,$3,now()+interval '1 hour')",
      [order, invitation, email],
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`reset role;set role ${role}`);
      await assert.rejects(
        db.query("select * from staging_private.invitation_delivery_test"),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "select staging_invitation_signup_capture_allowed($1,$2,'signup')",
          [email, recipient],
        ),
        /permission denied/,
      );
    }
    await capture(payload());
    await assert.rejects(
      capture(payload({ email_data: { email_action_type: "recovery" } })),
      /synthetic_recipient_required/,
    );
    await assert.rejects(
      capture(payload({ user: { id: foreign, email } })),
      /synthetic_recipient_required/,
    );
    await assert.rejects(
      capture(
        payload({ user: { id: recipient, email: "other@example.test" } }),
      ),
      /synthetic_recipient_required/,
    );
    await assert.rejects(
      capture(
        payload({
          user: { id: recipient, email, new_email: "other@example.test" },
        }),
      ),
      /synthetic_recipient_required/,
    );
    await capture({
      user: { id: owner, email: "owner@saasalldecor.invalid" },
      email_data: { email_action_type: "recovery" },
    });
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from staging_private.auth_mail",
        )
      ).rows[0].n,
      2,
    );
    await db.query(
      'update company_invitations set permissions=\'{"clientes":["read","write"]}\' where id=$1',
      [invitation],
    );
    await assert.rejects(capture(payload()), /synthetic_recipient_required/);
    await db.exec("reset role");
    await db.query(
      'update company_invitations set permissions=\'{"clientes":["read"]}\' where id=$1',
      [invitation],
    );
    await as(owner);
    await db.query("select revoke_company_invitation($1,$2)", [
      order,
      invitation,
    ]);
    await assert.rejects(capture(payload()), /synthetic_recipient_required/);
    await db.exec("reset role");
    await db.query(
      "update company_invitations set status='pending',resolved_at=null where id=$1",
      [invitation],
    );
    await db.exec(
      "update staging_private.invitation_delivery_test set created_at=now()-interval '2 hours',expires_at=now()-interval '1 second'",
    );
    await assert.rejects(capture(payload()), /synthetic_recipient_required/);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from staging_private.auth_mail",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});
