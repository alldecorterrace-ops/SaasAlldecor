import { OperationList } from "@/components/operation-list";
export default async function Expenses({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  return (
    <OperationList
      companyId={(await params).companyId}
      kind="expenses"
      search={await searchParams}
    />
  );
}
