import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import {
  exportPostgresSnapshot,
  validatePostgresSource,
} from "./ops/postgres-snapshot";
import { commandFile, commandText } from "./ops/process";
import { sealSnapshot } from "./ops/seal-snapshot";
import { encryptBackup, recoverBackupFiles } from "./ops/backup-package";

async function main() {
  const config = {
    mode: "synthetic" as const,
    projectRef: "abcdefghijklmnopqrst",
    directory: path.resolve(".local", `postgres-recovery-${randomUUID()}`),
    pgDump: process.env.PG_DUMP_BIN ?? "pg_dump",
    pgDumpAll: process.env.PG_DUMPALL_BIN ?? "pg_dumpall",
  };
  validatePostgresSource(config, process.env);
  const client = new Client();
  await client.connect();
  try {
    assert.equal(
      (
        await client.query(
          "select count(*)::int n from information_schema.tables where table_schema in ('public','app_private','auth','storage')",
        )
      ).rows[0].n,
      0,
      "Synthetic source must be empty; no cleanup of an existing database",
    );
    await client.query(
      "create schema app_private; create schema auth; create schema storage; create table public.synthetic_customer(id int primary key,name text); create table public.synthetic_invoice(id int primary key,customer_id int references public.synthetic_customer(id),total numeric(12,2)); create table app_private.synthetic_receipt(id int primary key,invoice_id int references public.synthetic_invoice(id),amount numeric(12,2)); insert into public.synthetic_customer values(1,'Synthetic'); insert into public.synthetic_invoice values(1,1,100.10); insert into app_private.synthetic_receipt values(1,1,25.05)",
    );
    await mkdir(config.directory, { recursive: true, mode: 0o700 });
    const metadata = await exportPostgresSnapshot(config, async () => {
      // This transaction commits after the exported snapshot but before pg_dump.
      await client.query(
        "begin; update public.synthetic_invoice set total=200.20 where id=1; insert into app_private.synthetic_receipt values(2,1,50.05); commit",
      );
    });
    assert.equal(metadata.databaseSnapshotConsistent, true);
    assert.equal(
      metadata.tables.find((x) => x.table_name === "synthetic_receipt")?.rows,
      "1",
    );
    const age = process.env.AGE_BIN,
      keygen = process.env.AGE_KEYGEN_BIN,
      rclone = process.env.RCLONE_BIN;
    if (!age || !keygen || !rclone)
      throw new Error(
        "Verified encryption tools required for the database recovery rehearsal",
      );
    const tools = { age, rclone, tar: "tar" },
      scratch = path.join(
        config.directory,
        "..",
        `encrypted-recovery-${randomUUID()}`,
      );
    await mkdir(scratch, { mode: 0o700 });
    const identity = path.join(scratch, "synthetic-identity.txt"),
      recipient = path.join(scratch, "recipient.txt");
    await commandFile(keygen, [], identity);
    await commandFile(keygen, ["-y", identity], recipient);
    await mkdir(path.join(config.directory, "storage"), { mode: 0o700 });
    await writeFile(
      path.join(config.directory, "storage/manifest.json"),
      "[]",
      { flag: "wx", mode: 0o600 },
    );
    await mkdir(path.join(config.directory, "hosting"), { mode: 0o700 });
    const fixture = path.join(scratch, "synthetic.txt");
    await writeFile(fixture, "Synthetic hosting data only", {
      flag: "wx",
      mode: 0o600,
    });
    for (const name of ["private-files", "configuration"])
      await commandFile(
        "tar",
        ["-czf", "-", "-C", scratch, "synthetic.txt"],
        path.join(config.directory, "hosting", `${name}.tar.gz`),
      );
    await sealSnapshot(
      config.directory,
      config.projectRef,
      metadata.snapshotAt,
    );
    const encrypted = await encryptBackup({
      directory: config.directory,
      projectRef: config.projectRef,
      outputRoot: scratch,
      recipientFile: recipient,
      tools,
    });
    const transferred = path.join(scratch, "local-transfer.age");
    await commandText(rclone, [
      "copyto",
      path.join(encrypted.directory, encrypted.receipt.ciphertext.path),
      transferred,
      "--immutable",
    ]);
    const recovered = await recoverBackupFiles({
      ciphertext: transferred,
      receipt: encrypted.receipt,
      identityFile: identity,
      outputRoot: scratch,
      tools,
    });
    const archive = path.join(recovered.directory, "database/full.dump");
    // A separate brand-new database. CREATE fails if any prior rehearsal exists.
    await client.query("create database saas_backup_restored");
    await commandText(process.env.PG_RESTORE_BIN ?? "pg_restore", [
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-acl",
      "--dbname=saas_backup_restored",
      archive,
    ]);
    const restored = new Client({ database: "saas_backup_restored" });
    await restored.connect();
    try {
      assert.equal(
        (
          await restored.query(
            "select total::text from public.synthetic_invoice where id=1",
          )
        ).rows[0].total,
        "100.10",
      );
      assert.equal(
        (
          await restored.query(
            "select count(*)::int n,sum(amount)::text amount from app_private.synthetic_receipt",
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await restored.query(
            "select sum(amount)::text amount from app_private.synthetic_receipt",
          )
        ).rows[0].amount,
        "25.05",
      );
      assert.equal(
        (
          await client.query(
            "select total::text from public.synthetic_invoice where id=1",
          )
        ).rows[0].total,
        "200.20",
      );
      assert.ok(
        (
          await readFile(
            path.join(config.directory, "database/data.sql"),
            "utf8",
          )
        ).includes("100.10"),
      );
      console.log(
        "PASS native snapshot encrypted with age, transferred by local rclone and restored consistently while source writes continue; Drive and production recovery remain untested",
      );
    } finally {
      await restored.end();
    }
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Synthetic database restore failed",
  );
  process.exitCode = 1;
});
