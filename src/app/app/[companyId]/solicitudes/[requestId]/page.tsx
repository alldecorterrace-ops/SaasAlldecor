import { notFound } from "next/navigation";
import { companyContext } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { OperationStatusView } from "@/components/operation-status";

export default async function RequestStatus({
  params,
}: {
  params: Promise<{ companyId: string; requestId: string }>;
}) {
  const { companyId, requestId } = await params;
  if (
    process.env.OPERATION_QUEUE_ENABLED !== "true" ||
    !uuid.safeParse(requestId).success
  )
    notFound();
  const { db } = await companyContext(companyId);
  const { data, error } = await db.rpc("get_operation_status", {
    p_company: companyId,
    p_request: requestId,
  });
  if (error) throw new Error("No se pudo consultar la solicitud.");
  if (!data) notFound();
  return <OperationStatusView companyId={companyId} initial={data} />;
}
