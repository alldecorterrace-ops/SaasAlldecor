import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { stagingBootstrap } from "../scripts/ops/staging-bootstrap";
import { authStorageContract } from "./helpers/auth-storage-contract";

test("fresh staging bootstrap records every migration atomically and rejects reuse", async () => {
  const db = new PGlite();
  try {
    await db.exec(authStorageContract);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const files = await Promise.all(
      (await readdir(directory))
        .filter((x) => x.endsWith(".sql"))
        .map(async (name) => ({
          name,
          sql: await readFile(new URL(name, directory), "utf8"),
        })),
    );
    const sql = stagingBootstrap(files);
    await db.exec(sql);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from supabase_migrations.schema_migrations",
        )
      ).rows[0].n,
      files.length,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.module_catalog",
        )
      ).rows[0].n,
      23,
    );
    await assert.rejects(db.exec(sql), /staging_must_be_empty/);
    await db.exec("rollback");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from supabase_migrations.schema_migrations",
        )
      ).rows[0].n,
      files.length,
    );
  } finally {
    await db.close();
  }
});

test("failed migration leaves neither earlier effects nor migration history", async () => {
  const db = new PGlite();
  try {
    await db.exec(authStorageContract);
    const sql = stagingBootstrap([
      {
        name: "202609240001_first.sql",
        sql: "begin;\ncreate table public.synthetic(id int);\ncommit;",
      },
      {
        name: "202609240002_failure.sql",
        sql: "begin;\nselect missing_function();\ncommit;",
      },
    ]);
    await assert.rejects(db.exec(sql), /missing_function/);
    await db.exec("rollback");
    assert.equal(
      (
        await db.query<{ x: string | null }>(
          "select to_regclass('public.synthetic')::text x",
        )
      ).rows[0].x,
      null,
    );
    assert.equal(
      (
        await db.query<{ x: string | null }>(
          "select to_regclass('supabase_migrations.schema_migrations')::text x",
        )
      ).rows[0].x,
      null,
    );
    assert.throws(() =>
      stagingBootstrap([{ name: "bad.sql", sql: "begin;\ncommit;" }]),
    );
  } finally {
    await db.close();
  }
});
