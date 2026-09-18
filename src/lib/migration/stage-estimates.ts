import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { planEstimateMigration } from "./estimates";

// Dedicated offline PostgreSQL rehearsal. No Supabase or application tables.
// Recompute the plan from the snapshot; do not trust caller-supplied hashes.
export async function stageEstimates(
  db: PGlite,
  input: unknown,
  companyId: string,
) {
  const plan = planEstimateMigration(input, companyId);
  return db.transaction(async (tx) => {
    await tx.exec(`
      create schema if not exists migration_rehearsal;
      create table if not exists migration_rehearsal.scope (
        singleton boolean primary key default true check(singleton),
        company_id uuid not null unique
      );
      create table if not exists migration_rehearsal.estimates (
        company_id uuid not null references migration_rehearsal.scope(company_id),
        source_id text not null,
        candidate_id uuid not null unique,
        source_sha256 text not null check(length(source_sha256)=64),
        original jsonb not null,
        planned_record jsonb not null,
        staged_at timestamptz not null default now(),
        primary key(company_id,source_id)
      );
      create table if not exists migration_rehearsal.runs (
        id uuid primary key,
        company_id uuid not null references migration_rehearsal.scope(company_id),
        snapshot_sha256 text not null,
        inserted integer not null,
        unchanged integer not null,
        committed_at timestamptz not null default now()
      );
    `);
    await tx.query(
      "insert into migration_rehearsal.scope(company_id) values($1) on conflict(singleton) do nothing",
      [plan.destinationCompanyId],
    );
    const scope = await tx.query<{ company_id: string }>(
      "select company_id from migration_rehearsal.scope for update",
    );
    if (scope.rows[0]?.company_id !== plan.destinationCompanyId)
      throw new Error("destination_company_mismatch");
    let inserted = 0,
      unchanged = 0;
    for (const record of plan.records) {
      const current = await tx.query<{ source_sha256: string }>(
        "select source_sha256 from migration_rehearsal.estimates where company_id=$1 and source_id=$2 for update",
        [plan.destinationCompanyId, record.sourceId],
      );
      if (current.rows.length) {
        if (current.rows[0].source_sha256 !== record.sourceSha256)
          throw new Error("source_changed_conflict");
        unchanged++;
        continue;
      }
      await tx.query(
        `insert into migration_rehearsal.estimates(company_id,source_id,candidate_id,source_sha256,original,planned_record) values($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
        [
          plan.destinationCompanyId,
          record.sourceId,
          record.candidateId,
          record.sourceSha256,
          JSON.stringify(record.original),
          JSON.stringify(record),
        ],
      );
      inserted++;
    }
    await tx.query(
      "insert into migration_rehearsal.runs(id,company_id,snapshot_sha256,inserted,unchanged) values($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        plan.destinationCompanyId,
        plan.snapshotSha256,
        inserted,
        unchanged,
      ],
    );
    return {
      mode: "local-staging-only",
      productionWrites: false,
      inserted,
      unchanged,
      summary: plan.summary,
    };
  });
}
