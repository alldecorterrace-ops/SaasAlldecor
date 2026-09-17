"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { leadSchema, commercialError } from "@/lib/commercial";
export type CommercialState = { error?: string };
export async function saveLead(
  companyId: string,
  _: CommercialState,
  form: FormData,
): Promise<CommercialState> {
  void _;
  const { db } = await requireModule(companyId, "crm", "write");
  const values = Object.fromEntries(
    Object.keys(leadSchema.shape).map((k) => [k, String(form.get(k) ?? "")]),
  );
  const input = leadSchema.safeParse({
      ...values,
      appointment_date: values.appointment_date || null,
      archived: values.archived === "true",
    }),
    id = uuid.safeParse(form.get("id")),
    version = Number(form.get("version"));
  if (!input.success)
    return { error: input.error.issues[0]?.message ?? "Revisa el lead." };
  if (!id.success || !Number.isSafeInteger(version) || version < 0)
    return { error: "Vuelve a abrir la ficha." };
  const { error } = await db.rpc("save_lead", {
    p_company: companyId,
    p_id: id.data,
    p_version: version,
    p_data: input.data,
  });
  if (error) return { error: commercialError(error.code) };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/leads/${id.data}?saved=1`);
}
export async function convertLead(
  companyId: string,
  leadId: string,
  version: number,
  _: CommercialState,
): Promise<CommercialState> {
  void _;
  const { db } = await requireModule(companyId, "crm", "write");
  await requireModule(companyId, "clientes", "write");
  if (!uuid.safeParse(leadId).success || !Number.isSafeInteger(version))
    return { error: "Vuelve a abrir la ficha." };
  const { data, error } = await db.rpc("convert_lead", {
    p_company: companyId,
    p_lead: leadId,
    p_version: version,
  });
  if (error) return { error: commercialError(error.code) };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/clientes/${data}?saved=1`);
}
