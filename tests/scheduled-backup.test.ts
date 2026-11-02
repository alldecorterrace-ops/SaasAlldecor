import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareScheduledBackup } from "../scripts/ops/scheduled-backup";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "scheduled-backup-"));
  const app = path.join(root, "release");
  for (const name of [
    "release/node_modules/tsx/dist",
    "release/scripts",
    "spool",
    "receipts",
    "logs",
    "lib",
  ])
    await mkdir(path.join(root, name), { recursive: true });
  const projectRef = "abcdefghijklmnopqrst";
  const appRevision = "a".repeat(40);
  const config = {
    projectRef,
    appRevision,
    appRoot: app,
    webConfiguration: path.join(root, ".htaccess"),
    databaseConnectionFile: path.join(root, "database.json"),
    backupConfigurationFile: path.join(root, "backup.json"),
    sourceInventoryFile: path.join(root, "inventory.json"),
    libraryDirectory: path.join(root, "lib"),
    logRoot: path.join(root, "logs"),
  };
  const database = {
    PGHOST: "aws-0-us-east-1.pooler.supabase.com",
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: `postgres.${projectRef}`,
    PGSSLMODE: "verify-full",
    PGPASSFILE: path.join(root, "pgpass"),
    PGSSLROOTCERT: path.join(root, "ca.crt"),
    PGCONNECT_TIMEOUT: "15",
  };
  const hosting = {
    documents: { root, paths: ["synthetic.pdf"] },
    configuration: { root: app, paths: ["REVISION"] },
  };
  const inventory = JSON.stringify({
    projectRef,
    activeRevision: appRevision,
    ...hosting,
  });
  const backup = {
    hosting,
    projectRef,
    spoolRoot: path.join(root, "spool"),
    receiptRoot: path.join(root, "receipts"),
    sourceInventorySha256: createHash("sha256").update(inventory).digest("hex"),
  };
  const entries: Record<string, string> = {
    [config.webConfiguration]: `PassengerAppRoot ${app}\n`,
    [config.databaseConnectionFile]: JSON.stringify(database),
    [config.backupConfigurationFile]: JSON.stringify(backup),
    [config.sourceInventoryFile]: inventory,
    [path.join(app, "REVISION")]: appRevision,
    [path.join(app, ".env.local")]:
      `APP_ENVIRONMENT=production\nNEXT_PUBLIC_SUPABASE_URL=https://${projectRef}.supabase.co\nWEB_NOTICE_SUPABASE_SERVICE_KEY=synthetic-storage-key\nSTRIPE_SECRET_KEY=must-not-inherit\n`,
    [database.PGPASSFILE]: "synthetic",
    [database.PGSSLROOTCERT]: "synthetic",
    [path.join(app, "node_modules/tsx/dist/cli.mjs")]: "// synthetic",
    [path.join(app, "scripts/run-backup.ts")]: "// synthetic",
  };
  for (const [file, contents] of Object.entries(entries))
    await writeFile(file, contents);
  return {
    root,
    app,
    config,
    database,
    backup,
    dispose: async () => {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
      assert.match(path.basename(root), /^scheduled-backup-/);
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("scheduled launcher binds the reviewed source and exposes only backup credentials to child", async () => {
  const f = await fixture();
  try {
    const plan = await prepareScheduledBackup(f.config);
    assert.equal(plan.env.BACKUP_STORAGE_SERVICE_KEY, "synthetic-storage-key");
    assert.equal(plan.env.PGSSLMODE, "verify-full");
    assert.equal(plan.env.PGCONNECT_TIMEOUT, "15");
    assert.equal(plan.env.STRIPE_SECRET_KEY, undefined);
    assert.equal(plan.env.NODE_OPTIONS, undefined);
    assert.deepEqual(plan.args, [
      path.join(f.app, "node_modules/tsx/dist/cli.mjs"),
      path.join(f.app, "scripts/run-backup.ts"),
      f.config.backupConfigurationFile,
    ]);
  } finally {
    await f.dispose();
  }
});

test("deployment, project and inventory drift all prevent launching", async () => {
  const changes = [
    async (f: Awaited<ReturnType<typeof fixture>>) =>
      writeFile(path.join(f.app, "REVISION"), "b".repeat(40)),
    async (f: Awaited<ReturnType<typeof fixture>>) =>
      writeFile(
        f.config.webConfiguration,
        `PassengerAppRoot ${path.join(f.root, "different-release")}\n`,
      ),
    async (f: Awaited<ReturnType<typeof fixture>>) =>
      writeFile(f.config.sourceInventoryFile, "changed"),
    async (f: Awaited<ReturnType<typeof fixture>>) =>
      writeFile(path.join(f.app, ".env.local"), "APP_ENVIRONMENT=staging\n"),
    async (f: Awaited<ReturnType<typeof fixture>>) =>
      writeFile(
        f.config.backupConfigurationFile,
        JSON.stringify({ ...f.backup, projectRef: "z".repeat(20) }),
      ),
  ];
  for (const change of changes) {
    const f = await fixture();
    try {
      await change(f);
      await assert.rejects(prepareScheduledBackup(f.config));
    } finally {
      await f.dispose();
    }
  }
});

test("wrong database and insecure connections are rejected", async () => {
  for (const change of [
    { PGUSER: "postgres.otherproject" },
    { PGSSLMODE: "require" },
    { PGPORT: "6543" },
    { PGHOST: "untrusted.example" },
    { PGPASSWORD: "no-inline-passwords" },
  ]) {
    const f = await fixture();
    try {
      await writeFile(
        f.config.databaseConnectionFile,
        JSON.stringify({ ...f.database, ...change }),
      );
      await assert.rejects(prepareScheduledBackup(f.config));
    } finally {
      await f.dispose();
    }
  }
});

test("failed or ongoing backup lock is never removed or bypassed", async () => {
  const f = await fixture();
  try {
    await mkdir(path.join(f.backup.spoolRoot, "backup.lock"));
    await assert.rejects(prepareScheduledBackup(f.config), /bloqueo/);
  } finally {
    await f.dispose();
  }
});
