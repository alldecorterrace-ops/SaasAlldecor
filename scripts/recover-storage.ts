import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  planStorageRecovery,
  restoreStorageObjects,
  storageRecoveryClearance,
  storageRecoveryConfig,
} from "./ops/storage-recovery";

async function main() {
  const [filename, mode, ...extra] = process.argv.slice(2);
  if (!filename || extra.length || (mode && mode !== "--apply"))
    throw new Error("Uso: recover-storage CONFIG_PRIVADA.json [--apply]");
  const config = z
    .object({
      snapshot: storageRecoveryConfig,
      clearanceFile: z.string().min(1),
      receiptRoot: z.string().min(1),
    })
    .strict()
    .parse(JSON.parse(await readFile(filename, "utf8")));
  if (mode !== "--apply") {
    const plan = await planStorageRecovery(config.snapshot);
    console.log(
      JSON.stringify({
        dryRun: true,
        buckets: plan.buckets.length,
        objects: plan.objects.length,
        bytes: plan.totalBytes,
        remoteChecked: false,
        applicationRestored: false,
      }),
    );
    return;
  }
  const clearance = storageRecoveryClearance.parse(
    JSON.parse(await readFile(config.clearanceFile, "utf8")),
  );
  const receipt = await restoreStorageObjects({
    config: config.snapshot,
    clearance,
    env: process.env,
    serviceKey: process.env.RECOVERY_STORAGE_SERVICE_KEY ?? "",
  });
  await mkdir(config.receiptRoot, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(config.receiptRoot, `storage-recovery-${randomUUID()}.json`),
    JSON.stringify(receipt, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      storageBytesVerified: receipt.storageBytesVerified,
      objects: receipt.objects,
      uploaded: receipt.uploaded,
      reused: receipt.reused,
      applicationRestored: false,
    }),
  );
}
main().catch(() => {
  console.error(
    "Recuperación de Storage no verificada. Conservar el respaldo y los objetos; revisar el destino privado antes de repetir el mismo plan.",
  );
  process.exitCode = 1;
});
