import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  composeInvitationMail,
  invitationMailConfig,
  notifyInvitation,
  type InvitationNotice,
} from "../src/lib/invitation-mail";
import { fullDatabase } from "./helpers/full-database";

const config = {
  from: "notice@example.test",
  name: "SaasAlldecor",
  site: "https://app.example.test",
};
const notice: InvitationNotice = {
  attempt_id: randomUUID(),
  email: "recipient@example.test",
  company_name: "Empresa de prueba",
  expires_at: "2026-09-25T15:00:00Z",
};
test("mail is disabled by default and refuses unsafe configured senders/origins", () => {
  assert.equal(invitationMailConfig({}), null);
  const env = {
    INVITATION_MAIL_ENABLED: "true",
    MAIL_FROM_ADDRESS: config.from,
    NEXT_PUBLIC_SITE_URL: config.site,
  };
  assert.deepEqual(invitationMailConfig(env), config);
  for (const extra of [
    { MAIL_FROM_ADDRESS: "-flag@example.test" },
    { MAIL_FROM_ADDRESS: "x@example.test\r\nBcc: bad@example.test" },
    { MAIL_FROM_NAME: "Name\r\nBcc: bad" },
    { NEXT_PUBLIC_SITE_URL: "http://app.example.test" },
    { NEXT_PUBLIC_SITE_URL: "https://user:secret@app.example.test" },
  ])
    assert.equal(invitationMailConfig({ ...env, ...extra }), null);
});
test("MIME has exactly the verified recipient, fixed sender and a credential-free company entry link", async () => {
  const result = await composeInvitationMail(config, notice);
  assert.equal(result.from, config.from);
  assert.equal(result.to, notice.email);
  const message = result.message.toString("utf8");
  assert.match(message, /To: recipient@example\.test/);
  assert.match(message, /From: SaasAlldecor <notice@example\.test>/);
  assert.match(message, /https:\/\/app\.example\.test\/empresas/);
  assert.doesNotMatch(message, /token_hash|access_token|^Bcc:/im);
  for (const email of [
    "-flag@example.test",
    "one@example.test,two@example.test",
    "safe@example.test\nBcc: second@example.test",
  ])
    await assert.rejects(composeInvitationMail(config, { ...notice, email }));
});
test("orchestration sends only the DB recipient, does not retry duplicates, and records ambiguous delivery honestly", async () => {
  const calls: string[] = [];
  let duplicate = false,
    savedStatus = "",
    failSave = false;
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === "claim_invitation_email")
        return { data: duplicate ? [] : [notice], error: null };
      savedStatus = String(args.p_status);
      return {
        data: null,
        error: failSave ? { message: "database unavailable" } : null,
      };
    },
  };
  let sends = 0;
  const send = async (_config: unknown, input: typeof notice) => {
    assert.equal(input.email, notice.email);
    sends++;
    return "queued" as const;
  };
  assert.ok(
    (await notifyInvitation(db, "company", "invitation", false, null, send))
      .error,
  );
  assert.equal(calls.length, 0);
  assert.match(
    (await notifyInvitation(db, "company", "invitation", false, config, send))
      .success!,
    /aceptado/,
  );
  assert.equal(savedStatus, "queued");
  duplicate = true;
  await notifyInvitation(db, "company", "invitation", false, config, send);
  assert.equal(sends, 1);
  duplicate = false;
  failSave = true;
  assert.match(
    (await notifyInvitation(db, "company", "invitation", true, config, send))
      .error!,
    /No se pudo confirmar/,
  );
  failSave = false;
  assert.ok(
    (
      await notifyInvitation(
        db,
        "company",
        "invitation",
        true,
        config,
        async () => "failed",
      )
    ).error,
  );
  assert.equal(savedStatus, "failed");
  assert.ok(
    (
      await notifyInvitation(
        db,
        "company",
        "invitation",
        true,
        config,
        async () => {
          throw new Error("uncertain");
        },
      )
    ).error,
  );
  assert.equal(savedStatus, "unknown");
  const limited = {
    rpc: async () => ({ data: null, error: { message: "mail_rate_limited" } }),
  };
  assert.match(
    (
      await notifyInvitation(
        limited,
        "company",
        "invitation",
        true,
        config,
        send,
      )
    ).error!,
    /cinco minutos/,
  );
  assert.equal(sends, 2);
});

