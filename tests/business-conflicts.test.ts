import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { commercialError } from "../src/lib/commercial";
import { financeError } from "../src/lib/finance";
import { operationError } from "../src/lib/operation-queue";

test("business conflicts terminate with PT409 without changing the saved record or audit", async () => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    company = randomUUID(),
    customer = randomUUID();
  try {
    const retryable = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','app_private') and p.prokind='f'
      and p.prosrc ~ 'errcode[[:space:]]*=[[:space:]]*''40001'''
    `);
    assert.deepEqual(retryable.rows, []);
    const permissions = () =>
      db.query(`
      select n.nspname,p.proname,p.proargtypes::text,p.proacl::text,p.proowner,p.prosecdef,p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','app_private') and p.prokind='f'
      order by n.nspname,p.proname,p.proargtypes::text
    `);
    const before = (await permissions()).rows;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609240028_business_conflicts.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await permissions()).rows,
      before,
      "reapplying does not change access or function identity",
    );
    await db.query(
      "insert into auth.users values($1,'conflict-owner@saasalldecor.invalid',now())",
      [owner],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
    await db.query("select public.create_company($1,'Synthetic conflicts')", [
      company,
    ]);
    const save = (version: number, name: string) =>
      db.query("select public.save_customer($1,$2,$3,$4)", [
        company,
        customer,
        version,
        JSON.stringify({ full_name: name, status: "active" }),
      ]);
    await save(0, "Initial synthetic record");
    await save(1, "Saved winning edit");
    const auditBefore = (
      await db.query(
        "select * from public.audit_events where company_id=$1 order by id",
        [company],
      )
    ).rows;
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(save(1, "Stale edit must never persist"), {
        code: "PT409",
      });
    }
    assert.deepEqual(
      (
        await db.query(
          "select full_name,version from public.customers where id=$1",
          [customer],
        )
      ).rows,
      [{ full_name: "Saved winning edit", version: 2 }],
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from public.audit_events where company_id=$1 order by id",
          [company],
        )
      ).rows,
      auditBefore,
    );
  } finally {
    await db.close();
  }
});

test("HTTP and form feedback recognize terminal conflicts during rolling migration", () => {
  for (const code of ["PT409", "40001"]) {
    assert.match(commercialError(code), /registro cambió/);
    assert.match(
      financeError({ code, message: "customer_conflict" }),
      /registro cambió/,
    );
    assert.equal(operationError(code).status, 409);
  }
  assert.equal(operationError("XX000").status, 503);
});
