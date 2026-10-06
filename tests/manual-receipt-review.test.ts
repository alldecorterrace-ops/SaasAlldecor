import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { reimbursementFixture } from "./helpers/reimbursement-fixture";
import {
  manualReceiptReviewSchema,
  reviewReceiptManually,
} from "../src/lib/manual-receipt-review";
import { downloadWorkforceReceipt } from "../src/lib/workforce-receipt-download";
import { jpeg } from "./helpers/product-raster-fixtures";
import {
  canAccess,
  workspaceModules,
  type Membership,
} from "../src/lib/modules";

test("scope excludes AI for all application roles while keeping 20 business modules", () => {
  assert.equal(workspaceModules.length, 20);
  assert.ok(!workspaceModules.map<string>((m) => m.id).includes("ia"));
  for (const role of ["owner", "admin", "member"] as const)
    assert.equal(
      canAccess(
        {
          company_id: "synthetic",
          user_id: "synthetic",
          email: "qa@example.test",
          active: true,
          role,
          permissions: { ia: ["write"] },
        } as Membership,
        "ia",
        "write",
      ),
      false,
    );
});
test("manual review explicitly requires visual attestation and note", () => {
  const v = {
    id: randomUUID(),
    request: randomUUID(),
    version: 1,
    note: "Comprobado visualmente",
    reviewed_visually: "on",
  };
  assert.ok(manualReceiptReviewSchema.safeParse(v).success);
  assert.ok(
    !manualReceiptReviewSchema.safeParse({ ...v, reviewed_visually: undefined })
      .success,
  );
  assert.ok(!manualReceiptReviewSchema.safeParse({ ...v, note: "ok" }).success);
});
test("manual receipt review preserves expenses, reimbursement separation and authority", async (t) => {
  const { db } = await fullDatabase();
  try {
    const f = await reimbursementFixture(db);
    const review = async (
      e: { id: string },
      version: number,
      request = randomUUID(),
      note = "Synthetic visual verification; no payment",
    ) =>
      (
        await db.query<{ data: { version: number } }>(
          "select review_workforce_receipt_manually($1,$2,$3,$4,$5) data",
          [f.a, request, e.id, version, note],
        )
      ).rows[0].data;
    const row = async (id: string) =>
      (
        await db.query<Record<string, unknown>>(
          "select * from workforce_expenses where id=$1",
          [id],
        )
      ).rows[0];
    const current = async (id: string) =>
      (
        await db.query<{ v: boolean }>(
          "select app_private.workforce_review_is_current($1,$2) v",
          [f.a, id],
        )
      ).rows[0].v;
    await t.test(
      "review without AI changes only the review and version, not business fields",
      async () => {
        const e = await f.create();
        await f.as(f.owner);
        const before = await row(e.id),
          r = await review(e, 1),
          after = await row(e.id);
        assert.equal(r.version, 2);
        assert.equal(await current(e.id), true);
        for (const k of [
          "amount",
          "expense_at",
          "worker_id",
          "project_id",
          "pay_method",
          "status",
          "foreman_at",
          "office_at",
          "reimbursed_at",
          "receipt_id",
          "allocation",
        ])
          assert.deepEqual(after[k], before[k], k);
        assert.deepEqual(
          (
            await db.query<{ v: unknown[] }>(
              "select workforce_receipt_reviews($1,$2) v",
              [f.a, [e.id]],
            )
          ).rows[0].v,
          [],
        );
      },
    );
    await t.test(
      "retries return one effect and changed request payload is rejected",
      async () => {
        const e = await f.create();
        await f.as(f.owner);
        const request = randomUUID(),
          first = await review(e, 1, request);
        assert.deepEqual(await review(e, 1, request), first);
        assert.equal((await row(e.id)).version, 2);
        await assert.rejects(
          review(e, 1, request, "Different synthetic review note"),
          /request_conflict/,
        );
        await assert.rejects(review(e, 1), /record_conflict/);
      },
    );
    await t.test(
      "workers, office, other companies and revoked admins cannot review or replay",
      async () => {
        const e = await f.create();
        for (const uid of [
          f.worker.user,
          f.office.user,
          f.foreman.user,
          f.foreignWorker.user,
        ]) {
          await f.as(uid);
          await assert.rejects(review(e, 1), /receipt_review_forbidden/);
        }
        await f.as(f.otherOwner);
        const request = randomUUID();
        await review(e, 1, request);
        await f.as(f.owner);
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          f.a,
          f.otherOwner,
          JSON.stringify({ horasfix: ["write"] }),
        ]);
        await f.as(f.otherOwner);
        await assert.rejects(review(e, 1, request), /receipt_review_forbidden/);
        await f.as(f.owner);
      },
    );
    await t.test(
      "missing original storage metadata prevents review",
      async () => {
        const e = await f.create();
        await db.exec("reset role");
        await db.query("delete from storage.objects where name=$1", [
          f.a + "/" + e.id + "/" + e.receipt + ".png",
        ]);
        await f.as(f.owner);
        await assert.rejects(review(e, 1), /receipt_unavailable/);
      },
    );
    await t.test(
      "a changed expense invalidates manual review until reviewed again",
      async () => {
        const e = await f.create();
        await f.as(f.owner);
        await review(e, 1);
        await db.exec("reset role");
        await db.query(
          "update workforce_expenses set amount=101,version=version+1 where id=$1",
          [e.id],
        );
        await f.as(f.owner);
        assert.equal(await current(e.id), false);
        await review(e, 3);
        assert.equal(await current(e.id), true);
        assert.equal((await row(e.id)).amount, "101.00");
      },
    );
    await t.test(
      "review keeps both approvals; reimbursement never duplicates project cost",
      async () => {
        const e = await f.approve("propio", false);
        await f.as(f.owner);
        const before = await row(e.id);
        assert.equal(before.status, "OFFICE_APPROVED");
        await assert.rejects(
          f.record([{ id: e.id, version: e.version }]),
          /reimbursement_review_required/,
        );
        const r = await review(e, e.version),
          after = await row(e.id);
        assert.deepEqual(after.foreman_at, before.foreman_at);
        assert.deepEqual(after.office_at, before.office_at);
        assert.equal(after.status, before.status);
        const sums = async () =>
          (
            await db.query<{ v: string }>(
              "select coalesce(sum(amount),0)::text v from workforce_expenses where project_id=$1 and status='OFFICE_APPROVED'",
              [f.project],
            )
          ).rows[0].v;
        const cost = await sums(),
          payments = (await db.query("select * from payments")).rows,
          expenses = (await db.query("select * from expenses")).rows;
        await f.record([{ id: e.id, version: r.version }]);
        assert.equal(await sums(), cost);
        assert.deepEqual(
          (await db.query("select * from payments")).rows,
          payments,
        );
        assert.deepEqual(
          (await db.query("select * from expenses")).rows,
          expenses,
        );
        await assert.rejects(review(e, r.version + 1), /receipt_review_state/);
      },
    );
  } finally {
    await db.close();
  }
});
test("manual server review verifies original bytes before requesting its database effect", async () => {
  const bytes = Buffer.from(jpeg.split(",")[1], "base64"),
    company = randomUUID(),
    expense = randomUUID(),
    receipt = {
      id: randomUUID(),
      company_id: company,
      expense_id: expense,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      extension: "jpg",
      original_name: "Synthetic.jpg",
    };
  let corrupt = false,
    effects = 0,
    checks = 0;
  const db = {
    rpc: async (name: string) =>
      name === "workforce_expense_receipt"
        ? { data: receipt, error: null }
        : (effects++, { data: { reviewed: true }, error: null }),
    storage: {
      from: () => ({
        download: async () => {
          checks++;
          return {
            data: new Blob([corrupt ? Buffer.from("corrupt") : bytes], {
              type: "image/jpeg",
            }),
            error: null,
          };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const input = {
    id: expense,
    request: randomUUID(),
    version: 1,
    note: "Synthetic visual verification",
    reviewed_visually: "on",
  };
  await reviewReceiptManually(db, company, input);
  assert.equal(effects, 1);
  assert.equal(checks, 1);
  corrupt = true;
  await assert.rejects(reviewReceiptManually(db, company, input));
  assert.equal(effects, 1);
});
test("private review view keeps originals and rejects revoked, corrupted and unauthorized access", async () => {
  const bytes = Buffer.from(jpeg.split(",")[1], "base64"),
    company = randomUUID(),
    expense = randomUUID(),
    receipt = {
      id: randomUUID(),
      company_id: company,
      expense_id: expense,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      extension: "jpg",
      original_name: "Synthetic.jpg",
    };
  let calls = 0,
    revoked = false,
    corrupt = false,
    signedIn = true;
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: signedIn ? {} : null },
        error: null,
      }),
    },
    rpc: async () => ({
      data: revoked && ++calls > 1 ? null : receipt,
      error: null,
    }),
    storage: {
      from: () => ({
        download: async () => ({
          data: new Blob([corrupt ? Buffer.from("bad") : bytes], {
            type: "image/jpeg",
          }),
          error: null,
        }),
      }),
    },
  } as unknown as SupabaseClient;
  const get = () =>
    downloadWorkforceReceipt(
      new Request("https://example.test/receipt?preview=1"),
      company,
      expense,
      async () => db,
    );
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  revoked = true;
  calls = 0;
  assert.equal((await get()).status, 404);
  revoked = false;
  corrupt = true;
  assert.equal((await get()).status, 404);
  corrupt = false;
  signedIn = false;
  assert.equal((await get()).status, 401);
});
