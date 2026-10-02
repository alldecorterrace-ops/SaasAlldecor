import { mkdir, writeFile } from "node:fs/promises";
import {
  capturePricingForm,
  effectivePricing,
  pricingComponentRates,
} from "../src/lib/pricing-settings";
import { pricingCases } from "../tests/helpers/pricing-cases";
async function main() {
  const cases = pricingCases().map((c) => {
    const saved =
        "restore" in c && c.restore ? null : capturePricingForm(c.input),
      effective = effectivePricing(saved);
    return {
      ...c,
      actual: { saved, effective, rates: pricingComponentRates(effective) },
    };
  });
  await mkdir(".local", { recursive: true });
  await writeFile(".local/pricing-reference-input.json", JSON.stringify(cases));
  console.log(
    `Prepared ${cases.length} synthetic pricing cases for independent PHP comparison.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
