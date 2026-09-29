import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import {
  prepareExpenseBatchReceipt,
  verifyExpenseBatchReceipt,
  expenseReceiptError,
} from "../src/lib/expense-batch-receipts";
import { uploadExpenseBatchReceipt } from "../src/lib/expense-receipt-upload";

test("receipt batches preserve staged files, authorize them and atomically attach without duplicate effects", async (t) => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    other = randomUUID(),
    company = randomUUID(),
    foreign = randomUUID();
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const sha = (v: string) => createHash("sha256").update(v).digest("hex");
  const row = () => ({
    id: randomUUID(),
    project_id: null,
    worker_id: null,
    expense_date: "2026-09-29",
    category: "Materiales",
    description: "Synthetic receipts",
    vendor: "QA",
    document_number: randomUUID(),
    amount: "2.34",
    method: "ZELLE",
    payer: "EMPRESA",
  });
  const prepare = async (
    batch: string,
    id: string,
    hash: string,
    co = company,
  ) =>
    (
      await db.query<{ id: string; bytes: number }>(
        "select (public.prepare_expense_batch_receipt($1,$2,$3,$4,600,'png')).*",
        [co, batch, id, hash],
      )
    ).rows[0];
  const save = async (batch: string, rows: unknown) =>
    (
      await db.query<{ ids: string[] }>(
        "select public.save_expense_batch($1,$2,$3) ids",
        [company, batch, JSON.stringify(rows)],
      )
    ).rows[0].ids;
  const count = async (table: string) =>
    (
      await db.query<{ n: number }>(
        `select count(*)::int n from public.${table} where company_id=$1`,
        [company],
      )
    ).rows[0].n;
  try {
    for (const id of [owner, other])
      await db.query("insert into auth.users values($1,$2,now())", [
        id,
        `${id}@example.test`,
      ]);
    await as(owner);
    await db.query("select public.create_company($1,'Receipt QA')", [company]);
    await as(other);
    await db.query("select public.create_company($1,'Foreign QA')", [foreign]);
    await as(owner);
    const batch = randomUUID(),
      rows = [row(), row()],
      u = await prepare(batch, rows[0].id, sha("first"));
    const path = `${company}/${rows[0].id}/${u.id}.png`;
    await t.test(
      "preparation reuses the same immutable candidate; missing binary cannot commit",
      async () => {
        assert.equal((await prepare(batch, rows[0].id, sha("first"))).id, u.id);
        assert.equal(await count("expense_receipt_uploads"), 1);
        await assert.rejects(
          save(batch, [{ ...rows[0], receipt_id: u.id }, rows[1]]),
          /receipt_unavailable/,
        );
        assert.equal(await count("expenses"), 0);
        await db.query(
          "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
          [path],
        );
        await assert.rejects(
          db.query(
            "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
            [`${company}/${rows[1].id}/${randomUUID()}.png`],
          ),
          /row-level security/,
        );
      },
    );
    await t.test(
      "late row conflict leaves only prepared candidates, no partial expense/audit/batch",
      async () => {
        const invalid = [
          { ...rows[0], receipt_id: u.id },
          { ...rows[1], document_number: rows[0].document_number },
        ];
        await assert.rejects(
          save(batch, invalid),
          /expense_batch_row_2:duplicate_expense_document/,
        );
        assert.equal(await count("expenses"), 0);
        assert.equal(await count("expense_batches"), 0);
        assert.equal(await count("expense_receipt_uploads"), 1);
        assert.equal(
          (
            await db.query("select * from storage.objects where name=$1", [
              path,
            ])
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.audit_events where entity='expenses'",
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "foreign actors, rows and batches cannot reuse a candidate or read its object",
      async () => {
        await assert.rejects(
          save(randomUUID(), [{ ...rows[0], receipt_id: u.id }]),
          /receipt_unavailable/,
        );
        await assert.rejects(
          save(batch, [{ ...rows[1], receipt_id: u.id }]),
          /receipt_unavailable/,
        );
        await as(other);
        assert.equal(
          (
            await db.query("select * from storage.objects where name=$1", [
              path,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.expense_receipt_uploads where company_id=$1",
              [company],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          prepare(batch, rows[0].id, sha("first")),
          /permission_denied/,
        );
        await assert.rejects(
          db.query(
            "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
            [path],
          ),
          /row-level security/,
        );
        await as(owner);
      },
    );
    await t.test(
      "retry attaches with matching hash, preserves approval and does not repeat on lost response",
      async () => {
        const payload = [{ ...rows[0], receipt_id: u.id }, rows[1]];
        assert.deepEqual(
          await save(batch, payload),
          rows.map((x) => x.id),
        );
        const before = (
          await db.query(
            "select * from public.audit_events where entity='expenses'",
          )
        ).rows.length;
        assert.deepEqual(
          await save(batch, payload),
          rows.map((x) => x.id),
        );
        assert.equal(
          (
            await db.query(
              "select * from public.audit_events where entity='expenses'",
            )
          ).rows.length,
          before,
        );
        const e = (
          await db.query<{
            receipt_path: string;
            receipt_sha256: string;
            status: string;
          }>("select * from public.expenses where id=$1", [rows[0].id])
        ).rows[0];
        assert.equal(e.receipt_path, path);
        assert.equal(e.receipt_sha256, sha("first"));
        assert.equal(e.status, "APROBADO");
        assert.equal(await count("expenses"), 2);
        assert.equal(await count("expense_batches"), 1);
        await assert.rejects(
          prepare(batch, rows[0].id, sha("replacement")),
          /expense_batch_conflict/,
        );
        await assert.rejects(
          save(batch, [{ ...rows[0], receipt_id: randomUUID() }, rows[1]]),
          /expense_batch_conflict/,
        );
        await db.query("update storage.objects set name=$2 where name=$1", [
          path,
          "overwritten",
        ]);
        await db.query("delete from storage.objects where name=$1", [path]);
        assert.equal(
          (
            await db.query("select * from storage.objects where name=$1", [
              path,
            ])
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "same image cannot appear twice in a new batch or across active expenses",
      async () => {
        await assert.rejects(
          prepare(randomUUID(), randomUUID(), sha("first")),
          /duplicate_expense_receipt/,
        );
        const b = randomUUID(),
          rr = [row(), row()];
        const uploads = await Promise.all(
          rr.map((x) => prepare(b, x.id, sha("second"))),
        );
        for (let i = 0; i < rr.length; i++)
          await db.query(
            "insert into storage.objects(bucket_id,name) values('expense-receipts',$1)",
            [`${company}/${rr[i].id}/${uploads[i].id}.png`],
          );
        await assert.rejects(
          save(
            b,
            rr.map((x, i) => ({ ...x, receipt_id: uploads[i].id })),
          ),
          /expense_batch_row_2:duplicate_expense_receipt/,
        );
        assert.equal(await count("expenses"), 2);
        assert.equal(await count("expense_batches"), 1);
        // Same content in a different company is independent, not an information leak.
        await as(other);
        await prepare(randomUUID(), randomUUID(), sha("first"), foreign);
        await as(owner);
      },
    );
    await t.test(
      "legacy detach clears digest, still preserves the immutable stored candidate",
      async () => {
        await db.query("select public.set_expense_receipt($1,$2,1,null)", [
          company,
          rows[0].id,
        ]);
        const e = (
          await db.query<{
            receipt_sha256: null;
            receipt_path: null;
            status: string;
          }>("select * from public.expenses where id=$1", [rows[0].id])
        ).rows[0];
        assert.equal(e.receipt_sha256, null);
        assert.equal(e.receipt_path, null);
        assert.equal(e.status, "PENDIENTE");
        assert.equal(
          (
            await db.query("select * from storage.objects where name=$1", [
              path,
            ])
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "write revocation removes access to uncommitted candidates and denies completion",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update public.memberships set role='member',permissions=$3 where company_id=$1 and user_id=$2",
          [company, owner, JSON.stringify({ gastos: ["read"] })],
        );
        await as(owner);
        assert.equal(await count("expense_receipt_uploads"), 0);
        await assert.rejects(
          prepare(randomUUID(), randomUUID(), sha("denied")),
          /permission_denied/,
        );
        await assert.rejects(save(randomUUID(), [row()]), /permission_denied/);
      },
    );
  } finally {
    await db.close();
  }
});

const picture = () => {
  const b = Buffer.alloc(600, 1);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  return b;
};
test("receipt binary verification recovers lost responses but rejects missing/tampered data", async () => {
  const company = randomUUID(),
    batch = randomUUID(),
    expense = randomUUID(),
    actor = randomUUID();
  const objects = new Map<string, Blob>();
  let candidate: Record<string, unknown> | null = null;
  let writes = 0;
  let failUpload = false;
  const client = {
    rpc: async (_name: string, p: Record<string, unknown>) => {
      candidate ??= {
        id: randomUUID(),
        company_id: company,
        batch_id: batch,
        expense_id: expense,
        actor_id: actor,
        sha256: p.p_sha256,
        bytes: p.p_bytes,
        extension: p.p_extension,
      };
      return { data: candidate, error: null };
    },
    storage: {
      from: () => ({
        upload: async (path: string, b: Uint8Array) => {
          if (failUpload) return { error: { message: "failed" } };
          if (!objects.has(path)) {
            objects.set(
              path,
              new Blob([new Uint8Array(b)], { type: "image/png" }),
            );
            writes++;
          }
          return { error: { message: "lost response or already exists" } };
        },
        download: async (path: string) => ({
          data: objects.get(path) ?? null,
          error: null,
        }),
      }),
    },
    from: () => ({
      select: () => ({
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: candidate, error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
  const id = await prepareExpenseBatchReceipt(
    client,
    company,
    batch,
    expense,
    picture(),
  );
  assert.equal(
    await prepareExpenseBatchReceipt(
      client,
      company,
      batch,
      expense,
      picture(),
    ),
    id,
  );
  assert.equal(writes, 1);
  assert.equal(
    await verifyExpenseBatchReceipt(client, company, batch, expense, id),
    id,
  );
  const path = `${company}/${expense}/${id}.png`;
  const tampered = picture();
  tampered[500] = 7;
  objects.set(path, new Blob([tampered], { type: "image/png" }));
  await assert.rejects(
    verifyExpenseBatchReceipt(client, company, batch, expense, id),
    /receipt_mismatch/,
  );
  await assert.rejects(
    verifyExpenseBatchReceipt(client, company, randomUUID(), expense, id),
    /receipt_mismatch/,
  );
  objects.clear();
  failUpload = true;
  await assert.rejects(
    prepareExpenseBatchReceipt(client, company, batch, expense, picture()),
    /receipt_unavailable/,
  );
  for (const invalid of [
    Buffer.alloc(600),
    picture().subarray(0, 399),
    Buffer.alloc(8388609),
  ])
    await assert.rejects(
      prepareExpenseBatchReceipt(client, company, batch, expense, invalid),
      /invalid_receipt/,
    );
  assert(
    !expenseReceiptError(new Error("SQL secret private")).includes("private"),
  );
});
test("raw upload checks origin, authentication and actual streamed size before preparing", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()] as const;
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: { id: randomUUID() } },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;
  const req = (bytes: Uint8Array, origin = "https://staging.example.test") =>
    new Request("https://staging.example.test/api/upload", {
      method: "POST",
      body: new Uint8Array(bytes),
      headers: { origin },
    });
  assert.equal(
    (
      await uploadExpenseBatchReceipt(
        req(picture(), "https://evil.example.test"),
        ...ids,
        async () => db,
        "https://staging.example.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await uploadExpenseBatchReceipt(
        req(picture()),
        ...ids,
        async () =>
          ({
            auth: {
              getUser: async () => ({ data: { user: null }, error: null }),
            },
          }) as unknown as SupabaseClient,
        "https://staging.example.test",
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await uploadExpenseBatchReceipt(
        req(Buffer.alloc(8388609)),
        ...ids,
        async () => db,
        "https://staging.example.test",
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await uploadExpenseBatchReceipt(
        req(Buffer.alloc(399)),
        ...ids,
        async () => db,
        "https://staging.example.test",
      )
    ).status,
    400,
  );
});
