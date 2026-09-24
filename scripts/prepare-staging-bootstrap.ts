import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stagingBootstrap } from "./ops/staging-bootstrap";

async function main() {
  const [output, ...extra] = process.argv.slice(2);
  if (!output || extra.length)
    throw new Error("Indica un archivo SQL nuevo para staging");
  const directory = path.resolve("supabase/migrations");
  const files = await Promise.all(
    (await readdir(directory))
      .filter((x) => x.endsWith(".sql"))
      .sort()
      .map(async (name) => ({
        name,
        sql: await readFile(path.join(directory, name), "utf8"),
      })),
  );
  await writeFile(output, stagingBootstrap(files), { flag: "wx", mode: 0o600 });
  console.log(
    JSON.stringify({ migrations: files.length, databaseModified: false }),
  );
}
main().catch(() => {
  console.error(
    "No se generó el bootstrap; revisar migraciones y destino del archivo.",
  );
  process.exitCode = 1;
});
