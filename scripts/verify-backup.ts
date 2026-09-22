import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyBackup } from "../src/lib/backup-verification";

async function main() {
  const [directory, projectRef] = process.argv.slice(2);
  if (!directory || !projectRef)
    throw new Error("Uso: verify-backup.ts directorio project-ref");
  try {
    const manifest = JSON.parse(
      await readFile(path.join(directory, "manifest.json"), "utf8"),
    );
    console.log(
      JSON.stringify(await verifyBackup(directory, manifest, projectRef)),
    );
  } catch {
    console.error(
      "Respaldo no verificado. Revisar localmente el manifiesto y sus archivos privados.",
    );
    process.exitCode = 1;
  }
}
main().catch(() => {
  console.error("Uso: verify-backup.ts directorio project-ref");
  process.exitCode = 1;
});
