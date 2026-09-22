import { readFile } from "node:fs/promises";
import { z } from "zod";
import { encryptBackup, publishBackup } from "./ops/backup-package";

const configSchema = z
  .object({
    directory: z.string().min(1),
    projectRef: z.string().regex(/^[a-z]{20}$/),
    outputRoot: z.string().min(1),
    recipientFile: z.string().min(1),
    tools: z
      .object({
        age: z.string().min(1),
        tar: z.string().min(1),
        rclone: z.string().min(1),
      })
      .strict(),
    drive: z
      .object({
        rcloneConfig: z.string().min(1),
        remote: z.string().min(1),
        folderId: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

async function main() {
  const [configFile] = process.argv.slice(2);
  if (!configFile) throw new Error("Falta archivo privado de configuración");
  const config = configSchema.parse(
    JSON.parse(await readFile(configFile, "utf8")),
  );
  const encrypted = await encryptBackup(config);
  if (config.drive) {
    const receipt = await publishBackup({
      ...encrypted,
      tools: config.tools,
      recipientFile: config.recipientFile,
      ...config.drive,
    });
    console.log(
      JSON.stringify({
        id: receipt.id,
        encrypted: true,
        remoteVerified: true,
        retentionFits: receipt.capacity.retentionFits,
        restoreVerified: false,
      }),
    );
  } else
    console.log(
      JSON.stringify({
        id: encrypted.receipt.id,
        encrypted: true,
        remoteVerified: false,
        restoreVerified: false,
      }),
    );
}
main().catch(() => {
  console.error(
    "Respaldo no completado. Revisar en el entorno privado la configuración, acceso, cuota e integridad; no activar la programación.",
  );
  process.exitCode = 1;
});
