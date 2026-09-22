import { createHash } from "node:crypto";
import { mkdir, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { commandFile } from "./process";

type ExportConfig = {
  directory: string;
  projectRef: string;
  mode: "supabase" | "synthetic";
  pgDump: string;
  pgDumpAll: string;
};
export function validatePostgresSource(
  config: Pick<ExportConfig, "projectRef" | "mode">,
  env: Record<string, string | undefined>,
) {
  if (!/^[a-z]{20}$/.test(config.projectRef))
    throw new Error("Referencia inválida");
  if (config.mode === "synthetic") {
    if (
      !["127.0.0.1", "localhost"].includes(env.PGHOST ?? "") ||
      env.PGDATABASE !== "saas_backup_test"
    )
      throw new Error("El ensayo solo admite saas_backup_test en loopback");
  } else {
    const direct = env.PGHOST === `db.${config.projectRef}.supabase.co`;
    const sessionPooler =
      /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(env.PGHOST ?? "") &&
      env.PGUSER === `postgres.${config.projectRef}`;
    if (
      (!direct && !sessionPooler) ||
      env.PGDATABASE !== "postgres" ||
      env.PGPORT !== "5432" ||
      !["verify-full", "verify-ca"].includes(env.PGSSLMODE ?? "")
    )
      throw new Error(
        "Se requiere conexión TLS verificada directa o por session pooler del proyecto",
      );
  }
}

/** Holds an exported MVCC snapshot open for every dump. No database mutation.
 * Managed-schema SQL is reference material, not an automatic Supabase restore. */
export async function exportPostgresSnapshot(
  config: ExportConfig,
  afterSnapshot?: (client: Client) => Promise<void>,
) {
  validatePostgresSource(config, process.env);
  const client = new Client({
    connectionTimeoutMillis: 15000,
    statement_timeout: 300000,
  });
  const directory = path.join(config.directory, "database");
  await mkdir(directory, { mode: 0o700 });
  await client.connect();
  let transaction = false;
  try {
    const roleInventory = async () =>
      JSON.stringify(
        (
          await client.query(
            "select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig from pg_roles order by rolname",
          )
        ).rows,
      );
    const rolesBefore = await roleInventory();
    await client.query("begin isolation level repeatable read read only");
    transaction = true;
    const point = (
      await client.query(
        "select pg_export_snapshot() snapshot,clock_timestamp() captured_at,current_setting('server_version') server_version",
      )
    ).rows[0];
    const dbBytes = Number(
      (
        await client.query(
          "select pg_database_size(current_database())::text bytes",
        )
      ).rows[0].bytes,
    );
    const disk = await statfs(config.directory);
    if (
      !Number.isSafeInteger(dbBytes) ||
      disk.bavail * disk.bsize < dbBytes * 6 + 256 * 1024 * 1024
    )
      throw new Error(
        "Espacio temporal insuficiente para los volcados PostgreSQL",
      );
    const scopes = ["public", "app_private", "auth", "storage"];
    const inventory = (
      await client.query(
        "select table_schema,table_name from information_schema.tables where table_schema=any($1) and table_type='BASE TABLE' order by table_schema,table_name",
        [scopes],
      )
    ).rows;
    const tables = [];
    for (const item of inventory) {
      const name = [item.table_schema, item.table_name]
        .map((x) => '"' + String(x).replaceAll('"', '""') + '"')
        .join(".");
      const count = (
        await client.query(`select count(*)::text count from ${name}`)
      ).rows[0].count;
      tables.push({ ...item, rows: count });
    }
    await afterSnapshot?.(client);
    const snapshot = [
      `--snapshot=${point.snapshot}`,
      "--no-password",
      "--lock-wait-timeout=15000",
    ];
    // Full archive retains objects omitted by a scoped schema export (extensions, etc.).
    await commandFile(
      config.pgDump,
      [...snapshot, "--format=custom"],
      path.join(directory, "full.dump"),
    );
    await commandFile(
      config.pgDump,
      [
        ...snapshot,
        "--schema-only",
        "--schema=public",
        "--schema=app_private",
        "--no-owner",
      ],
      path.join(directory, "schema.sql"),
    );
    await commandFile(
      config.pgDump,
      [
        ...snapshot,
        "--data-only",
        ...scopes.map((x) => `--schema=${x}`),
        "--no-owner",
      ],
      path.join(directory, "data.sql"),
    );
    await commandFile(
      config.pgDump,
      [
        ...snapshot,
        "--schema-only",
        "--schema=auth",
        "--schema=storage",
        "--no-owner",
      ],
      path.join(directory, "managed-schema.sql"),
    );
    await client.query("commit");
    transaction = false;
    // pg_dumpall cannot import a snapshot. Detect role/config changes around its run.
    await commandFile(
      config.pgDumpAll,
      ["--roles-only", "--no-role-passwords", "--no-password"],
      path.join(directory, "roles.sql"),
    );
    const rolesAfter = await roleInventory();
    if (rolesBefore !== rolesAfter)
      throw new Error(
        "Los roles cambiaron durante la exportación; repetir sin cambios administrativos",
      );
    const metadata = {
      version: 1,
      projectRef: config.projectRef,
      mode: config.mode,
      snapshotAt: new Date(point.captured_at).toISOString(),
      completedAt: new Date().toISOString(),
      serverVersion: point.server_version,
      schemas: scopes,
      tables,
      rolesSha256: createHash("sha256").update(rolesAfter).digest("hex"),
      databaseSnapshotConsistent: true,
      rolesExportedWithoutPasswords: true,
      storageBytesIncluded: false,
      hostingIncluded: false,
      restoreVerified: false,
    };
    await writeFile(
      path.join(directory, "snapshot.json"),
      JSON.stringify(metadata, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    return metadata;
  } finally {
    if (transaction) await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}
