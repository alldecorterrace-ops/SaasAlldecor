"use server";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export type LaborState = { error?: string };
const common = z.object({
  request: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(5, "Explica el motivo de esta configuración.")
    .max(1000),
});
const amount = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Escribe un importe positivo con hasta dos decimales.",
  )
  .refine((v) => Number(v) > 0, "El importe debe ser positivo.");
const rate = z.object({
  worker: z.uuid(),
  from: z.iso.date(),
  to: z.union([z.iso.date(), z.literal("")]),
  amount,
});
const project = z.object({
  target: z.uuid(),
  mode: z.enum(["day", "adjustment"]),
  responsible: z.union([z.uuid(), z.literal("")]),
  amount: z.string(),
  date: z.string(),
  estimate_version: z.string(),
});
export async function saveLabor(
  company: string,
  kind: "RATE" | "PROJECT" | "SETTINGS",
  id: string,
  version: number,
  _: LaborState,
  form: FormData,
): Promise<LaborState> {
  const { db } = await requireModule(company, "horasfix", "write"),
    raw = Object.fromEntries(form),
    c = common.safeParse(raw);
  if (!c.success) return { error: c.error.issues[0].message };
  let data: Record<string, unknown>,
    target = id;
  if (kind === "RATE") {
    const parsed = rate.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    data = { ...parsed.data, active: form.get("active") === "on" };
  } else if (kind === "PROJECT") {
    const parsed = project.safeParse(raw);
    if (!parsed.success)
      return { error: "Revisa el proyecto y su modo de Labor." };
    const v = parsed.data;
    target = v.target;
    if (v.mode === "adjustment") {
      const valid = z
        .object({
          responsible: z.uuid(),
          amount,
          date: z.iso.date(),
          estimate_version: z.coerce.number().int().positive(),
        })
        .safeParse(v);
      if (!valid.success)
        return {
          error:
            "El ajuste requiere responsable, importe, fecha y revisión guardada del estimado.",
        };
      data = {
        mode: v.mode,
        ...valid.data,
        active: form.get("active") === "on",
      };
    } else data = { mode: v.mode, active: form.get("active") === "on" };
  } else {
    const rule = z
      .enum(["review", "minutes"])
      .safeParse(form.get("shared_day_rule"));
    if (!rule.success)
      return { error: "Selecciona cómo revisar una jornada compartida." };
    data = { shared_day_rule: rule.data };
  }
  const { error } = await db.rpc("save_labor_config", {
    p_company: company,
    p_request: c.data.request,
    p_id: target,
    p_version: version,
    p_kind: kind,
    p_data: data,
    p_reason: c.data.reason,
  });
  if (error) {
    const message = error.message;
    if (message.includes("permission_denied"))
      return { error: "Tu cuenta ya no tiene acceso para configurar Labor." };
    if (message.includes("labor_rate_overlap"))
      return {
        error:
          "Ya existe una tarifa vigente en esas fechas. Revisa los periodos antes de guardar.",
      };
    if (
      message.includes("record_conflict") ||
      message.includes("request_conflict")
    )
      return {
        error:
          "La configuración cambió. Recarga y comprueba la revisión actual.",
      };
    return {
      error:
        "No se pudo confirmar el guardado. Reabre Labor antes de volver a enviar.",
    };
  }
  for (const path of ["horas/labor", "gastos", "proyectos"])
    revalidatePath(`/app/${company}/${path}`);
  redirect(`/app/${company}/horas/labor?saved=${kind}`);
}
