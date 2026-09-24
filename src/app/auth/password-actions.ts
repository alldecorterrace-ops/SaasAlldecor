"use server";
import { createClient, isConfigured } from "@/lib/supabase/server";
import {
  sendRecoveryRequest,
  saveNewPassword,
  type RecoveryState,
} from "@/lib/password-recovery";

export async function requestPasswordReset(
  _: RecoveryState,
  form: FormData,
): Promise<RecoveryState> {
  if (!isConfigured())
    return { error: "La conexión de este entorno está pendiente." };
  const db = await createClient();
  return sendRecoveryRequest(
    db.auth,
    form.get("email"),
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    process.env,
  );
}

export async function updatePassword(
  _: RecoveryState,
  form: FormData,
): Promise<RecoveryState> {
  if (!isConfigured())
    return { error: "La conexión de este entorno está pendiente." };
  const db = await createClient();
  return saveNewPassword(db.auth, {
    password: form.get("password"),
    confirmation: form.get("confirmation"),
  });
}
