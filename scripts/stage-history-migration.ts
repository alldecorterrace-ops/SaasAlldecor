import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { stageHistory } from "../src/lib/migration/stage-history";

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      database: { type: "string" },
      "company-id": { type: "string" },
    },
  });
  if (!values.input || !values.database || !values["company-id"])
    throw new Error("arguments_required");
  const root = await realpath(".local"),
    directory = await realpath(values.database);
  const relative = path.relative(root, directory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("private_database_required");
  const snapshot = JSON.parse(
    (await readFile(values.input, "utf8")).replace(/^\uFEFF/, ""),
  );
  const db = new PGlite(directory);
  try {
    console.log(
      JSON.stringify(await stageHistory(db, snapshot, values["company-id"])),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    "Ensayo detenido. Revisa la carpeta privada, empresa, identidades y cambios de origen o relaciones. No se conecta al SaaS.",
  );
  process.exitCode = 1;
});
