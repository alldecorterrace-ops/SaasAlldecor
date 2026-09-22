import { createHash } from "node:crypto";
import { mkdir, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { Client } from "pg";
import { backupDigest } from "../../src/lib/backup-verification";
import { outputFile } from "./process";

type StorageRow = {
  id: string;
  bucket_id: string;
  name: string;
  metadata?: { size?: number; eTag?: string };
  version?: string;
};
export function storageDownload(row: StorageRow, projectRef: string) {
  if (
    !/^[a-z]{20}$/.test(projectRef) ||
    !row.bucket_id ||
    !row.name ||
    [row.bucket_id, ...row.name.split("/")].some(
      (x) => !x || x === "." || x === ".." || /[\x00-\x1f\\]/.test(x),
    )
  )
    throw new Error("Objeto de Storage inválido");
  return `https://${projectRef}.supabase.co/storage/v1/object/authenticated/${encodeURIComponent(row.bucket_id)}/${row.name.split("/").map(encodeURIComponent).join("/")}`;
}
function etag(value: string) {
  return value.replace(/^"|"$/g, "");
}

/** Called while the same database snapshot used by pg_dump remains open.
 * Objects must retain a strong ETag matching snapshot metadata; otherwise fail. */
export async function exportStorageSnapshot(
  client: Client,
  directory: string,
  projectRef: string,
  serviceKey: string,
) {
  if (!serviceKey)
    throw new Error("Credencial privada de Storage no configurada");
  const root = path.join(directory, "storage");
  await mkdir(path.join(root, "objects"), { recursive: true, mode: 0o700 });
  const buckets = (
    await client.query(
      "select to_jsonb(b) item from storage.buckets b order by id",
    )
  ).rows.map((x) => x.item);
  const rows: StorageRow[] = (
    await client.query(
      "select to_jsonb(o) item from storage.objects o order by bucket_id,name",
    )
  ).rows.map((x) => x.item);
  const manifest = [];
  for (const row of rows) {
    const expectedTag = row.metadata?.eTag;
    if (
      !expectedTag ||
      expectedTag.startsWith("W/") ||
      !Number.isSafeInteger(row.metadata?.size) ||
      row.metadata!.size! < 0
    )
      throw new Error(
        "Storage carece de tamaño o ETag fuerte para verificar el snapshot",
      );
    const disk = await statfs(root);
    if (disk.bavail * disk.bsize < row.metadata!.size! * 1.2 + 16 * 1024 * 1024)
      throw new Error("Espacio insuficiente para descargar Storage");
    const response = await fetch(storageDownload(row, projectRef), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "If-Match": `"${etag(expectedTag)}"`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(300000),
    });
    const actualTag = response.headers.get("etag");
    if (
      !response.ok ||
      !response.body ||
      !actualTag ||
      actualTag.startsWith("W/") ||
      etag(actualTag) !== etag(expectedTag)
    ) {
      await response.body?.cancel();
      throw new Error(
        "Objeto de Storage ausente o modificado después del snapshot",
      );
    }
    const name = createHash("sha256")
      .update(row.bucket_id + "\0" + row.name)
      .digest("hex");
    const file = path.join(root, "objects", name);
    const reader = response.body.getReader();
    async function* chunks() {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    }
    await outputFile(Readable.from(chunks()), file);
    const bytes = (await stat(file)).size;
    if (bytes !== row.metadata!.size)
      throw new Error("Tamaño de Storage distinto al snapshot");
    manifest.push({
      path: `storage/objects/${name}`,
      bytes,
      sha256: await backupDigest(file),
      source: row,
    });
  }
  await writeFile(
    path.join(root, "buckets.json"),
    JSON.stringify(buckets, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  return { buckets: buckets.length, objects: manifest.length };
}
