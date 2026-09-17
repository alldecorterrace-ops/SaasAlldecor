import { OperationList } from "@/components/operation-list";
export default async function Workers({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  return (
    <OperationList
      companyId={(await params).companyId}
      kind="workers"
      search={await searchParams}
    />
  );
}
