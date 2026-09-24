import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { authStorageContract } from "./helpers/auth-storage-contract";

const sinkSql = readFileSync(
  new URL("../supabase/staging/auth-mail-sink.sql", import.meta.url),
  "utf8",
);
const event = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@saasalldecor.invalid",
  },
  email_data: {
    email_action_type: "recovery",
    token_hash: "synthetic-token-only",
    redirect_to: "https://staging.example.test/auth/confirm",
  },
};

async function emptyDatabase() {
  const db = new PGlite();
  await db.exec(
    authStorageContract +
      "create role supabase_auth_admin; create table public.companies(id uuid);",
  );
  return db;
}

async function install(db: PGlite) {
  await db.exec(
    "set saas.install_staging_mail_sink = 'verified-empty-staging'",
  );
  await db.exec(sinkSql);
}

test("mail sink requires deliberate staging setup and refuses nonempty databases", async () => {
  for (const existing of [
    null,
    "auth.users",
    "public.companies",
    "storage.objects",
  ]) {
    const db = await emptyDatabase();
    try {
      if (existing) {
        await db.exec(
          `insert into ${existing}(id) values ('00000000-0000-4000-8000-000000000001')`,
        );
        await db.exec(
          "set saas.install_staging_mail_sink = 'verified-empty-staging'",
        );
      }
      await assert.rejects(
        db.exec(sinkSql),
        existing
          ? /mail_sink_requires_empty_staging/
          : /staging_connection_must_be_verified/,
      );
      await db.exec("rollback");
      assert.equal(
        (
          await db.query<{ n: string | null }>(
            "select to_regnamespace('staging_private')::text n",
          )
        ).rows[0].n,
        null,
      );
    } finally {
      await db.close();
    }
  }
});

test("Auth captures a synthetic recovery message, but cannot read it; clients cannot invoke or read", async () => {
  const db = await emptyDatabase();
  try {
    await install(db);
    await db.exec("set role supabase_auth_admin");
    assert.deepEqual(
      (
        await db.query<{ result: unknown }>(
          "select public.staging_capture_auth_email($1::jsonb) result",
          [JSON.stringify(event)],
        )
      ).rows[0].result,
      {},
    );
    await assert.rejects(
      db.query("select * from staging_private.auth_mail"),
      /permission denied/,
    );
    await db.exec("reset role");
    const rows = (
      await db.query<{ recipient: string; email_data: unknown }>(
        "select recipient, email_data from staging_private.auth_mail",
      )
    ).rows;
    assert.deepEqual(rows, [
      { recipient: event.user.email, email_data: event.email_data },
    ]);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select public.staging_capture_auth_email($1::jsonb)", [
          JSON.stringify(event),
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from staging_private.auth_mail"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await assert.rejects(
      db.exec(sinkSql),
      /schema "staging_private" already exists/,
    );
    await db.exec("rollback");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from staging_private.auth_mail",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("mail sink rejects external recipients, email-change addresses and malformed payloads without capture", async () => {
  const db = await emptyDatabase();
  try {
    await install(db);
    await db.exec("set role supabase_auth_admin");
    const bad = [
      null,
      {},
      { ...event, email_data: [] },
      { ...event, user: { ...event.user, id: "bad-id" } },
      { ...event, user: { ...event.user, email: "outside@example.com" } },
      {
        ...event,
        user: {
          ...event.user,
          email: "owner@saasalldecor.invalid.example.com",
        },
      },
      { ...event, user: { ...event.user, new_email: "outside@example.com" } },
      {
        ...event,
        email_data: { ...event.email_data, old_email: "outside@example.com" },
      },
      {
        ...event,
        email_data: { ...event.email_data, new_email: "outside@example.com" },
      },
      {
        ...event,
        email_data: { ...event.email_data, token: "x".repeat(33000) },
      },
    ];
    for (const payload of bad) {
      await assert.rejects(
        db.query("select public.staging_capture_auth_email($1::jsonb)", [
          JSON.stringify(payload),
        ]),
      );
    }
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from staging_private.auth_mail",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
