import { mkdir, writeFile } from "node:fs/promises";
import {
  normalizeProductDetails,
  productDetailsSummary,
} from "../src/lib/product-details";
import { productDetailsCases } from "../tests/helpers/product-details-cases";
const cases = productDetailsCases.map(({ name, input }) => {
  try {
    const normalized = normalizeProductDetails(input);
    return {
      name,
      input,
      actual: {
        ok: true,
        normalized,
        summary: productDetailsSummary(normalized),
      },
    };
  } catch {
    return { name, input, actual: { ok: false } };
  }
});
async function main() {
  await mkdir(".local", { recursive: true });
  await writeFile(".local/product-reference-input.json", JSON.stringify(cases));
  console.log(
    `Prepared ${cases.length} synthetic product metadata comparisons for the independent PHP reference.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
