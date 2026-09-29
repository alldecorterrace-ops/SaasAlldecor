import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { identifyReceipt } from "../src/lib/expense-batch-receipts";
import {
  prepareExpenseReceipt,
  verifyExpenseReceipt,
  singleReceiptError,
} from "../src/lib/expense-single-receipts";
import { uploadIndividualExpenseReceipt } from "../src/lib/expense-receipt-upload";
test("individual receipts preserve financial data, retry durably and share duplicate protection with batches", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    other = randomUUID(),
    staff = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const row = () => ({
    id: randomUUID(),
    project_id: null,
    worker_id: null,
    expense_date: "2026-09-29",
    category: "Materiales",
    description: "QA individual",
    vendor: "QA",
    document_number: randomUUID(),
    amount: "2.34",
    method: "ZELLE",
    payer: "EMPRESA",
  });
  const rows = [row(), row()];
  const prepare = async (
    id: string,
    v: number,
    hash: string,
    extension = "png",
    co = company,
  ) =>
    (
      await db.query<{ id: string }>(
        "select (public.prepare_expense_receipt($1,$2,$3,$4,600,$5)).*",
        [co, id, v, hash, extension],
      )
    ).rows[0].id;
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const attach = async (
    id: string,
    v: number,
    request: string,
    receipt: string | null,
    co = company,
  ) =>
    (
      await db.query<{ v: number }>(
        "select public.set_prepared_expense_receipt($1,$2,$3,$4,$5) v",
        [co, id, v, request, receipt],
      )
    ).rows[0].v;
  const read = async (id: string) =>
    (
      await db.query<{
        version: number;
        status: string;
        amount: string;
        receipt_sha256: string | null;
        receipt_path: string | null;
      }>("select * from public.expenses where id=$1", [id])
    ).rows[0];
  const object = async (id: string, u: string, ext = "png") =>
    db.query(
      "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
      [`${company}/${id}/${u}.${ext}`],
    );
  const events = async () =>
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.audit_events where company_id=$1 and entity='expenses'",
        [company],
      )
    ).rows[0].n;
  try {
    for (const [id, email] of [
      [owner, "owner@test.invalid"],
      [other, "other@test.invalid"],
      [staff, "staff@test.invalid"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(other);
    await db.query("select public.create_company($1,'Other QA')", [foreign]);
    await as(owner);
    await db.query("select public.create_company($1,'Individual QA')", [
      company,
    ]);
    await db.query(
      "select public.add_company_member($1,'staff@test.invalid')",
      [company],
    );
    await db.query("select public.set_member_access($1,$2,'member',true,$3)", [
      company,
      staff,
      JSON.stringify({ gastos: ["read", "write"] }),
    ]);
    await db.query("select public.save_expense_batch($1,$2,$3)", [
      company,
      randomUUID(),
      JSON.stringify(rows),
    ]);
    let id = "";
    const request = randomUUID();
    await t.test(
      "preparation preserves approval and requires a real private object before attaching",
      async () => {
        id = await prepare(rows[0].id, 1, sha("one"));
        assert.equal(await prepare(rows[0].id, 1, sha("one")), id);
        await assert.rejects(
          attach(rows[0].id, 1, request, id),
          /receipt_unavailable/,
        );
        assert.equal((await read(rows[0].id)).status, "APROBADO");
        assert.equal(await events(), 2);
        await object(rows[0].id, id);
      },
    );
    await t.test(
      "foreign tenants and actors cannot attach or read another actor's manifest",
      async () => {
        await as(other);
        await assert.rejects(
          prepare(rows[0].id, 1, sha("one")),
          /permission_denied/,
        );
        assert.equal(
          (await db.query("select * from public.expense_receipt_uploads")).rows
            .length,
          0,
        );
        await as(staff);
        await assert.rejects(
          attach(rows[0].id, 1, randomUUID(), id),
          /receipt_unavailable/,
        );
        await as(owner);
        await assert.rejects(
          attach(rows[1].id, 1, randomUUID(), id),
          /receipt_unavailable/,
        );
      },
    );
    await t.test(
      "successful correction keeps amount, reopens review once and a lost-response replay is a no-op",
      async () => {
        assert.equal(await attach(rows[0].id, 1, request, id), 2);
        const e = await read(rows[0].id);
        assert.equal(e.receipt_sha256, sha("one"));
        assert.equal(e.amount, "2.34");
        assert.equal(e.status, "PENDIENTE");
        assert.equal(await events(), 3);
        assert.equal(await attach(rows[0].id, 1, request, id), 2);
        assert.equal(await events(), 3);
        await assert.rejects(
          attach(rows[0].id, 1, request, null),
          /receipt_request_conflict/,
        );
        await assert.rejects(
          prepare(rows[0].id, 1, sha("stale")),
          /record_conflict/,
        );
      },
    );
    await t.test(
      "single and batch uploads reject the same active receipt, not just filenames",
      async () => {
        await assert.rejects(
          prepare(rows[1].id, 1, sha("one")),
          /duplicate_expense_receipt/,
        );
        await assert.rejects(
          db.query(
            "select public.prepare_expense_batch_receipt($1,$2,$3,$4,600,'png')",
            [company, randomUUID(), randomUUID(), sha("one")],
          ),
          /duplicate_expense_receipt/,
        );
        const batch = randomUUID(),
          r = row(),
          h = sha("batch");
        const u = (
          await db.query<{ id: string }>(
            "select (public.prepare_expense_batch_receipt($1,$2,$3,$4,600,'png')).*",
            [company, batch, r.id, h],
          )
        ).rows[0].id;
        await object(r.id, u);
        await db.query("select public.save_expense_batch($1,$2,$3)", [
          company,
          batch,
          JSON.stringify([{ ...r, receipt_id: u }]),
        ]);
        await assert.rejects(
          prepare(rows[1].id, 1, h),
          /duplicate_expense_receipt/,
        );
      },
    );
    await t.test(
      "same-content replacement is a no-op and PDF replacement preserves old objects",
      async () => {
        const same = await prepare(rows[0].id, 2, sha("one"));
        await object(rows[0].id, same);
        const before = await events();
        assert.equal(await attach(rows[0].id, 2, randomUUID(), same), 2);
        assert.equal(await events(), before);
        const pdf = await prepare(rows[0].id, 2, sha("pdf"), "pdf");
        await object(rows[0].id, pdf, "pdf");
        assert.equal(await attach(rows[0].id, 2, randomUUID(), pdf), 3);
        assert.equal(
          (
            await db.query("select * from storage.objects where name=$1", [
              `${company}/${rows[0].id}/${id}.png`,
            ])
          ).rows.length,
          1,
        );
        const remove = randomUUID();
        assert.equal(await attach(rows[0].id, 3, remove, null), 4);
        assert.equal(await attach(rows[0].id, 3, remove, null), 4);
        assert.equal((await read(rows[0].id)).receipt_sha256, null);
      },
    );
    await t.test(
      "authorized staff can attach; revoked writers and stale edits cannot complete",
      async () => {
        await as(staff);
        const u = await prepare(rows[1].id, 1, sha("staff"));
        await object(rows[1].id, u);
        assert.equal(await attach(rows[1].id, 1, randomUUID(), u), 2);
        const next = await prepare(rows[1].id, 2, sha("next"));
        await object(rows[1].id, next);
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [company, staff, JSON.stringify({ gastos: ["read"] })],
        );
        await as(staff);
        await assert.rejects(
          attach(rows[1].id, 2, randomUUID(), next),
          /permission_denied/,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.expense_receipt_uploads where id=$1",
              [next],
            )
          ).rows.length,
          0,
        );
        await as(owner);
      },
    );
    await t.test(
      "prepared receipt loses safely to a newer expense version and cannot overwrite it",
      async () => {
        const u = await prepare(rows[1].id, 2, sha("newer"));
        await object(rows[1].id, u);
        await db.query("select public.set_expense_receipt($1,$2,2,null)", [
          company,
          rows[1].id,
        ]);
        await assert.rejects(
          attach(rows[1].id, 2, randomUUID(), u),
          /record_conflict/,
        );
        assert.equal((await read(rows[1].id)).receipt_path, null);
      },
    );
  } finally {
    await db.close();
  }
});
test("single raw uploads preserve PDF compatibility, validate bytes and verify lost upload responses", async () => {
  const company = randomUUID(),
    expense = randomUUID(),
    actor = randomUUID();
  let candidate: Record<string, unknown> | null = null;
  const objects = new Map<string, Blob>();
  const pdf = Buffer.from("%PDF-1.4\nsynthetic-test-document\n%%EOF");
  let writes = 0;
  const chain = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    is() {
      return this;
    },
    maybeSingle: async () => ({ data: candidate, error: null }),
  };
  const db = {
    auth: {
      getUser: async () => ({ data: { user: { id: actor } }, error: null }),
    },
    rpc: async (_n: string, p: Record<string, unknown>) => {
      candidate ??= {
        id: randomUUID(),
        company_id: company,
        batch_id: null,
        expense_id: expense,
        actor_id: actor,
        expense_version: 2,
        sha256: p.p_sha256,
        bytes: p.p_bytes,
        extension: p.p_extension,
      };
      return { data: candidate, error: null };
    },
    from: () => chain,
    storage: {
      from: () => ({
        upload: async (
          path: string,
          b: Uint8Array,
          opts: { contentType: string },
        ) => {
          if (!objects.has(path)) {
            objects.set(
              path,
              new Blob([new Uint8Array(b)], { type: opts.contentType }),
            );
            writes++;
          }
          return { error: { message: "Lost upload response" } };
        },
        download: async (path: string) => ({
          data: objects.get(path),
          error: null,
        }),
      }),
    },
  } as unknown as SupabaseClient;
  const id = await prepareExpenseReceipt(db, company, expense, 2, pdf);
  assert.equal(await prepareExpenseReceipt(db, company, expense, 2, pdf), id);
  assert.equal(writes, 1);
  assert.equal(await verifyExpenseReceipt(db, company, expense, 2, id), id);
  await assert.rejects(
    verifyExpenseReceipt(db, company, expense, 3, id),
    /receipt_mismatch/,
  );
  const req = (b: Uint8Array, origin = "https://qa.example.test") =>
    new Request("https://qa.example.test/receipt", {
      method: "POST",
      body: new Uint8Array(b),
      headers: { origin },
    });
  assert.equal(
    (
      await uploadIndividualExpenseReceipt(
        req(pdf),
        company,
        expense,
        2,
        async () => db,
        "https://qa.example.test",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await uploadIndividualExpenseReceipt(
        req(pdf),
        company,
        expense,
        0,
        async () => db,
        "https://qa.example.test",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await uploadIndividualExpenseReceipt(
        req(pdf, "https://evil.test"),
        company,
        expense,
        2,
        async () => db,
        "https://qa.example.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await uploadIndividualExpenseReceipt(
        req(Buffer.alloc(8388609)),
        company,
        expense,
        2,
        async () => db,
        "https://qa.example.test",
      )
    ).status,
    413,
  );
  objects.set(
    `${company}/${expense}/${id}.pdf`,
    new Blob([Buffer.alloc(pdf.length, 1)], { type: "application/pdf" }),
  );
  await assert.rejects(
    verifyExpenseReceipt(db, company, expense, 2, id),
    /invalid_receipt/,
  );
  assert.throws(() => identifyReceipt(pdf), /invalid_receipt/);
  assert.equal(identifyReceipt(pdf, true).extension, "pdf");
  assert.throws(
    () => identifyReceipt(Buffer.alloc(8388609), true),
    /invalid_receipt/,
  );
  assert(
    !singleReceiptError(new Error("private detail")).includes("private detail"),
  );
});
