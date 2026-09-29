import { randomUUID } from "node:crypto";
import { redirect, notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
export default async function NewBatch({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { member } = await requireModule(companyId, "gastos", "write");
  if (!["owner", "admin"].includes(member.role)) notFound();
  redirect(`/app/${companyId}/gastos/lote/${randomUUID()}`);
}
