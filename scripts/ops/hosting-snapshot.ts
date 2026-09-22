import { lstat, readdir, realpath, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  backupArtifactPath,
  backupDigest,
} from "../../src/lib/backup-verification";
import { commandFile } from "./process";

export type HostingSource = { root: string; paths: string[] };
export async function archiveHostingSource(
  source: HostingSource,
  destination: string,
  tar: string,
) {
  const root = await realpath(source.root);
  if (!source.paths.length)
    throw new Error("No se han especificado archivos de hosting");
  const files = new Map<string, { bytes: number; sha256: string }>();
  async function visit(relative: string) {
    backupArtifactPath(relative);
    const target = path.join(root, relative),
      info = await lstat(target);
    if ((await realpath(target)) !== target || info.isSymbolicLink())
      throw new Error(
        "Resolver explícitamente los enlaces antes de respaldar el hosting",
      );
    if (info.isDirectory()) {
      for (const name of (await readdir(target)).sort())
        await visit(`${relative}/${name}`);
    } else if (info.isFile())
      files.set(relative, {
        bytes: info.size,
        sha256: await backupDigest(target),
      });
    else throw new Error("Tipo de archivo de hosting no admitido");
    if (files.size > 100000)
      throw new Error("Revisar alcance del respaldo de hosting");
  }
  for (const name of source.paths) await visit(name);
  if (!files.size)
    throw new Error("Componente de hosting vacío; revisar inventario");
  const bytes = [...files.values()].reduce((sum, item) => sum + item.bytes, 0),
    disk = await statfs(path.dirname(destination));
  if (
    !Number.isSafeInteger(bytes) ||
    disk.bavail * disk.bsize < bytes * 1.2 + 16 * 1024 * 1024
  )
    throw new Error("Espacio insuficiente para copiar hosting");
  const list = destination + ".files";
  await writeFile(list, [...files.keys()].sort().join("\0") + "\0", {
    flag: "wx",
    mode: 0o600,
  });
  await commandFile(
    tar,
    ["-czf", "-", "-C", root, "--null", "-T", list],
    destination,
  );
  for (const [name, expected] of files) {
    const file = path.join(root, name);
    if (
      (await lstat(file)).size !== expected.bytes ||
      (await backupDigest(file)) !== expected.sha256
    )
      throw new Error("El hosting cambió durante el respaldo; repetir");
  }
  // A second inventory catches new/deleted files within selected directories too.
  const before = JSON.stringify([...files].sort());
  files.clear();
  for (const name of source.paths) await visit(name);
  if (before !== JSON.stringify([...files].sort()))
    throw new Error("El inventario del hosting cambió durante la copia");
  await writeFile(
    destination + ".inventory.json",
    JSON.stringify(
      [...files].map(([name, data]) => ({ path: name, ...data })),
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  return {
    files: files.size,
    bytes: [...files.values()].reduce((sum, file) => sum + file.bytes, 0),
  };
}
