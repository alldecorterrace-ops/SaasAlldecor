import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  backupDigest,
  type BackupManifest,
} from "../src/lib/backup-verification";
import { encryptBackup, recoverBackupFiles } from "./ops/backup-package";
import { commandFile, commandText } from "./ops/process";
import { planStorageRecovery } from "./ops/storage-recovery";

async function main() {
  const age = process.env.AGE_BIN,
    keygen = process.env.AGE_KEYGEN_BIN,
    rclone = process.env.RCLONE_BIN;
  if (!age || !keygen || !rclone)
    throw new Error("Provide verified age, age-keygen and rclone executables");
  const tools = { age, rclone, tar: process.env.TAR_BIN ?? "tar" };
  const root = path.resolve(".local", `backup-rehearsal-${randomUUID()}`);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const identity = path.join(root, "synthetic-identity.txt"),
    recipient = path.join(root, "recipient.txt");
  // Synthetic throwaway identity only. No owner's recovery key or live data used.
  await commandFile(keygen, [], identity);
  await commandFile(keygen, ["-y", identity], recipient);
  const snapshot = path.join(root, "snapshot");
  await mkdir(snapshot, { mode: 0o700 });
  const manifest: BackupManifest = {
    version: 1,
    projectRef: "abcdefghijklmnopqrst",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    fullSnapshot: true,
    artifacts: [],
  };
  const storageSource = {
    id: "synthetic-object-id",
    bucket_id: "work-files",
    name: "synthetic-company/record/sample.txt",
    metadata: {
      size: Buffer.byteLength("synthetic storage object\n"),
      mimetype: "text/plain",
      eTag: "synthetic",
    },
  };
  const objectPath = `storage/objects/${createHash("sha256")
    .update(storageSource.bucket_id + "\0" + storageSource.name)
    .digest("hex")}`;
  const artifacts: Record<string, string> = {
    "database/roles.sql": "-- synthetic roles only\n",
    "database/schema.sql": "CREATE TABLE synthetic_document(id integer);\n",
    "database/data.sql": "INSERT INTO synthetic_document VALUES(1);\n",
    "database/managed-schema.sql": "-- synthetic managed schema contract\n",
    "hosting/private-files.tar.gz":
      "synthetic placeholder, not a hosting backup\n",
    "hosting/configuration.tar.gz":
      "synthetic placeholder, not a configuration backup\n",
    "storage/buckets.json": JSON.stringify([
      {
        id: "work-files",
        name: "work-files",
        public: false,
        file_size_limit: 5000000,
        allowed_mime_types: ["text/plain"],
      },
    ]),
    [objectPath]: "synthetic storage object\n",
  };
  for (const [name, body] of Object.entries(artifacts)) {
    const target = path.join(snapshot, name);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, body, { flag: "wx", mode: 0o600 });
    manifest.artifacts.push({
      path: name,
      bytes: (await stat(target)).size,
      sha256: await backupDigest(target),
    });
  }
  const storage = manifest.artifacts
    .filter((x) => x.path.startsWith("storage/objects/"))
    .map((x) => ({ ...x, source: storageSource }));
  await writeFile(
    path.join(snapshot, "storage/manifest.json"),
    JSON.stringify(storage),
    { flag: "wx", mode: 0o600 },
  );
  manifest.artifacts.push({
    path: "storage/manifest.json",
    bytes: (await stat(path.join(snapshot, "storage/manifest.json"))).size,
    sha256: await backupDigest(path.join(snapshot, "storage/manifest.json")),
  });
  await writeFile(
    path.join(snapshot, "manifest.json"),
    JSON.stringify(manifest),
    { flag: "wx", mode: 0o600 },
  );
  const encrypted = await encryptBackup({
    directory: snapshot,
    projectRef: manifest.projectRef,
    outputRoot: root,
    recipientFile: recipient,
    tools,
  });
  const file = path.join(
    encrypted.directory,
    encrypted.receipt.ciphertext.path,
  );
  const transfer = path.join(root, "local-transport-rehearsal.age");
  // Local rclone transport validates tooling only. It is explicitly not Drive proof.
  await commandText(rclone, ["copyto", file, transfer, "--immutable"]);
  assert.equal(
    await backupDigest(transfer),
    encrypted.receipt.ciphertext.sha256,
  );
  const restored = await recoverBackupFiles({
    ciphertext: transfer,
    receipt: encrypted.receipt,
    identityFile: identity,
    outputRoot: root,
    tools,
  });
  assert.equal(restored.files, 9);
  assert.equal(restored.storageObjects, 1);
  assert.equal(
    await readFile(path.join(restored.directory, objectPath), "utf8"),
    artifacts[objectPath],
  );
  const storagePlan = await planStorageRecovery({
    directory: restored.directory,
    sourceProjectRef: manifest.projectRef,
    targetProjectRef: "z".repeat(20),
    manifestSha256: encrypted.receipt.manifestSha256,
    maxObjectBytes: 5000000,
  });
  assert.equal(storagePlan.objects[0].source.name, storageSource.name);
  assert.equal(storagePlan.totalBytes, storageSource.metadata.size);
  const bad = path.join(root, "corrupt.age"),
    bytes = await readFile(transfer);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(bad, bytes, { flag: "wx", mode: 0o600 });
  await assert.rejects(
    recoverBackupFiles({
      ciphertext: bad,
      receipt: encrypted.receipt,
      identityFile: identity,
      outputRoot: root,
      tools,
    }),
    /Huella/,
  );
  // Even a matching outer digest cannot bypass age's authenticated decryption.
  await assert.rejects(
    recoverBackupFiles({
      ciphertext: bad,
      receipt: {
        ...encrypted.receipt,
        ciphertext: {
          ...encrypted.receipt.ciphertext,
          sha256: await backupDigest(bad),
        },
      },
      identityFile: identity,
      outputRoot: root,
      tools,
    }),
  );
  console.log(
    JSON.stringify({
      synthetic: true,
      encryption: "age",
      transport: "rclone-local",
      filesRecovered: restored.files,
      tamperingRejected: true,
      storageRecoveryPlanVerified: true,
      storageServiceRestored: false,
      driveVerified: false,
      databaseRestored: false,
      applicationRestored: false,
      durationMs: restored.durationMs,
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Synthetic recovery test failed",
  );
  process.exitCode = 1;
});
