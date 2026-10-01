import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { receiptReviewFixture } from "./helpers/receipt-review-fixture";
import {
  compareReceipt,
  receiptExtractionSchema,
  receiptReviewHistorySchema,
  type ReceiptExtraction,
  type ReceiptReviewContext,
} from "../src/lib/receipt-review";
import {
  extractReceipt,
  receiptProviderConfig,
  ReceiptProviderError,
} from "../src/lib/receipt-review-provider";
import { externalEffectsAllowed } from "../src/lib/deployment-environment";
const extraction: ReceiptExtraction = {
  es_recibo: true,
  legible: true,
  comercio: "QA synthetic merchant",
  direccion_comercio: "Synthetic address",
  fecha: "2026-10-01",
  total: 100,
  subtotal: 90,
  impuesto: 10,
  moneda: "USD",
  numero_factura: "QA-123",
  metodo_pago: "cash",
  tarjeta_ult4: "",
};
test("receipt extraction rejects model approval, missing fields and non-finite amounts", () => {
  for (const p of [
    { approve: true },
    { total: Infinity },
    { es_recibo: "true" },
  ])
    assert(!receiptExtractionSchema.safeParse({ ...extraction, ...p }).success);
  assert(!receiptExtractionSchema.safeParse({ es_recibo: true }).success);
});
test("receipt provider test bank is opt-in, tenant-bound and keeps general staging sends blocked", () => {
  const company = randomUUID(),
    ref = "ejeuxzukutzzlbzjnyio";
  const env = {
    APP_ENVIRONMENT: "staging",
    STAGING_SUPABASE_PROJECT_REF: ref,
    NEXT_PUBLIC_SUPABASE_URL: "https://" + ref + ".supabase.co",
    NEXT_PUBLIC_SITE_URL: "https://staging.alldecorpatio.com",
    RECEIPT_REVIEW_ENABLED: "true",
    RECEIPT_REVIEW_SUPABASE_SERVICE_KEY: "synthetic-private-key",
    RECEIPT_AI_OPENAI_API_KEY: "synthetic-key",
    RECEIPT_AI_OPENAI_MODEL: "synthetic-model",
  };
  assert.deepEqual(receiptProviderConfig(env, company), []);
  const bank = {
    ...env,
    STAGING_RECEIPT_AI_TEST_ENABLED: "true",
    STAGING_RECEIPT_AI_TEST_COMPANIES: company,
  };
  assert.equal(receiptProviderConfig(bank, company).length, 1);
  assert.equal(externalEffectsAllowed(bank), false);
  for (const p of [
    { STAGING_RECEIPT_AI_TEST_COMPANIES: randomUUID() },
    { NEXT_PUBLIC_SUPABASE_URL: "https://loqbmrlkhskqzozknehx.supabase.co" },
    { INVITATION_MAIL_ENABLED: "true" },
    { OPENAI_API_KEY: "bad" },
    { RECEIPT_REVIEW_SUPABASE_SERVICE_KEY: "" },
    { RECEIPT_REVIEW_ENABLED: "false" },
  ])
    assert.deepEqual(receiptProviderConfig({ ...bank, ...p }, company), []);
});
test("provider contract extracts without declaration, strips full PAN and fails over without exposing errors", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fake: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init!.body)) });
    if (String(url).includes("anthropic"))
      return new Response("synthetic-private-provider-error", { status: 503 });
    return Response.json({
      status: "completed",
      id: "resp_synthetic",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                ...extraction,
                tarjeta_ult4: "0000 0000 0000 1234",
              }),
            },
          ],
        },
      ],
    });
  };
  const value = await extractReceipt(
    [
      { name: "anthropic", key: "synthetic-key", model: "synthetic-primary" },
      { name: "openai", key: "synthetic-key", model: "synthetic-fallback" },
    ],
    new Uint8Array([1, 2, 3]).buffer,
    "image/png",
    fake,
  );
  assert.equal(value.provider, "openai");
  assert.equal(value.data.tarjeta_ult4, "1234");
  assert.equal(calls.length, 2);
  assert(!JSON.stringify(calls).includes("declared"));
  assert.equal(calls[1].body.store, false);
  const failed: typeof fetch = async () =>
    Response.json({
      status: "completed",
      id: "resp_synthetic",
      output: [
        {
          content: [{ type: "refusal", refusal: "synthetic-private-refusal" }],
        },
      ],
    });
  await assert.rejects(
    extractReceipt(
      [{ name: "openai", key: "synthetic-key", model: "synthetic" }],
      new Uint8Array([1]).buffer,
      "image/png",
      failed,
    ),
    (error: unknown) =>
      error instanceof ReceiptProviderError &&
      error.message === "invalid_extraction",
  );
});
test("durable receipt review preserves versions, permissions, history and financial separation", async (t) => {
  const { db } = await fullDatabase();
  const f = await receiptReviewFixture(db);
  const finish = async (
    e: { company: string },
    j: { job: string; claim?: string },
    context: ReceiptReviewContext,
    result: ReturnType<typeof compareReceipt>,
    error: string | null = null,
  ) => {
    await f.as("", "service_role");
    return (
      await db.query<{
        data: { status: string; version: number; expense_status?: string };
      }>(
        "select finish_workforce_receipt_review($1,$2,$3,$4,$5,'synthetic-reference','source-reference-v4','synthetic-request',$6) data",
        [e.company, j.job, j.claim, context, result, error],
      )
    ).rows[0].data;
  };
  const analyzed = async (
    e: { id: string; company: string },
    version = 1,
    patch: Partial<ReceiptExtraction> = {},
  ) => {
    await f.as(f.owner);
    const j = await f.prepare(e, version);
    const c = await f.context(e.company, j.job);
    const v = compareReceipt(
      { ...extraction, fecha: f.day, numero_factura: e.id, ...patch },
      c,
    );
    return { j, c, v };
  };
  try {
    await t.test(
      "only managers start/confirm; clients cannot forge results or read private jobs",
      async () => {
        const e = await f.create();
        for (const who of [f.worker.user, f.office.user]) {
          await f.as(who);
          await assert.rejects(f.prepare(e), /receipt_review_forbidden/);
        }
        await f.as(f.owner);
        await assert.rejects(
          db.query("select prepare_workforce_receipt_review($1,$2,$3,1)", [
            f.b,
            randomUUID(),
            e.id,
          ]),
          /receipt_review_forbidden/,
        );
        const j = await f.prepare(e),
          c = await f.context(e.company, j.job);
        await assert.rejects(
          db.query(
            "select finish_workforce_receipt_review($1,$2,$3,$4,$5,'openai','synthetic','synthetic',null)",
            [
              e.company,
              j.job,
              j.claim,
              c,
              compareReceipt({ ...extraction, fecha: f.day }, c),
            ],
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from app_private.workforce_receipt_reviews"),
          /permission denied/,
        );
        const result = (
          await db.query<{ data: Record<string, unknown>[] }>(
            "select workforce_receipt_reviews($1,$2) data",
            [e.company, [e.id]],
          )
        ).rows[0].data;
        assert.equal(result.length, 1);
        assert(!("claim" in result[0]));
        assert(!("snapshot" in result[0]));
      },
    );
    await t.test(
      "replay and a concurrent intent get one claim; changed intent conflicts",
      async () => {
        const e = await f.create();
        await f.as(f.owner);
        const request = randomUUID(),
          j = await f.prepare(e, 1, request);
        assert(j.claimed && j.claim);
        const replay = await f.prepare(e, 1, request);
        assert(!replay.claimed && !replay.claim);
        assert.equal(replay.job, j.job);
        const other = await f.prepare(e, 2);
        assert(!other.claimed);
        assert.equal(other.job, j.job);
        await assert.rejects(f.prepare(e, 2, request), /request_conflict/);
        assert.equal((await f.row(e.id)).version, 2);
      },
    );
    await t.test(
      "matching result awaits human review; confirmation and replay never approve or pay",
      async () => {
        const e = await f.create();
        await db.exec("reset role");
        await db.query(
          "insert into time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,source,created_by,updated_by) values($1,$2,$3,$4,now()-interval '1 hour',now(),'MANUAL',$5,$5)",
          [randomUUID(), f.a, f.worker.id, f.project, f.owner],
        );
        const { j, c, v } = await analyzed(e);
        assert.equal(v.state, "OK");
        await finish(e, j, c, v);
        await f.as(f.owner);
        receiptReviewHistorySchema.parse(
          (
            await db.query<{ data: unknown }>(
              "select workforce_receipt_reviews($1,$2) data",
              [e.company, [e.id]],
            )
          ).rows[0].data,
        );
        let saved = await f.row(e.id);
        assert.equal(saved.status, "SUBMITTED");
        assert.equal(saved.admin_review_status, "PENDING");
        assert.equal(saved.version, 3);
        await f.as(f.owner);
        const request = randomUUID();
        await db.query(
          "select confirm_workforce_receipt_review($1,$2,$3,3,$4,'Synthetic human visual review')",
          [e.company, request, e.id, j.job],
        );
        await db.query(
          "select confirm_workforce_receipt_review($1,$2,$3,3,$4,'Synthetic human visual review')",
          [e.company, request, e.id, j.job],
        );
        saved = await f.row(e.id);
        assert.equal(saved.version, 4);
        assert.equal(saved.status, "SUBMITTED");
        assert.equal(saved.admin_reviewed_by, f.owner);
        assert(saved.admin_reviewed_at);
        const before = JSON.stringify(saved);
        await finish(e, j, c, v);
        await f.as(f.owner);
        receiptReviewHistorySchema.parse(
          (
            await db.query<{ data: unknown }>(
              "select workforce_receipt_reviews($1,$2) data",
              [e.company, [e.id]],
            )
          ).rows[0].data,
        );
        assert.equal(JSON.stringify(await f.row(e.id)), before);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from payments",
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "correction during extraction makes response stale and retains manual correction",
      async () => {
        const e = await f.create(),
          { j, c, v } = await analyzed(e);
        await db.query(
          "select correct_workforce_expense($1,$2,$3,2,$4,false,$5,101,'TOOLS','Corrected synthetic receipt','empresa',$6,'Synthetic visual correction')",
          [e.company, randomUUID(), e.id, f.project, f.day, e.receipt],
        );
        const original = await f.row(e.id);
        assert.equal(original.receipt_review_id, null);
        assert.equal((await finish(e, j, c, v)).status, "STALE");
        assert.deepEqual(await f.row(e.id), original);
        await f.as(f.owner);
        const history = (
          await db.query<{ data: Record<string, unknown>[] }>(
            "select workforce_receipt_reviews($1,$2) data",
            [e.company, [e.id]],
          )
        ).rows[0].data;
        assert.equal(history[0].status, "STALE");
        assert.equal(history[0].current, false);
        assert.equal(original.admin_review_status, "REVIEWED");
      },
    );

    await t.test(
      "human confirmation rejects changed workdays and cached evidence stays immutable",
      async () => {
        const e = await f.create(),
          a = await analyzed(e);
        await finish(e, a.j, a.c, a.v);
        await db.exec("reset role");
        const original = (
          await db.query<{ result: unknown }>(
            "select result from app_private.workforce_receipt_reviews where id=$1",
            [a.j.job],
          )
        ).rows[0].result;
        await db.query(
          "update time_entries set status='ANULADO' where company_id=$1",
          [f.a],
        );
        await f.as(f.owner);
        await assert.rejects(
          db.query(
            "select confirm_workforce_receipt_review($1,$2,$3,3,$4,'Synthetic human check')",
            [e.company, randomUUID(), e.id, a.j.job],
          ),
          /receipt_review_stale/,
        );
        const history = (
          await db.query<{ data: { current: boolean }[] }>(
            "select workforce_receipt_reviews($1,$2) data",
            [e.company, [e.id]],
          )
        ).rows[0].data;
        assert.equal(history[0].current, false);
        const next = await f.prepare(e, 3);
        assert(next.claimed);
        assert.notEqual(next.job, a.j.job);
        await db.exec("reset role");
        assert.deepEqual(
          (
            await db.query<{ result: unknown }>(
              "select result from app_private.workforce_receipt_reviews where id=$1",
              [a.j.job],
            )
          ).rows[0].result,
          original,
        );
        await db.query(
          "update time_entries set status='PENDIENTE' where company_id=$1",
          [f.a],
        );
      },
    );
    await t.test(
      "lost execution expires once and requires a fresh request",
      async () => {
        const e = await f.create();
        await f.as(f.owner);
        const request = randomUUID(),
          j = await f.prepare(e, 1, request);
        await db.exec("reset role");
        await db.query(
          "update app_private.workforce_receipt_reviews set lease_until=clock_timestamp()-interval '1 second' where id=$1",
          [j.job],
        );
        await f.as(f.owner);
        const replay = await f.prepare(e, 1, request);
        assert(!replay.claimed);
        assert.equal(replay.job, j.job);
        const next = await f.prepare(e, 2);
        assert(next.claimed);
        assert.notEqual(next.job, j.job);
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ error_code: string }>(
              "select error_code from app_private.workforce_receipt_reviews where id=$1",
              [j.job],
            )
          ).rows[0].error_code,
          "review_timeout",
        );
      },
    );
    await t.test(
      "already approved expense stays approved and workers cannot confirm",
      async () => {
        const e = await f.create();
        await db.exec("reset role");
        await db.query(
          "update workforce_expenses set status='OFFICE_APPROVED',foreman_by=$2,foreman_at=now(),office_by=$2,office_at=now() where id=$1",
          [e.id, f.owner],
        );
        const a = await analyzed(e);
        await finish(e, a.j, a.c, a.v);
        assert.equal((await f.row(e.id)).status, "OFFICE_APPROVED");
        await f.as(f.worker.user);
        await assert.rejects(
          db.query(
            "select confirm_workforce_receipt_review($1,$2,$3,3,$4,'Synthetic human check')",
            [e.company, randomUUID(), e.id, a.j.job],
          ),
          /receipt_review_forbidden/,
        );
        await f.as(f.owner);
        await db.query(
          "select confirm_workforce_receipt_review($1,$2,$3,3,$4,'Synthetic human check')",
          [e.company, randomUUID(), e.id, a.j.job],
        );
        const saved = await f.row(e.id);
        assert.equal(saved.status, "OFFICE_APPROVED");
        assert.equal(saved.amount, "100.00");
      },
    );
    await t.test("workday changes reject an obsolete comparison", async () => {
      const e = await f.create(),
        { j, c, v } = await analyzed(e);
      await db.exec("reset role");
      await db.query(
        "update time_entries set status='ANULADO' where company_id=$1",
        [f.a],
      );
      const original = await f.row(e.id);
      assert.equal((await finish(e, j, c, v)).status, "STALE");
      assert.deepEqual(await f.row(e.id), original);
    });
    await t.test(
      "receipt errors are durable and a lost response cannot silently retry a provider",
      async () => {
        const e = await f.create(),
          { j, c, v } = await analyzed(e);
        assert.equal(
          (await finish(e, j, c, v, "provider_unavailable")).status,
          "ERROR",
        );
        await f.as(f.owner);
        const retry = await f.prepare(e, 2);
        assert(retry.claimed);
        assert.notEqual(retry.job, j.job);
        assert.equal((await finish(e, j, c, v)).status, "ERROR");
      },
    );
    await t.test(
      "revoked manager cannot replay and late result cannot modify the expense",
      async () => {
        const e = await f.create();
        await f.as(f.otherOwner);
        const req = randomUUID(),
          j = await f.prepare(e, 1, req),
          c = await f.context(e.company, j.job),
          v = compareReceipt({ ...extraction, fecha: f.day }, c);
        await f.as(f.owner);
        await db.query("select set_member_access($1,$2,'member',false,'{}')", [
          f.a,
          f.otherOwner,
        ]);
        await f.as(f.otherOwner);
        await assert.rejects(f.prepare(e, 1, req), /receipt_review_forbidden/);
        const original = await f.row(e.id);
        assert.equal((await finish(e, j, c, v)).status, "STALE");
        assert.deepEqual(await f.row(e.id), original);
      },
    );
    await t.test(
      "a mismatch returns once; the second mismatch requires administration",
      async () => {
        const e = await f.create(),
          first = await analyzed(e);
        assert.equal(first.v.state, "DUDA");
        assert.equal(
          (await finish(e, first.j, first.c, first.v)).expense_status,
          "NEEDS_CORRECTION",
        );
        await f.as(f.worker.user);
        await db.query(
          "select resubmit_workforce_expense($1,$2,$3,3,$4,false,$5,100,'MATERIALS','Synthetic receipt','propio',$6)",
          [f.a, randomUUID(), e.id, f.project, f.day, e.receipt],
        );
        const submitted = await f.row(e.id);
        assert.equal(submitted.receipt_review_id, null);
        assert.equal(submitted.resubmission_count, 1);
        const second = await analyzed(e, 4);
        const done = await finish(e, second.j, second.c, second.v);
        assert.equal(done.expense_status, "SUBMITTED");
        const saved = await f.row(e.id);
        assert.equal(saved.receipt_review_attention, "ADMIN_CORRECTION");
        assert.equal(saved.resubmission_count, 1);
      },
    );
    await t.test(
      "duplicate checks stay within the company and preserve original evidence",
      async () => {
        const first = await f.create(f.a, f.worker, f.project, "d".repeat(64)),
          p = await analyzed(first);
        await finish(first, p.j, p.c, p.v);
        await db.exec("reset role");
        const original = (
          await db.query<{ result: unknown }>(
            "select result from app_private.workforce_receipt_reviews where id=$1",
            [p.j.job],
          )
        ).rows[0].result;
        const second = await f.create(f.a, f.worker, f.project, "d".repeat(64)),
          q = await analyzed(second);
        await finish(second, q.j, q.c, q.v);
        await db.exec("reset role");
        const result = (
          await db.query<{ result: { duplicate_of: string } }>(
            "select result from app_private.workforce_receipt_reviews where id=$1",
            [q.j.job],
          )
        ).rows[0].result;
        assert.equal(result.duplicate_of, first.id);
        assert.deepEqual(
          (
            await db.query<{ result: unknown }>(
              "select result from app_private.workforce_receipt_reviews where id=$1",
              [p.j.job],
            )
          ).rows[0].result,
          original,
        );
        const foreign = await f.create(
            f.b,
            f.foreignWorker,
            f.foreignProject,
            "d".repeat(64),
          ),
          r = await analyzed(foreign);
        await finish(foreign, r.j, r.c, r.v);
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ result: { duplicate_of: string | null } }>(
              "select result from app_private.workforce_receipt_reviews where id=$1",
              [r.j.job],
            )
          ).rows[0].result.duplicate_of,
          null,
        );
        await f.as(f.worker.user);
        await assert.rejects(
          db.query("select workforce_receipt_reviews($1,$2) data", [
            f.b,
            [foreign.id],
          ]),
          /permission_denied/,
        );
      },
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int n from payments"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int n from expenses"))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
