import { open, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prepareScheduledBackup } from "./ops/scheduled-backup";

async function main() {
  process.umask(0o077);
  const [file, mode] = process.argv.slice(2);
  if (!file || !["--check", "--run"].includes(mode))
    throw new Error("Indicar configuración privada y --check o --run");
  const plan = await prepareScheduledBackup(
    JSON.parse(await readFile(file, "utf8")),
  );
  if (mode === "--check") {
    console.log(
      JSON.stringify({
        ready: true,
        sourceRevision: plan.config.appRevision,
        backupStarted: false,
      }),
    );
    return;
  }
  const id = randomUUID();
  const log = await open(
    path.join(plan.config.logRoot, `run-${id}.private.log`),
    "wx",
    0o600,
  );
  const startedAt = new Date().toISOString();
  let code: number | null = null;
  try {
    code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, plan.args, {
        cwd: plan.config.appRoot,
        env: {
          ...plan.env,
          RCLONE_LOG_FILE: path.join(
            plan.config.logRoot,
            `rclone-${id}.private.log`,
          ),
        },
        shell: false,
        stdio: ["ignore", log.fd, log.fd],
      });
      child.once("error", reject);
      child.once("close", resolve);
    });
  } finally {
    await log.close();
    const result = await open(
      path.join(plan.config.logRoot, `run-${id}.json`),
      "wx",
      0o600,
    );
    try {
      await result.writeFile(
        JSON.stringify({
          startedAt,
          completedAt: new Date().toISOString(),
          exitCode: code,
          sourceRevision: plan.config.appRevision,
        }),
      );
    } finally {
      await result.close();
    }
  }
  if (code !== 0) throw new Error("La copia no terminó correctamente");
  console.log(JSON.stringify({ backupCompleted: true }));
}
main().catch(() => {
  console.error(
    "Respaldo no completado: revisar los registros privados. No forzar bloqueos ni declarar válida la copia.",
  );
  process.exitCode = 1;
});
