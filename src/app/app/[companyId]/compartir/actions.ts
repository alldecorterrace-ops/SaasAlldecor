"use server";
import { randomBytes, randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
export async function shareAction(
  companyId: string,
  kind: string,
  operation: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (kind !== "estimate" && kind !== "portal")
    return { error: "Enlace inválido." };
  const { db } = await requireModule(
    companyId,
    kind === "estimate" ? "estimadosweb" : "portal",
    "write",
  );
  if (operation === "revoke") {
    const { error } = await db.rpc("revoke_client_share", {
      p_company: companyId,
      p_id: form.get("id"),
    });
    if (error) return { error: "No se pudo revocar el enlace." };
    revalidatePath(`/app/${companyId}/compartir/${kind}`);
    return { success: "Enlace revocado." };
  }
  const token = randomBytes(32).toString("hex"),
    parts = String(form.get("target") ?? "").split(":"),
    site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return { error: "Falta configurar el dominio de la aplicación." };
  const { error } = await db.rpc("create_client_share", {
    p_company: companyId,
    p_id: randomUUID(),
    p_kind: kind,
    p_target: parts[0],
    p_version: Number(parts[1] ?? 0),
    p_token: token,
    p_days: Number(form.get("days")),
  });
  if (error)
    return {
      error:
        "No se pudo publicar. Revisa la vigencia (1–30 días), la revisión y tus permisos para el documento o cliente.",
    };
  revalidatePath(`/app/${companyId}/compartir/${kind}`);
  return {
    success: "Enlace creado. No se ha enviado ningún correo.",
    link: `${site.replace(/\/$/, "")}/acceso#${token}`,
  };
}
