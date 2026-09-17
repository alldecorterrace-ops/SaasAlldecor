"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { financeError } from "@/lib/finance";
export type TimeState = { error?: string; success?: string };
export async function timeAction(
  companyId: string,
  operation: string,
  _: TimeState,
  form: FormData,
): Promise<TimeState> {
  const { db } = await requireModule(
    companyId,
    operation === "link" ? "trabajadores" : "horasfix",
    "write",
  );
  const value = (k: string) => String(form.get(k) ?? ""),
    id = value("id"),
    version = Number(value("version"));
  if (operation !== "period" && !uuid.safeParse(id).success)
    return { error: "Registro inválido." };
  let error: { code?: string; message: string } | null = null;
  if (operation === "save") {
    ({ error } = await db.rpc("save_time_entry", {
      p_company: companyId,
      p_id: id,
      p_version: version,
      p_data: {
        worker_id: value("worker_id"),
        project_id: value("project_id") || null,
        starts_at: value("starts_at"),
        ends_at: value("ends_at"),
        break_minutes: Number(value("break_minutes")),
        status: value("status"),
        notes: value("notes"),
        reason: value("reason"),
      },
    }));
  } else if (operation === "punch") {
    ({ error } = await db.rpc("punch_time", {
      p_company: companyId,
      p_id: id,
      p_action: value("action"),
      p_project: value("project_id") || null,
    }));
  } else if (operation === "request") {
    ({ error } = await db.rpc("request_time_change", {
      p_company: companyId,
      p_id: id,
      p_entry: value("entry_id"),
      p_version: version,
      p_data: {
        starts_at: value("starts_at"),
        ends_at: value("ends_at"),
        break_minutes: Number(value("break_minutes")),
        reason: value("reason"),
      },
    }));
  } else if (operation === "decision") {
    ({ error } = await db.rpc("decide_time_request", {
      p_company: companyId,
      p_id: id,
      p_version: version,
      p_approve: value("decision") === "approve",
      p_note: value("reason"),
    }));
  } else if (operation === "period") {
    ({ error } = await db.rpc("set_time_period", {
      p_company: companyId,
      p_week: value("week_start"),
      p_locked: value("locked") === "true",
      p_reason: value("reason"),
    }));
  } else if (operation === "link") {
    ({ error } = await db.rpc("link_worker_login", {
      p_company: companyId,
      p_worker: id,
      p_version: version,
      p_email: value("email"),
    }));
  } else return { error: "Acción no disponible." };
  if (error) {
    const messages: Record<string, string> = {
      worker_login_required:
        "Un administrador debe vincular tu cuenta a tu ficha de trabajador.",
      member_not_found:
        "El correo debe pertenecer a un usuario activo de esta empresa.",
      time_overlap: "Ese trabajador tiene otra marcación en el mismo horario.",
      period_locked:
        "La semana está cerrada. Un administrador debe reabrirla con un motivo antes de corregirla.",
      unreviewed_period:
        "Hay marcaciones abiertas, horas sin aprobar o solicitudes pendientes en esa semana.",
      manager_required: "Esta acción requiere un administrador.",
      reason_required: "Escribe un motivo de al menos tres caracteres.",
      invalid_time: "Revisa las fechas, el descanso y el motivo.",
      invalid_period: "Selecciona el lunes de la semana y escribe un motivo.",
    };
    return {
      error:
        Object.entries(messages).find(([key]) =>
          error.message.includes(key),
        )?.[1] ?? financeError(error),
    };
  }
  revalidatePath(`/app/${companyId}`, "layout");
  if (operation === "save") redirect(`/app/${companyId}/horas/${id}?saved=1`);
  return { success: "Operación registrada en el historial." };
}
