import { readFile } from "node:fs/promises";
import { z } from "zod";
import { exportPostgresSnapshot } from "./ops/postgres-snapshot";

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error("Falta configuración privada");
  const config = z
    .object({
      directory: z.string().min(1),
      projectRef: z.string(),
      mode: z.enum(["supabase", "synthetic"]),
      pgDump: z.string().min(1),
      pgDumpAll: z.string().min(1),
    })
    .strict()
    .parse(JSON.parse(await readFile(file, "utf8")));
  const result = await exportPostgresSnapshot(config);
  console.log(
    JSON.stringify({
      databaseSnapshotConsistent: result.databaseSnapshotConsistent,
      storageBytesIncluded: false,
      hostingIncluded: false,
      restoreVerified: false,
    }),
  );
}
main().catch(() => {
  console.error(
    "Exportación PostgreSQL no completada. Revisar acceso privado y versiones; no considerar recuperable este directorio.",
  );
  process.exitCode = 1;
});
