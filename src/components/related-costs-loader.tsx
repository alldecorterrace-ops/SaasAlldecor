import { requireModule } from "@/lib/auth";
import { loadCostRegister } from "@/lib/cost-register";
import { expenseFiltersSchema } from "@/lib/expense-register";
import { RelatedCosts } from "./related-costs";
export async function RelatedCostsLoader({
  companyId,
  project,
  customer,
}: {
  companyId: string;
  project?: string;
  customer?: string;
}) {
  const { db } = await requireModule(companyId, "gastos");
  let result = null;
  try {
    result = await loadCostRegister(
      db,
      companyId,
      expenseFiltersSchema.parse({ project, customer }),
    );
  } catch {}
  return (
    <RelatedCosts
      companyId={companyId}
      project={project}
      customer={customer}
      result={result}
    />
  );
}
