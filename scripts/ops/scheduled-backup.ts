import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { z } from "zod";

const absolute = z.string().refine((value) => path.isAbsolute(value));
const configuration = z
  .object({
    projectRef: z.string().regex(/^[a-z]{20}$/),
    appRoot: absolute,
    appRevision: z.string().regex(/^[a-f0-9]{40}$/),
    webConfiguration: absolute,
    databaseConnectionFile: absolute,
    backupConfigurationFile: absolute,
    sourceInventoryFile: absolute,
    libraryDirectory: absolute,
    logRoot: absolute,
  })
  .strict();

async function plainFile(file: string) {
  const info = await lstat(file);
  if (!info.isFile() || info.size > 1024 * 1024)
    throw new Error("Archivo de configuración no válido");
  return readFile(file, "utf8");
}

export async function prepareScheduledBackup(value: unknown) {
  const config = configuration.parse(value);
  if ((await realpath(config.appRoot)) !== config.appRoot)
    throw new Error("Entrega activa no resuelta");
  const revision = (
    await plainFile(path.join(config.appRoot, "REVISION"))
  ).trim();
  const web = await plainFile(config.webConfiguration);
  const active = [...web.matchAll(/^PassengerAppRoot\s+(.+)$/gm)];
  if (
    revision !== config.appRevision ||
    active.length !== 1 ||
    active[0][1].trim() !== config.appRoot
  )
    throw new Error(
      "La entrega cambió; revisar el inventario antes del respaldo",
    );
  const application = parseEnv(
    await plainFile(path.join(config.appRoot, ".env.local")),
  );
  if (
    application.APP_ENVIRONMENT !== "production" ||
    application.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${config.projectRef}.supabase.co`
  )
    throw new Error("Origen de producción no confirmado");
  const storageKey = application.WEB_NOTICE_SUPABASE_SERVICE_KEY;
  if (!storageKey) throw new Error("Credencial de Storage no disponible");
  const connection = z
    .object({
      PGHOST: z
        .string()
        .regex(
          /^(?:db\.[a-z]{20}\.supabase\.co|aws-[a-z0-9-]+\.pooler\.supabase\.com)$/,
        ),
      PGPORT: z.union([z.literal("5432"), z.literal(5432)]),
      PGDATABASE: z.literal("postgres"),
      PGUSER: z.string(),
      PGPASSFILE: absolute,
      PGSSLROOTCERT: absolute,
      PGSSLMODE: z.literal("verify-full"),
      PGCONNECT_TIMEOUT: z.coerce.number().int().min(1).max(120).optional(),
    })
    .strict()
    .parse(JSON.parse(await plainFile(config.databaseConnectionFile)));
  if (connection.PGUSER !== `postgres.${config.projectRef}`)
    throw new Error("Conexión ajena al proyecto esperado");
  await plainFile(connection.PGPASSFILE);
  await plainFile(connection.PGSSLROOTCERT);
  const backup = z
    .object({
      projectRef: z.literal(config.projectRef),
      spoolRoot: absolute,
      receiptRoot: absolute,
      sourceInventorySha256: z.string(),
    })
    .passthrough()
    .parse(JSON.parse(await plainFile(config.backupConfigurationFile)));
  const inventory = await plainFile(config.sourceInventoryFile);
  if (
    createHash("sha256").update(inventory).digest("hex") !==
    backup.sourceInventorySha256
  )
    throw new Error("Inventario no coincide con la configuración revisada");
  const inventoryData = JSON.parse(inventory);
  if (
    inventoryData.projectRef !== config.projectRef ||
    inventoryData.activeRevision !== config.appRevision ||
    !isDeepStrictEqual(backup.hosting, {
      documents: inventoryData.documents,
      configuration: inventoryData.configuration,
    })
  )
    throw new Error("Inventario de otra entrega o proyecto");
  try {
    await lstat(path.join(backup.spoolRoot, "backup.lock"));
    throw new Error(
      "Hay una copia pendiente de revisión; no se fuerza el bloqueo",
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  for (const directory of [
    config.logRoot,
    config.libraryDirectory,
    backup.spoolRoot,
    backup.receiptRoot,
  ]) {
    if (
      (await realpath(directory)) !== directory ||
      !(await lstat(directory)).isDirectory()
    )
      throw new Error("Directorio privado no resuelto");
  }
  const cli = path.join(config.appRoot, "node_modules/tsx/dist/cli.mjs");
  const runner = path.join(config.appRoot, "scripts/run-backup.ts");
  if (!(await lstat(cli)).isFile() || !(await lstat(runner)).isFile())
    throw new Error("Ejecutor publicado no disponible");
  // Intentionally do not inherit application credentials, NODE_OPTIONS or shell state.
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    PATH: `${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin`,
    LANG: "C.UTF-8",
    TZ: "UTC",
    LD_LIBRARY_PATH: config.libraryDirectory,
    NODE_EXTRA_CA_CERTS: connection.PGSSLROOTCERT,
    BACKUP_STORAGE_SERVICE_KEY: storageKey,
    RCLONE_LOG_LEVEL: "ERROR",
  };
  for (const [key, item] of Object.entries(connection))
    if (item !== undefined) env[key] = String(item);
  return { config, args: [cli, runner, config.backupConfigurationFile], env };
}
