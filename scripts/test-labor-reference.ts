import { mkdirSync, writeFileSync } from "node:fs";
import { laborReferenceCases } from "../tests/helpers/labor-cases";
mkdirSync(".local", { recursive: true });
writeFileSync(
  ".local/labor-reference-input.json",
  JSON.stringify(laborReferenceCases),
);
console.log(
  "Prepared independent PHP comparison for " +
    laborReferenceCases.length +
    " synthetic labor cases.",
);
