"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import {
  workforceProfileSchema,
  workforceAssignmentSchema,
  workforceError,
} from "@/lib/workforce";
export type WorkforceState = { error?: string; success?: string };
export async function workforceAction(
  companyId: string,
  operation: "profile" | "assignment",
  _: WorkforceState,
  form: FormData,
): Promise<WorkforceState> {
  const { db, member } = await requireModule(
    companyId,
    "trabajadores",
    "write",
  );
  if (!["owner", "admin"].includes(member.role))
    return { error: "Solo un administrador puede gestionar el equipo." };
  const raw = Object.fromEntries(form);
  if (operation === "profile") {
    const parsed = workforceProfileSchema.safeParse({
      ...raw,
      enabled: form.get("enabled") === "on",
    });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
    const d = parsed.data;
    const { error } = await db.rpc("configure_workforce", {
      p_company: companyId,
      p_request: d.request,
      p_worker: d.id,
      p_version: d.version,
      p_role: d.role,
      p_supervisor: d.supervisor_id,
      p_enabled: d.enabled,
      p_reason: d.reason,
    });
    if (error) return { error: workforceError(error) };
  } else if (operation === "assignment") {
    const parsed = workforceAssignmentSchema.safeParse({
      ...raw,
      active: form.get("active") === "on",
    });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
    const d = parsed.data;
    const { error } = await db.rpc("save_workforce_assignment_days", {
      p_company: companyId,
      p_request: d.request,
      p_id: d.id,
      p_version: d.version,
      p_worker: d.worker_id,
      p_project: d.project_id,
      p_start: d.starts_at,
      p_end: d.ends_at,
      p_active: d.active,
      p_reason: d.reason,
    });
    if (error) return { error: workforceError(error) };
  } else return { error: "Acción inválida." };
  revalidatePath(`/app/${companyId}`, "layout");
  return { success: "Guardado. El historial conserva el cambio y su motivo." };
}
