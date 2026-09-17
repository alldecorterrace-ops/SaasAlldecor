import { OperationDetail } from "@/components/operation-detail";
export default async function Worker({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; workerId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const p = await params;
  return (
    <OperationDetail
      companyId={p.companyId}
      kind="workers"
      recordId={p.workerId}
      saved={(await searchParams).saved === "1"}
    />
  );
}
