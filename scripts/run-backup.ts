import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { exportPostgresSnapshot } from "./ops/postgres-snapshot";
import { exportStorageSnapshot } from "./ops/storage-snapshot";
import { archiveHostingSource } from "./ops/hosting-snapshot";
import { sealSnapshot } from "./ops/seal-snapshot";
import { encryptBackup, publishBackup } from "./ops/backup-package";

const source = z
  .object({ root: z.string().min(1), paths: z.array(z.string().min(1)).min(1) })
  .strict();
const configuration = z
  .object({
    projectRef: z.string().regex(/^[a-z]{20}$/),
    spoolRoot: z.string().min(1),
    receiptRoot: z.string().min(1),
    recipientFile: z.string().min(1),
    // This names an immutable, reviewed source inventory kept privately by the operator.
    sourceInventorySha256: z.string().regex(/^[a-f0-9]{64}$/),
    tools: z
      .object({
        age: z.string().min(1),
        tar: z.string().min(1),
        rclone: z.string().min(1),
        pgDump: z.string().min(1),
        pgDumpAll: z.string().min(1),
      })
      .strict(),
    hosting: z.object({ documents: source, configuration: source }).strict(),
    drive: z
      .object({
        rcloneConfig: z.string().min(1),
        remote: z.string().min(1),
        folderId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error("Configuración privada requerida");
  const config = configuration.parse(JSON.parse(await readFile(file, "utf8")));
  const spool = await realpath(config.spoolRoot),
    receipts = await realpath(config.receiptRoot);
  // Receipt must survive removal of this job's own scratch directory.
  if (receipts === spool || !path.relative(spool, receipts).startsWith(".."))
    throw new Error("Los recibos deben estar fuera del spool");
  const lock = path.join(spool, "backup.lock");
  await mkdir(lock, { mode: 0o700 }); // No automatic stale-lock break: inspect the failed job first.
  let success = false;
  const job = path.join(spool, `job-${randomUUID()}`);
  try {
    await mkdir(job, { mode: 0o700 });
    await writeFile(
      path.join(lock, "job.json"),
      JSON.stringify({
        job,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }),
      { flag: "wx", mode: 0o600 },
    );
    const snapshot = path.join(job, "snapshot");
    await mkdir(snapshot, { mode: 0o700 });
    await mkdir(path.join(snapshot, "hosting"), { mode: 0o700 });
    const database = await exportPostgresSnapshot(
      {
        directory: snapshot,
        projectRef: config.projectRef,
        mode: "supabase",
        pgDump: config.tools.pgDump,
        pgDumpAll: config.tools.pgDumpAll,
      },
      async (client) => {
        await exportStorageSnapshot(
          client,
          snapshot,
          config.projectRef,
          process.env.BACKUP_STORAGE_SERVICE_KEY ?? "",
        );
        await archiveHostingSource(
          config.hosting.documents,
          path.join(snapshot, "hosting/private-files.tar.gz"),
          config.tools.tar,
        );
        await archiveHostingSource(
          config.hosting.configuration,
          path.join(snapshot, "hosting/configuration.tar.gz"),
          config.tools.tar,
        );
      },
    );
    await writeFile(
      path.join(snapshot, "source-inventory.json"),
      JSON.stringify({ sha256: config.sourceInventorySha256 }),
      { flag: "wx", mode: 0o600 },
    );
    await sealSnapshot(snapshot, config.projectRef, database.snapshotAt);
    const encrypted = await encryptBackup({
      directory: snapshot,
      projectRef: config.projectRef,
      outputRoot: job,
      recipientFile: config.recipientFile,
      tools: config.tools,
    });
    const receipt = await publishBackup({
      ...encrypted,
      tools: config.tools,
      ...config.drive,
      recipientFile: config.recipientFile,
    });
    await writeFile(
      path.join(receipts, `${receipt.id}.json`),
      JSON.stringify(receipt, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    // Delete only a freshly created job under the verified spool, after remote read-back.
    const actual = await realpath(job);
    if (
      path.dirname(actual) !== spool ||
      actual !== job ||
      !/^job-[a-f0-9-]{36}$/.test(path.basename(actual))
    )
      throw new Error("Ruta de limpieza inesperada");
    await rm(actual, { recursive: true });
    success = true;
    console.log(
      JSON.stringify({
        id: receipt.id,
        encrypted: true,
        remoteVerified: true,
        retentionFits: receipt.capacity.retentionFits,
        restoreVerified: false,
      }),
    );
  } finally {
    if (success) {
      await rm(path.join(lock, "job.json"));
      await rmdir(lock);
    }
    // Failure retains one job and its lock for investigation, preventing runaway copies.
  }
}
main().catch(() => {
  console.error(
    "Copia no completada. Se conserva el trabajo privado para revisión; no forzar el bloqueo ni declarar el respaldo válido.",
  );
  process.exitCode = 1;
});
