import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { historyHash, planHistoryMigration } from "./history";

// Private rehearsal tables only; this does not issue live financial documents.
export async function stageHistory(
  db: PGlite,
  input: unknown,
  companyId: string,
) {
  const plan = planHistoryMigration(input, companyId);
  return db.transaction(async (tx) => {
    await tx.exec(`
      create schema if not exists history_rehearsal;
      create table if not exists history_rehearsal.scope(
        singleton boolean primary key default true check(singleton),
        company_id uuid not null unique
      );
      create table if not exists history_rehearsal.records(
        company_id uuid not null references history_rehearsal.scope(company_id),
        id uuid not null, kind text not null, source_id text not null,
        source_sha256 text not null, plan_sha256 text not null,
        original jsonb not null, planned_record jsonb not null,
        primary key(company_id,id), unique(company_id,kind,source_id)
      );
      create table if not exists history_rehearsal.relations(
        company_id uuid not null, record_id uuid not null, field text not null,
        status text not null check(status in ('resolved','missing','invalid','absent','out_of_scope','conflict')),
        target_id uuid, evidence jsonb not null,
        primary key(company_id,record_id,field),
        foreign key(company_id,record_id) references history_rehearsal.records(company_id,id),
        foreign key(company_id,target_id) references history_rehearsal.records(company_id,id),
        check((status='resolved')=(target_id is not null))
      );
      create table if not exists history_rehearsal.runs(
        id uuid primary key, company_id uuid not null references history_rehearsal.scope(company_id),
        snapshot_sha256 text not null, inserted integer not null, unchanged integer not null,
        committed_at timestamptz not null default now()
      );
    `);
    await tx.query(
      "insert into history_rehearsal.scope(company_id) values($1) on conflict(singleton) do nothing",
      [plan.companyId],
    );
    const scope = await tx.query<{ company_id: string }>(
      "select company_id from history_rehearsal.scope for update",
    );
    if (scope.rows[0]?.company_id !== plan.companyId)
      throw new Error("destination_company_mismatch");
    const added = [];
    let unchanged = 0;
    for (const record of plan.records) {
      const current = await tx.query<{
        source_sha256: string;
        plan_sha256: string;
      }>(
        "select source_sha256,plan_sha256 from history_rehearsal.records where company_id=$1 and kind=$2 and source_id=$3 for update",
        [plan.companyId, record.kind, record.sourceId],
      );
      const digest = historyHash(record);
      if (current.rows.length) {
        if (
          current.rows[0].source_sha256 !== record.sourceSha256 ||
          current.rows[0].plan_sha256 !== digest
        )
          throw new Error("history_source_or_relationship_changed");
        unchanged++;
        continue;
      }
      await tx.query(
        `insert into history_rehearsal.records(company_id,id,kind,source_id,source_sha256,plan_sha256,original,planned_record) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
        [
          plan.companyId,
          record.candidateId,
          record.kind,
          record.sourceId,
          record.sourceSha256,
          digest,
          JSON.stringify(record.original),
          JSON.stringify(record),
        ],
      );
      added.push(record);
    }
    // All targets exist before creating links, including estimate/project cycles.
    for (const record of added)
      for (const reference of record.references) {
        await tx.query(
          `insert into history_rehearsal.relations(company_id,record_id,field,status,target_id,evidence) values($1,$2,$3,$4,$5,$6::jsonb)`,
          [
            plan.companyId,
            record.candidateId,
            reference.field,
            reference.status,
            reference.candidateId,
            JSON.stringify(reference),
          ],
        );
      }
    await tx.query(
      "insert into history_rehearsal.runs(id,company_id,snapshot_sha256,inserted,unchanged) values($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        plan.companyId,
        plan.snapshotSha256,
        added.length,
        unchanged,
      ],
    );
    return {
      mode: "local-history-rehearsal",
      productionWrites: false,
      inserted: added.length,
      unchanged,
      summary: plan.summary,
    };
  });
}
