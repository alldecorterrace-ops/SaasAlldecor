import { OperationDetail } from "@/components/operation-detail";
export default async function Expense({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; expenseId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const p = await params;
  return (
    <OperationDetail
      companyId={p.companyId}
      kind="expenses"
      recordId={p.expenseId}
      saved={(await searchParams).saved === "1"}
    />
  );
}
