import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { planEstimateMigration } from "../src/lib/migration/estimates";

// Offline only. No network client, database credentials, writes or apply mode.
async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      output: { type: "string" },
      "company-id": { type: "string" },
    },
  });
  if (!values.input || !values.output || !values["company-id"])
    throw new Error("arguments_required");
  const root = await realpath(".local");
  const directory = await realpath(path.dirname(path.resolve(values.output)));
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("private_output_required");
  const plan = planEstimateMigration(
    JSON.parse((await readFile(values.input, "utf8")).replace(/^\uFEFF/, "")),
    values["company-id"],
  );
  await writeFile(
    path.join(directory, path.basename(values.output)),
    JSON.stringify(plan, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      mode: plan.mode,
      writesEnabled: plan.writesEnabled,
      ...plan.summary,
    }),
  );
}
main().catch(() => {
  console.error(
    "No se generó el plan. Revisa argumentos, identidades, relaciones y un archivo nuevo dentro de .local; nunca se escribe en una base de datos.",
  );
  process.exitCode = 1;
});
