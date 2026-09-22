import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  backupArtifactPath,
  backupDigest,
  verifyBackup,
  type BackupManifest,
} from "../../src/lib/backup-verification";
import {
  commandFile,
  commandText,
  outputFile,
  processChild,
  stopChildren,
} from "./process";

export type EncryptedBackup = {
  version: 1;
  id: string;
  projectRef: string;
  startedAt: string;
  snapshotCompletedAt: string;
  encryptedAt: string;
  fullSnapshot: true;
  encrypted: true;
  ciphertext: { path: string; bytes: number; sha256: string };
  manifestSha256: string;
  recipientSha256: string;
  restoreVerified: false;
};
export type BackupTools = { age: string; tar: string; rclone: string };

export async function encryptBackup(input: {
  directory: string;
  projectRef: string;
  outputRoot: string;
  recipientFile: string;
  tools: BackupTools;
}) {
  const root = await realpath(input.directory);
  if (!(await lstat(path.join(root, "manifest.json"))).isFile())
    throw new Error("Manifiesto no regular");
  const raw = await readFile(path.join(root, "manifest.json"), "utf8");
  const manifest: BackupManifest = JSON.parse(raw);
  await verifyBackup(root, manifest, input.projectRef);
  if (manifest.artifacts.some((x) => x.path === "manifest.json"))
    throw new Error("Manifiesto autorreferente");
  const recipient = (await readFile(input.recipientFile, "utf8")).trim();
  // Only one public native age recipient; no private key, plugin or executable.
  if (!/^age1[ac-hj-np-z02-9]{58}$/.test(recipient))
    throw new Error("Se requiere una única clave pública age");
  const outputRoot = await realpath(input.outputRoot);
  const expectedBytes = manifest.artifacts.reduce((sum, x) => sum + x.bytes, 0);
  const disk = await statfs(outputRoot);
  if (
    !Number.isSafeInteger(expectedBytes) ||
    disk.bavail * disk.bsize < expectedBytes * 1.2 + 16 * 1024 * 1024
  )
    throw new Error("No hay espacio temporal suficiente para cifrar");
  const id = `backup-${new Date().toISOString().replace(/[-:.]/g, "")}-${randomUUID()}`;
  const run = path.join(outputRoot, id);
  await mkdir(run, { mode: 0o700 });
  const listFile = path.join(run, "files.txt");
  await writeFile(
    listFile,
    ["manifest.json", ...manifest.artifacts.map((x) => x.path)].join("\0") +
      "\0",
    { flag: "wx", mode: 0o600 },
  );
  const encrypted = path.join(run, `${id}.tar.gz.age`);
  const tar = processChild(input.tools.tar, [
    "-czf",
    "-",
    "-C",
    root,
    "--null",
    "-T",
    listFile,
  ]);
  const age = processChild(input.tools.age, [
    "--encrypt",
    "--recipient",
    recipient,
  ]);
  tar.child.stdin.end();
  try {
    await Promise.all([
      pipeline(tar.child.stdout, age.child.stdin),
      outputFile(age.child.stdout, encrypted),
      tar.finished,
      age.finished,
    ]);
  } catch (error) {
    await stopChildren([tar.child, age.child]);
    throw error;
  }
  // Detect a concurrent change in the staged snapshot before producing a receipt.
  if (raw !== (await readFile(path.join(root, "manifest.json"), "utf8")))
    throw new Error("El manifiesto cambió durante el cifrado");
  await verifyBackup(root, manifest, input.projectRef);
  const receipt: EncryptedBackup = {
    version: 1,
    id,
    projectRef: input.projectRef,
    startedAt: manifest.startedAt,
    snapshotCompletedAt: manifest.completedAt,
    encryptedAt: new Date().toISOString(),
    fullSnapshot: true,
    encrypted: true,
    ciphertext: {
      path: path.basename(encrypted),
      bytes: (await stat(encrypted)).size,
      sha256: await backupDigest(encrypted),
    },
    manifestSha256: createHash("sha256").update(raw).digest("hex"),
    recipientSha256: createHash("sha256").update(recipient).digest("hex"),
    restoreVerified: false,
  };
  await writeFile(
    path.join(run, "encrypted-receipt.json"),
    JSON.stringify(receipt, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  return { directory: run, receipt };
}

export function retentionCapacity(
  bytes: number,
  quota: { free?: number },
  existingVerifiedBytes = 0,
) {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    !Number.isSafeInteger(existingVerifiedBytes) ||
    existingVerifiedBytes < 0 ||
    !Number.isSafeInteger(quota.free) ||
    quota.free! < 0
  )
    throw new Error("Cuota desconocida o inválida");
  // 42 four-hour copies + 4 weekly + 1 in-progress copy, with 20% headroom.
  const requiredBytes = Math.ceil(bytes * 47 * 1.2);
  return {
    requiredBytes,
    availableBytes: quota.free! + existingVerifiedBytes,
    retentionFits: quota.free! + existingVerifiedBytes >= requiredBytes,
  };
}

/** Uploads ciphertext only. A full read-back hash is required for every receipt. */
export async function publishBackup(input: {
  directory: string;
  receipt: EncryptedBackup;
  tools: BackupTools;
  rcloneConfig: string;
  remote: string;
  folderId: string;
  recipientFile: string;
}) {
  if (
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(input.remote) ||
    !/^[A-Za-z0-9_-]{10,100}$/.test(input.folderId)
  )
    throw new Error("Destino inválido");
  const file = path.join(
    input.directory,
    backupArtifactPath(input.receipt.ciphertext.path),
  );
  if (
    !/^[a-f0-9]{64}$/.test(input.receipt.ciphertext.sha256) ||
    (await backupDigest(file)) !== input.receipt.ciphertext.sha256
  )
    throw new Error("El archivo cifrado cambió");
  // Inspect only redacted configuration. Never capture an OAuth token in output.
  const redacted = await commandText(input.tools.rclone, [
    "config",
    "redacted",
    input.remote,
    "--config",
    input.rcloneConfig,
  ]);
  if (!/^type\s*=\s*drive\s*$/m.test(redacted))
    throw new Error("El remoto debe ser Google Drive directo");
  const flags = [
    "--config",
    input.rcloneConfig,
    "--drive-root-folder-id",
    input.folderId,
    "--retries",
    "2",
    "--low-level-retries",
    "2",
    "--contimeout",
    "20s",
    "--timeout",
    "2m",
  ];
  const target = `${input.remote}:`;
  const quota: { free?: number } = JSON.parse(
    await commandText(input.tools.rclone, [
      "about",
      target,
      "--json",
      ...flags,
    ]),
  );
  const capacity = retentionCapacity(input.receipt.ciphertext.bytes, quota);
  if (quota.free! < input.receipt.ciphertext.bytes * 1.2)
    throw new Error("Cuota insuficiente para subir esta copia");
  // One unique object; no sync, purge, remote rename or deletion.
  const destination = target + input.receipt.ciphertext.path;
  const disk = await statfs(input.directory);
  if (
    disk.bavail * disk.bsize <
    input.receipt.ciphertext.bytes * 1.2 + 16 * 1024 * 1024
  )
    throw new Error("Espacio insuficiente para verificar la descarga remota");
  await commandText(input.tools.rclone, [
    "copyto",
    file,
    destination,
    "--immutable",
    ...flags,
  ]);
  const downloaded = path.join(input.directory, "remote-readback.age");
  await commandFile(
    input.tools.rclone,
    ["cat", destination, ...flags],
    downloaded,
  );
  if (
    (await stat(downloaded)).size !== input.receipt.ciphertext.bytes ||
    (await backupDigest(downloaded)) !== input.receipt.ciphertext.sha256
  )
    throw new Error(
      "La copia descargada no coincide; respaldo remoto no verificado",
    );
  const receipt = {
    ...input.receipt,
    completedAt: new Date().toISOString(),
    remoteVerified: true,
    remoteObject: input.receipt.ciphertext.path,
    folderId: input.folderId,
    capacity,
  };
  await writeFile(
    path.join(input.directory, "remote-receipt.json"),
    JSON.stringify(receipt, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  // Preserve the recovery receipt on Drive too, encrypted with the owner's public key.
  // The private decryption key never enters this process.
  const recipient = (await readFile(input.recipientFile, "utf8")).trim();
  if (
    !/^age1[ac-hj-np-z02-9]{58}$/.test(recipient) ||
    createHash("sha256").update(recipient).digest("hex") !==
      receipt.recipientSha256
  )
    throw new Error("La clave pública de recuperación cambió");
  const receiptCipher = path.join(
    input.directory,
    `${receipt.id}.receipt.json.age`,
  );
  await commandFile(
    input.tools.age,
    [
      "--encrypt",
      "--recipient",
      recipient,
      path.join(input.directory, "remote-receipt.json"),
    ],
    receiptCipher,
  );
  const receiptTarget = target + path.basename(receiptCipher);
  await commandText(input.tools.rclone, [
    "copyto",
    receiptCipher,
    receiptTarget,
    "--immutable",
    ...flags,
  ]);
  const receiptReadback = path.join(input.directory, "receipt-readback.age");
  await commandFile(
    input.tools.rclone,
    ["cat", receiptTarget, ...flags],
    receiptReadback,
  );
  if (
    (await backupDigest(receiptCipher)) !==
    (await backupDigest(receiptReadback))
  )
    throw new Error("Recibo remoto no verificado");
  return receipt;
}

/** Extracts into a new isolated folder after checking the trusted ciphertext hash.
 * This verifies recovered files, not a database/application restore or RTO. */
export async function recoverBackupFiles(input: {
  ciphertext: string;
  receipt: EncryptedBackup;
  identityFile: string;
  outputRoot: string;
  tools: BackupTools;
}) {
  const started = Date.now();
  if (
    !/^[a-f0-9]{64}$/.test(input.receipt.ciphertext.sha256) ||
    (await backupDigest(input.ciphertext)) !== input.receipt.ciphertext.sha256
  )
    throw new Error("Huella del respaldo cifrado incorrecta");
  const run = path.join(
    await realpath(input.outputRoot),
    `restore-${randomUUID()}`,
  );
  await mkdir(run, { mode: 0o700 });
  const archive = path.join(run, "decrypted.tar.gz");
  await commandFile(
    input.tools.age,
    ["--decrypt", "--identity", input.identityFile, input.ciphertext],
    archive,
  );
  // Reject links, devices, absolute/traversal/control-character entries before extraction.
  const listing = await commandText(input.tools.tar, ["-tzf", archive]);
  const names = listing.split(/\r?\n/).filter(Boolean);
  if (!names.length || new Set(names).size !== names.length)
    throw new Error("Archivo duplicado o vacío");
  for (const name of names) backupArtifactPath(name);
  const verbose = await commandText(input.tools.tar, ["-tvzf", archive]);
  if (
    verbose
      .split(/\r?\n/)
      .filter(Boolean)
      .some((line) => !line.startsWith("-"))
  )
    throw new Error("El archivo contiene enlaces o tipos no permitidos");
  const restored = path.join(run, "snapshot");
  await mkdir(restored, { mode: 0o700 });
  await commandText(input.tools.tar, [
    "-xzf",
    archive,
    "-C",
    restored,
    "--no-same-owner",
    "--no-same-permissions",
  ]);
  const raw = await readFile(path.join(restored, "manifest.json"), "utf8");
  if (
    createHash("sha256").update(raw).digest("hex") !==
    input.receipt.manifestSha256
  )
    throw new Error("Manifiesto restaurado incorrecto");
  const manifest: BackupManifest = JSON.parse(raw);
  const expected = [
    "manifest.json",
    ...manifest.artifacts.map((x) => x.path),
  ].sort();
  if (JSON.stringify(names.sort()) !== JSON.stringify(expected))
    throw new Error("Contenido inesperado en el paquete");
  const verified = await verifyBackup(
    restored,
    manifest,
    input.receipt.projectRef,
  );
  return {
    directory: restored,
    files: verified.files,
    storageObjects: verified.storageObjects,
    filesRecovered: true,
    databaseRestored: false,
    applicationRestored: false,
    durationMs: Date.now() - started,
  };
}
