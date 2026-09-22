import { readFile, writeFile } from "node:fs/promises";
import { planReleaseRetention } from "../src/lib/release-retention";

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Uso: plan-release-retention.ts inventario.json plan-privado.json",
    );
  process.umask(0o077);
  const plan = planReleaseRetention(JSON.parse(await readFile(input, "utf8")));
  await writeFile(output, JSON.stringify(plan, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log("Plan privado creado. No se eliminaron archivos.");
}
main().catch(() => {
  console.error(
    "No se pudo crear un plan seguro. Revisar el inventario privado.",
  );
  process.exitCode = 1;
});