test("email attempts enforce manager scope, pending state, idempotence and quotas in Postgres", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    other = randomUUID(),
    member = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const claim = (id: string, retry = false, cid = company) =>
    db.query<{ attempt_id: string; email: string }>(
      "select * from public.claim_invitation_email($1,$2,$3)",
      [cid, id, retry],
    );
  const invite = async (email: string) => {
    const id = randomUUID();
    await db.query("select public.create_company_invitation($1,$2,$3)", [
      company,
      id,
      email,
    ]);
    return id;
  };
  const age = async () => {
    await db.exec("reset role");
    await db.query(
      "update public.invitation_email_attempts set created_at=created_at-interval '6 minutes' where company_id=$1",
      [company],
    );
    await as(owner);
  };
  try {
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [other, "other@example.test"],
      [member, "member@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'Mail A')", [company]);
    await db.query(
      "select public.add_company_member($1,'member@example.test')",
      [company],
    );
    const id = await invite("recipient@example.test");
    await as(other);
    await db.query("select public.create_company($1,'Mail B')", [foreign]);
    await t.test("no cross-company claims or member access", async () => {
      await assert.rejects(claim(id), /permission_denied/);
      await assert.rejects(claim(id, false, foreign), /invitation_unavailable/);
      assert.deepEqual(
        (await db.query("select * from public.invitation_email_attempts")).rows,
        [],
      );
      await as(member);
      await assert.rejects(claim(id), /permission_denied/);
    });
    await as(owner);
    const first = (await claim(id)).rows[0];
    await t.test(
      "claim returns DB email; automatic duplicate cannot send twice; explicit retry has cooldown",
      async () => {
        assert.equal(first.email, "recipient@example.test");
        assert.deepEqual((await claim(id)).rows, []);
        await assert.rejects(claim(id, true), /mail_rate_limited/);
        await db.query(
          "select public.finish_invitation_email($1,$2,'queued')",
          [company, first.attempt_id],
        );
        await db.query(
          "select public.finish_invitation_email($1,$2,'failed')",
          [company, first.attempt_id],
        );
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from public.invitation_email_attempts where id=$1",
              [first.attempt_id],
            )
          ).rows[0].status,
          "queued",
        );
        await assert.rejects(
          db.query(
            "update public.invitation_email_attempts set status='queued'",
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "no more than three attempts per invitation daily, including failures or uncertainty",
      async () => {
        await age();
        await claim(id, true);
        await age();
        await claim(id, true);
        await age();
        await assert.rejects(claim(id, true), /mail_rate_limited/);
      },
    );
    await t.test(
      "revocation blocks sending and cross-company completion is denied",
      async () => {
        await db.query("select public.revoke_company_invitation($1,$2)", [
          company,
          id,
        ]);
        await assert.rejects(claim(id, true), /invitation_unavailable/);
        await as(other);
        await assert.rejects(
          db.query("select public.finish_invitation_email($1,$2,'queued')", [
            company,
            first.attempt_id,
          ]),
          /permission_denied/,
        );
        await as(owner);
      },
    );
    await t.test(
      "company cap counts all attempts, and anonymous callers cannot send",
      async () => {
        const bulk = await invite("quota@example.test");
        await db.exec("reset role");
        await db.query(
          "insert into public.invitation_email_attempts(company_id,invitation_id,requested_by,created_at) select $1,$2,$3,now()-interval '10 minutes' from generate_series(1,50)",
          [company, bulk, owner],
        );
        await as(owner);
        const another = await invite("another@example.test");
        await assert.rejects(claim(another), /mail_rate_limited/);
        await db.exec("reset role;set role anon");
        await assert.rejects(claim(another), /permission denied/);
      },
    );
  } finally {
    await db.close();
  }
});
