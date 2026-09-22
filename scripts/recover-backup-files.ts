import { readFile } from "node:fs/promises";
import { z } from "zod";
import { recoverBackupFiles, type EncryptedBackup } from "./ops/backup-package";

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error("Falta configuración privada de recuperación");
  const config = z
    .object({
      ciphertext: z.string(),
      receiptFile: z.string(),
      identityFile: z.string(),
      outputRoot: z.string(),
      tools: z
        .object({ age: z.string(), tar: z.string(), rclone: z.string() })
        .strict(),
    })
    .strict()
    .parse(JSON.parse(await readFile(file, "utf8")));
  const receipt: EncryptedBackup = JSON.parse(
    await readFile(config.receiptFile, "utf8"),
  );
  const restored = await recoverBackupFiles({ ...config, receipt });
  console.log(JSON.stringify(restored));
}
main().catch(() => {
  console.error(
    "Recuperación de archivos no verificada; conservar el respaldo original y revisar en el entorno privado.",
  );
  process.exitCode = 1;
});
