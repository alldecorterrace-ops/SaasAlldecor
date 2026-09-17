import "server-only";
import { notFound } from "next/navigation";
import { requireModule } from "./auth";
import { uuid } from "./validation";
import type { EstimateInput } from "./estimates";
export type EstimateRecord = Omit<EstimateInput, "items"> & {
  id: string;
  number: string;
  version: number;
  subtotal: string | number;
  total: string | number;
  customer_snapshot: {
    full_name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
  };
  items: (EstimateInput["items"][number] & { line_total: string })[];
};
export async function estimateRecord(
  companyId: string,
  id: string,
  revision?: string,
) {
  if (!uuid.safeParse(id).success) notFound();
  const context = await requireModule(companyId, "fin-estimados");
  const { data, error } = await context.db
    .from("estimates")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el estimado.");
  if (!data) notFound();
  let record: EstimateRecord = data;
  if (revision) {
    if (!/^[1-9]\d{0,8}$/.test(revision)) notFound();
    const r = await context.db
      .from("estimate_revisions")
      .select("snapshot")
      .eq("company_id", companyId)
      .eq("estimate_id", id)
      .eq("version", Number(revision))
      .maybeSingle();
    if (r.error) throw new Error("No se pudo cargar la revisión.");
    if (!r.data) notFound();
    record = r.data.snapshot;
  }
  return { ...context, record, latestVersion: data.version as number };
}
