import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";

test("transition requires a drained checkpoint and fresh private evidence", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const asOwner = async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
  };
  const admin = () => db.exec("reset role");
  const payload = (version = 0, id = randomUUID()) => ({
    recordId: id,
    version,
    data: { full_name: "Synthetic queue customer", status: "active" },
  });
  const enqueue = async (body = payload()) => {
    const id = randomUUID();
    await asOwner();
    await db.query(
      "select public.enqueue_operation($1,$2,'customer.save',$3)",
      [company, id, JSON.stringify(body)],
    );
    return id;
  };
  const finish = (id: string) =>
    db.query("select app_private.finalize_adt_transition($1,$2)", [
      company,
      id,
    ]);
  const execute = () =>
    db.query<{ r: { status: string } | null }>(
      "select app_private.execute_saas_customer_operation($1,2) r",
      [company],
    );
  try {
    await db.query(
      "insert into auth.users values($1,'checkpoint-owner@example.test',now())",
      [owner],
    );
    await asOwner();
    for (const id of [company, foreign])
      await db.query(
        "select public.create_company($1,'Synthetic checkpoint')",
        [id],
      );
    await admin();
    await db.exec(
      "insert into app_private.operation_handlers values('customer.save','clientes','adt',false); insert into app_private.operation_adapters values('customer.save','adt',true,repeat('a',64)),('customer.save','saas',true,repeat('b',64))",
    );
    await db.query(
      "insert into app_private.transition_controls(company_id,phase) values($1,'accepting')",
      [company],
    );
    const early = await enqueue();
    await db.query("select public.pause_operation_queue($1)", [company]);
    const lateBody = payload(),
      late = await enqueue(lateBody);
    await admin();
    const transition = (
      await db.query<{ id: string; cutoff: number }>(
        "select id,cutoff from app_private.transition_sessions where company_id=$1",
        [company],
      )
    ).rows[0];

    await t.test(
      "repeated pause preserves the cut and browser roles cannot finalize or execute",
      async () => {
        await asOwner();
        await db.query("select public.pause_operation_queue($1)", [company]);
        for (const query of [
          "select app_private.finalize_adt_transition($1,$2)",
          "select * from app_private.transition_clearances where transition_id=$2 and $1::uuid is not null",
        ])
          await assert.rejects(
            db.query(query, [company, transition.id]),
            /permission denied/,
          );
        await assert.rejects(execute(), /permission denied/);
        await admin();
        const rows = (
          await db.query<{ id: string; cutoff: number }>(
            "select id,cutoff from app_private.transition_sessions where company_id=$1",
            [company],
          )
        ).rows;
        assert.deepEqual(rows, [transition]);
        await assert.rejects(
          db.query("select app_private.finalize_adt_transition($1,$2)", [
            foreign,
            transition.id,
          ]),
          /transition_conflict/,
        );
      },
    );

    await t.test(
      "missing or expired clearance, in-flight work and uncertain outcomes block switching",
      async () => {
        await assert.rejects(finish(transition.id), /transition_not_cleared/);
        await db.query(
          "insert into app_private.transition_clearances values($1,$2,repeat('a',64),repeat('a',64),repeat('a',64),repeat('a',64),repeat('a',64),now()-interval '20 minutes',now()-interval '10 minutes')",
          [transition.id, owner],
        );
        await assert.rejects(finish(transition.id), /transition_not_cleared/);
        await db.query(
          "update app_private.transition_clearances set verified_at=clock_timestamp(),expires_at=clock_timestamp()+interval '10 minutes' where transition_id=$1",
          [transition.id],
        );
        await assert.rejects(finish(transition.id), /drain_incomplete/);
        const claim = (
          await db.query<{ r: { id: string; claimToken: string } }>(
            "select app_private.claim_operation($1,'adt',1) r",
            [company],
          )
        ).rows[0].r;
        assert.equal(claim.id, early);
        await assert.rejects(finish(transition.id), /drain_incomplete/);
        assert.equal(
          (
            await db.query<{ r: unknown }>(
              "select app_private.claim_operation($1,'adt',1) r",
              [company],
            )
          ).rows[0].r,
          null,
        );
        await db.query(
          "update app_private.operation_requests set status='review' where id=$1",
          [early],
        );
        await assert.rejects(finish(transition.id), /drain_incomplete/);
        // Test fixture only: represents the outcome of independent source reconciliation.
        await db.query(
          "update app_private.operation_requests set status='processing' where id=$1",
          [early],
        );
        await db.query(
          "select app_private.complete_operation($1,$2,$3,'succeeded','synthetic-only','completed')",
          [company, early, claim.claimToken],
        );
        await db.exec(
          "update app_private.operation_adapters set verified=false where authority='saas'",
        );
        await assert.rejects(
          finish(transition.id),
          /adapter_coverage_incomplete/,
        );
        await db.exec(
          "update app_private.operation_adapters set verified=true where authority='saas'",
        );
      },
    );

    await t.test(
      "switch assigns held work once, prevents old authority and creates one atomic effect",
      async () => {
        await finish(transition.id);
        await finish(transition.id);
        assert.equal(
          (
            await db.query<{ r: unknown }>(
              "select app_private.claim_operation($1,'adt',1) r",
              [company],
            )
          ).rows[0].r,
          null,
        );
        assert.equal((await execute()).rows[0].r?.status, "succeeded");
        const effect = (
          await db.query<{
            entity_id: string;
            before_data: unknown;
            entity_version: number;
          }>(
            "select entity_id,before_data,entity_version from app_private.operation_effects where company_id=$1 and request_id=$2",
            [company, late],
          )
        ).rows[0];
        assert.equal(effect.entity_id, lateBody.recordId);
        assert.equal(effect.before_data, null);
        assert.equal(effect.entity_version, 1);
        assert.equal((await execute()).rows[0].r, null);
        await asOwner();
        const replay = (
          await db.query<{ r: { replayed: boolean; status: string } }>(
            "select public.enqueue_operation($1,$2,'customer.save',$3) r",
            [company, late, JSON.stringify(lateBody)],
          )
        ).rows[0].r;
        assert.deepEqual(replay, {
          id: late,
          replayed: true,
          status: "succeeded",
        });
      },
    );

    await t.test(
      "stale version rejects without effect; unexpected failure rolls claim back",
      async () => {
        const rejected = await enqueue(payload(0, lateBody.recordId));
        await admin();
        assert.equal((await execute()).rows[0].r?.status, "rejected");
        assert.equal(
          (
            await db.query(
              "select * from app_private.operation_effects where request_id=$1",
              [rejected],
            )
          ).rows.length,
          0,
        );
        // Exercise PT409, not only the duplicate-insert 23505 path above.
        const versionConflict = await enqueue(payload(99, lateBody.recordId));
        await admin();
        assert.equal((await execute()).rows[0].r?.status, "rejected");
        assert.equal(
          (
            await db.query(
              "select * from app_private.operation_effects where request_id=$1",
              [versionConflict],
            )
          ).rows.length,
          0,
        );
        const next = await enqueue();
        await admin();
        await db.exec(
          "create function app_private.fixture_crash() returns trigger language plpgsql as $$ begin raise exception 'synthetic_crash'; end $$; create trigger fixture_crash before insert on app_private.operation_effects for each row execute function app_private.fixture_crash()",
        );
        await assert.rejects(execute(), /synthetic_crash/);
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from app_private.operation_requests where id=$1",
              [next],
            )
          ).rows[0].status,
          "queued",
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from public.customers where company_id=$1",
              [company],
            )
          ).rows[0].n,
          1,
        );
        await db.exec(
          "drop trigger fixture_crash on app_private.operation_effects; drop function app_private.fixture_crash()",
        );
        assert.equal((await execute()).rows[0].r?.status, "succeeded");
      },
    );
  } finally {
    await db.close();
  }
});
