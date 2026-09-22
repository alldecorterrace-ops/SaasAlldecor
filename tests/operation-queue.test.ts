import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import {
  operationError,
  readOperationInput,
  sameOriginRequest,
} from "../src/lib/operation-queue";

test("operation HTTP input rejects extra authority/actor, foreign origin and oversized bodies", async () => {
  const make = (body: unknown, headers = {}) =>
    new Request("https://app.example.test/api/operations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.example.test",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const input = {
    id: randomUUID(),
    action: "customer.save",
    payload: { name: "Synthetic" },
  };
  assert.deepEqual(await readOperationInput(make(input)), input);
  assert.equal(
    sameOriginRequest(make(input), "https://app.example.test"),
    true,
  );
  assert.equal(
    sameOriginRequest(
      make(input, { origin: "https://foreign.example.test" }),
      "https://app.example.test",
    ),
    false,
  );
  assert.equal(sameOriginRequest(make(input), undefined), false);
  await assert.rejects(
    readOperationInput(make({ ...input, actorId: randomUUID() })),
  );
  await assert.rejects(
    readOperationInput(
      make(
        { ...input, payload: { text: "ü".repeat(32768) } },
        { "content-length": "1" },
      ),
    ),
  );
  await assert.rejects(
    readOperationInput(make(input, { "content-type": "text/plain" })),
  );
  assert.equal(operationError("42501").status, 403);
  assert.equal(operationError("23505").status, 409);
  assert.equal(operationError("secret provider detail").status, 503);
});

test("durable queue isolates tenants, captures actor, and never replays ambiguous effects", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    member = randomUUID(),
    outsider = randomUUID();
  const company = randomUUID(),
    foreign = randomUUID();
  const requestId = randomUUID(),
    revoked = randomUUID(),
    uncertain = randomUUID();
  const payload = {
    recordId: randomUUID(),
    version: 0,
    data: { full_name: "Synthetic queue record" },
  };
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const submit = (id = requestId, data = payload) =>
    db.query<{ result: { id: string; status: string; replayed: boolean } }>(
      "select public.enqueue_operation($1,$2,'customer.save',$3) result",
      [company, id, JSON.stringify(data)],
    );
  try {
    for (const [uid, email] of [
      [owner, "queue-owner@example.test"],
      [member, "queue-member@example.test"],
      [outsider, "queue-outside@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [
        uid,
        email,
      ]);
    await as(owner);
    await db.query("select public.create_company($1,'Queue A')", [company]);
    await db.query(
      "select public.add_company_member($1,'queue-member@example.test')",
      [company],
    );
    await db.query("select public.set_member_access($1,$2,'member',true,$3)", [
      company,
      member,
      JSON.stringify({ clientes: ["read", "write"] }),
    ]);
    await as(outsider);
    await db.query("select public.create_company($1,'Queue B')", [foreign]);

    await t.test(
      "no implicit activation, no handlers and no direct access",
      async () => {
        await as(owner);
        assert.equal(
          (
            await db.query<{ result: { phase: string } }>(
              "select public.get_transition_status($1) result",
              [company],
            )
          ).rows[0].result.phase,
          "disabled",
        );
        await assert.rejects(submit(), /permission_denied/);
        await assert.rejects(
          db.query("select * from app_private.operation_requests"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select app_private.claim_operation($1,'adt',1)", [company]),
          /permission denied/,
        );
        await db.exec("reset role; set role anon");
        await assert.rejects(
          db.query("select public.get_transition_status($1)", [company]),
          /permission denied/,
        );
        await db.exec("reset role");
        await db.exec(
          "insert into app_private.operation_handlers values('customer.save','clientes','adt',false)",
        );
        await as(owner);
        await assert.rejects(submit(), /queue_unavailable/);
      },
    );

    await t.test(
      "verified test adapter and explicit acceptance are required",
      async () => {
        await db.exec("reset role");
        await db.query(
          "insert into app_private.transition_controls(company_id,phase) values($1,'accepting')",
          [company],
        );
        await as(owner);
        await assert.rejects(submit(), /queue_unavailable/);
        await db.exec(
          "reset role; insert into app_private.operation_adapters values('customer.save','adt',true,repeat('a',64))",
        );
        await as(owner);
        assert.equal((await submit()).rows[0].result.replayed, false);
        assert.equal((await submit()).rows[0].result.replayed, true);
        await assert.rejects(
          submit(requestId, { ...payload, version: 1 }),
          /request_conflict/,
        );
      },
    );

    await t.test(
      "company, actor and current permissions protect status and payload",
      async () => {
        await as(outsider);
        await assert.rejects(submit(), /permission_denied/);
        assert.equal(
          (
            await db.query<{ result: unknown }>(
              "select public.get_operation_status($1,$2) result",
              [company, requestId],
            )
          ).rows[0].result,
          null,
        );
        await as(member);
        await assert.rejects(submit(), /request_conflict/);
        assert.equal(
          (
            await db.query<{ result: unknown }>(
              "select public.get_operation_status($1,$2) result",
              [company, requestId],
            )
          ).rows[0].result,
          null,
        );
        await assert.rejects(
          db.query("select public.pause_operation_queue($1)", [company]),
          /permission_denied/,
        );
        await as(owner);
        const status = (
          await db.query<{ result: Record<string, unknown> }>(
            "select public.get_operation_status($1,$2) result",
            [company, requestId],
          )
        ).rows[0].result;
        assert.equal(status.status, "queued");
        assert.equal("payload" in status, false);
        assert.equal("claimToken" in status, false);
      },
    );

    await t.test(
      "claim is exclusive and requires matching authority and epoch",
      async () => {
        await db.exec("reset role");
        for (const [authority, epoch] of [
          ["saas", 1],
          ["adt", 2],
        ])
          assert.equal(
            (
              await db.query<{ r: unknown }>(
                "select app_private.claim_operation($1,$2,$3) r",
                [company, authority, epoch],
              )
            ).rows[0].r,
            null,
          );
        const claim = (
          await db.query<{
            r: { claimToken: string; id: string; actorId: string };
          }>("select app_private.claim_operation($1,'adt',1) r", [company])
        ).rows[0].r;
        assert.equal(claim.id, requestId);
        assert.equal(claim.actorId, owner);
        assert.equal(
          (
            await db.query<{ r: unknown }>(
              "select app_private.claim_operation($1,'adt',1) r",
              [company],
            )
          ).rows[0].r,
          null,
        );
        await assert.rejects(
          db.query(
            "select app_private.complete_operation($1,$2,$3,'succeeded','test-result','completed')",
            [company, requestId, randomUUID()],
          ),
          /claim_conflict/,
        );
        for (let n = 0; n < 2; n++)
          await db.query(
            "select app_private.complete_operation($1,$2,$3,'succeeded','test-result','completed')",
            [company, requestId, claim.claimToken],
          );
        await assert.rejects(
          db.query(
            "select app_private.complete_operation($1,$2,$3,'rejected',null,'failed')",
            [company, requestId, claim.claimToken],
          ),
          /result_conflict/,
        );
        assert.equal(
          (
            await db.query(
              "select * from app_private.operation_events where request_id=$1 and status='succeeded'",
              [requestId],
            )
          ).rows.length,
          1,
        );
      },
    );

    await t.test(
      "revocation between receipt and execution prevents the operation",
      async () => {
        await as(member);
        await submit(revoked);
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,'{}')",
          [company, member],
        );
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ r: unknown }>(
              "select app_private.claim_operation($1,'adt',1) r",
              [company],
            )
          ).rows[0].r,
          null,
        );
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from app_private.operation_requests where id=$1",
              [revoked],
            )
          ).rows[0].status,
          "rejected",
        );
        await as(member);
        assert.equal(
          (
            await db.query<{ r: unknown }>(
              "select public.get_operation_status($1,$2) r",
              [company, revoked],
            )
          ).rows[0].r,
          null,
        );
      },
    );

    await t.test(
      "a stalled effect goes to review and is not automatically reclaimed",
      async () => {
        await as(owner);
        await submit(uncertain);
        await db.exec("reset role");
        const claim = (
          await db.query<{ r: { claimToken: string } }>(
            "select app_private.claim_operation($1,'adt',1) r",
            [company],
          )
        ).rows[0].r;
        await db.query(
          "update app_private.operation_requests set claimed_at=now()-interval '16 minutes' where id=$1",
          [uncertain],
        );
        await db.query("select app_private.flag_stalled_operations($1)", [
          company,
        ]);
        assert.equal(
          (
            await db.query<{ r: unknown }>(
              "select app_private.claim_operation($1,'adt',1) r",
              [company],
            )
          ).rows[0].r,
          null,
        );
        await assert.rejects(
          db.query(
            "select app_private.complete_operation($1,$2,$3,'succeeded','late-response','completed')",
            [company, uncertain, claim.claimToken],
          ),
          /result_conflict/,
        );
        await as(owner);
        assert.equal((await submit(uncertain)).rows[0].result.status, "review");
        assert.equal(
          (
            await db.query<{ r: { status: string } }>(
              "select public.get_operation_status($1,$2) r",
              [company, uncertain],
            )
          ).rows[0].r.status,
          "review",
        );
      },
    );

    await t.test(
      "draining holds requests received after the cut; no switch is exposed",
      async () => {
        await as(owner);
        await db.query("select public.pause_operation_queue($1)", [company]);
        assert.equal(
          (await submit(randomUUID())).rows[0].result.status,
          "queued",
        );
        const state = (
          await db.query<{
            r: { phase: string; cutoverAvailable: boolean; authority: string };
          }>("select public.get_transition_status($1) r", [company])
        ).rows[0].r;
        assert.equal(state.phase, "draining");
        assert.equal(state.authority, "adt");
        assert.equal(state.cutoverAvailable, false);
        await db.exec("reset role");
        assert.equal(
          (
            await db.query(
              "select sequence from app_private.transition_events where company_id=$1",
              [company],
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query<{ r: unknown }>(
              "select app_private.claim_operation($1,'adt',1) r",
              [company],
            )
          ).rows[0].r,
          null,
        );
        assert.equal(
          (
            await db.query(
              "select id from public.customers where company_id=$1",
              [company],
            )
          ).rows.length,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
