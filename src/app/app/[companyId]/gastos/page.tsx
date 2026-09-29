import { ExpenseRegister } from "@/components/expense-register";
export default async function Expenses({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ExpenseRegister
      companyId={(await params).companyId}
      search={await searchParams}
    />
  );
}
