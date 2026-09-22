import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePostgresSource } from "../scripts/ops/postgres-snapshot";

test("snapshot export refuses the transaction pooler, foreign project and unverified TLS", () => {
  const config = {
    projectRef: "abcdefghijklmnopqrst",
    mode: "supabase" as const,
  };
  const env = {
    PGHOST: "aws-0-us-east-1.pooler.supabase.com",
    PGUSER: "postgres.abcdefghijklmnopqrst",
    PGDATABASE: "postgres",
    PGPORT: "5432",
    PGSSLMODE: "verify-full",
  };
  validatePostgresSource(config, env);
  for (const patch of [
    { PGPORT: "6543" },
    { PGUSER: "postgres.foreign" },
    { PGSSLMODE: "require" },
    { PGHOST: "foreign.example.com" },
  ])
    assert.throws(() => validatePostgresSource(config, { ...env, ...patch }));
  assert.throws(() =>
    validatePostgresSource({ ...config, mode: "synthetic" }, env),
  );
  validatePostgresSource(
    { ...config, mode: "synthetic" },
    { PGHOST: "127.0.0.1", PGDATABASE: "saas_backup_test" },
  );
});
