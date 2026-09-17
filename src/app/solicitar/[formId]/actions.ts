"use server";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/action-form";
export async function submitInquiry(
  formId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (String(form.get("website") ?? ""))
    return { error: "No se pudo procesar la solicitud." };
  const fields = [
      "name",
      "email",
      "phone",
      "message",
      "service",
      "length",
      "width",
      "height",
    ],
    data = Object.fromEntries(
      fields.map((k) => [k, String(form.get(k) ?? "")]),
    );
  const db = await createClient(),
    { error } = await db.rpc("submit_web_request", {
      p_form: formId,
      p_id: form.get("request_id"),
      p_data: data,
    });
  if (error)
    return {
      error:
        "No se pudo registrar. Revisa nombre, correo y medidas (0–200 ft). El formulario puede haber vencido o alcanzado su límite diario.",
    };
  return {
    success:
      "Solicitud recibida. La empresa revisará tus datos para preparar el estimado. Esta solicitud no es una cotización ni genera un cobro.",
  };
}
