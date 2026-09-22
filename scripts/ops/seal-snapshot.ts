import { lstat, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  backupArtifactPath,
  backupDigest,
  verifyBackup,
  type BackupManifest,
} from "../../src/lib/backup-verification";

/** Caller must already have captured every source component at the intended point.
 * This enumerates bytes; completeness against a live source needs separate evidence. */
export async function sealSnapshot(
  directory: string,
  projectRef: string,
  startedAt: string,
) {
  const manifest: BackupManifest = {
    version: 1,
    projectRef,
    startedAt,
    completedAt: new Date().toISOString(),
    fullSnapshot: true,
    artifacts: [],
  };
  async function walk(relative: string) {
    for (const name of (await readdir(path.join(directory, relative))).sort()) {
      const entry = relative ? `${relative}/${name}` : name;
      backupArtifactPath(entry);
      if (entry === "manifest.json")
        throw new Error("El snapshot ya tiene manifiesto");
      const target = path.join(directory, entry),
        info = await lstat(target);
      if (info.isDirectory()) await walk(entry);
      else if (info.isFile())
        manifest.artifacts.push({
          path: entry,
          bytes: info.size,
          sha256: await backupDigest(target),
        });
      else
        throw new Error("Snapshot con enlaces o tipos de archivo no admitidos");
    }
  }
  await walk("");
  await verifyBackup(directory, manifest, projectRef);
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  return manifest;
}
