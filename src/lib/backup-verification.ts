import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export type BackupArtifact = { path: string; bytes: number; sha256: string };
export type BackupManifest = {
  version: 1;
  projectRef: string;
  startedAt: string;
  completedAt: string;
  fullSnapshot: true;
  artifacts: BackupArtifact[];
};
const required = [
  "database/roles.sql",
  "database/schema.sql",
  "database/data.sql",
  "database/managed-schema.sql",
  "storage/manifest.json",
  "hosting/private-files.tar.gz",
  "hosting/configuration.tar.gz",
];
const digest = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (data) => h.update(data))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
function artifactPath(value: string) {
  if (
    !value ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[a-zA-Z]:/.test(value) ||
    value.split("/").some((p) => p === ".." || p === "." || !p)
  )
    throw new Error("Ruta de respaldo inválida");
  return value;
}

/** Checks local bytes, not whether PostgreSQL can restore or Drive received them. */
export async function verifyBackup(
  directory: string,
  manifest: BackupManifest,
  expectedProject: string,
) {
  if (
    manifest.version !== 1 ||
    manifest.fullSnapshot !== true ||
    !/^[a-z]{20}$/.test(expectedProject) ||
    manifest.projectRef !== expectedProject
  )
    throw new Error("Respaldo de proyecto o formato incorrecto");
  const start = Date.parse(manifest.startedAt),
    end = Date.parse(manifest.completedAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end ||
    end > Date.now() + 60000
  )
    throw new Error("Fechas inválidas");
  const root = await realpath(directory),
    names = new Set<string>();
  for (const item of manifest.artifacts) {
    const name = artifactPath(item.path);
    if (
      names.has(name) ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw new Error("Manifiesto de archivos inválido");
    names.add(name);
    const file = path.join(root, ...name.split("/"));
    // Refuse both a symlink file and parent symlinks escaping the snapshot.
    if ((await realpath(file)) !== file || !(await lstat(file)).isFile())
      throw new Error("El respaldo contiene enlaces o archivos no regulares");
    if (
      (await lstat(file)).size !== item.bytes ||
      (await digest(file)) !== item.sha256
    )
      throw new Error("No coincide tamaño o huella del archivo");
  }
  if (required.some((name) => !names.has(name)))
    throw new Error("Respaldo incompleto");
  for (const name of required.filter((n) => n !== "storage/manifest.json"))
    if (manifest.artifacts.find((a) => a.path === name)!.bytes === 0)
      throw new Error("Componente vacío");
  const objects: { path: string; bytes: number; sha256: string }[] = JSON.parse(
    await readFile(path.join(root, "storage/manifest.json"), "utf8"),
  );
  if (!Array.isArray(objects))
    throw new Error("Inventario de Storage inválido");
  const objectNames = new Set<string>();
  for (const object of objects) {
    if (
      !object.path?.startsWith("storage/objects/") ||
      objectNames.has(object.path)
    )
      throw new Error("Objeto de Storage inválido o duplicado");
    artifactPath(object.path);
    objectNames.add(object.path);
    const item = manifest.artifacts.find((a) => a.path === object.path);
    if (!item || item.bytes !== object.bytes || item.sha256 !== object.sha256)
      throw new Error("Falta un objeto de Storage");
  }
  if (
    manifest.artifacts.some(
      (a) => a.path.startsWith("storage/objects/") && !objectNames.has(a.path),
    )
  )
    throw new Error("Objeto ausente del inventario");
  return {
    files: manifest.artifacts.length,
    storageObjects: objects.length,
    localIntegrityVerified: true,
    remoteVerified: false,
    restoreVerified: false,
  };
}

export type BackupReceipt = {
  id: string;
  startedAt: string;
  completedAt: string;
  fullSnapshot: boolean;
  encrypted: boolean;
  remoteVerified: boolean;
};

export function planBackupRetention(
  receipts: BackupReceipt[],
  now = Date.now(),
) {
  const day = 86400000,
    seen = new Set<string>(),
    kept = new Set<string>(),
    weekly = new Map<number, BackupReceipt>();
  const valid = receipts.filter(
    (r) => r.fullSnapshot && r.encrypted && r.remoteVerified,
  );
  for (const r of receipts) {
    if (
      !/^[a-zA-Z0-9_-]+$/.test(r.id) ||
      seen.has(r.id) ||
      !Number.isFinite(Date.parse(r.startedAt)) ||
      !Number.isFinite(Date.parse(r.completedAt)) ||
      Date.parse(r.completedAt) < Date.parse(r.startedAt) ||
      Date.parse(r.completedAt) > now + 60000
    )
      throw new Error("Registro de copias inválido");
    seen.add(r.id);
  }
  if (!valid.length)
    throw new Error("No hay copia remota verificada: no eliminar");
  valid.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  kept.add(valid[0].id);
  for (const r of receipts) {
    if (!valid.includes(r)) {
      kept.add(r.id);
      continue;
    }
    const age = now - Date.parse(r.completedAt);
    if (age <= 7 * day) {
      kept.add(r.id);
      continue;
    }
    const bucket = Math.floor((age - 7 * day) / (7 * day));
    if (bucket < 4) {
      const prior = weekly.get(bucket);
      if (!prior || Date.parse(r.completedAt) > Date.parse(prior.completedAt))
        weekly.set(bucket, r);
    }
  }
  for (const r of weekly.values()) kept.add(r.id);
  return {
    keep: [...kept].sort(),
    candidates: valid.filter((r) => !kept.has(r.id)).map((r) => r.id),
    automaticDeletion: false,
  };
}

export function backupFreshness(receipts: BackupReceipt[], now = Date.now()) {
  const candidates = receipts.filter(
    (r) =>
      r.fullSnapshot &&
      r.encrypted &&
      r.remoteVerified &&
      Number.isFinite(Date.parse(r.startedAt)) &&
      Number.isFinite(Date.parse(r.completedAt)) &&
      Date.parse(r.completedAt) >= Date.parse(r.startedAt) &&
      Date.parse(r.completedAt) <= now,
  );
  const latest = candidates.sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  )[0];
  // Recovery coverage starts when the database snapshot was taken, not when upload finished.
  return {
    ok: !!latest && now - Date.parse(latest.startedAt) <= 4 * 3600000,
    latestId: latest?.id ?? null,
  };
}
