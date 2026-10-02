"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { isRecordConflict } from "@/lib/database-errors";
import { capturePricingForm } from "@/lib/pricing-settings";
import type { ActionState } from "@/components/action-form";

export async function savePricingSettings(
  companyId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await requireModule(companyId, "adm-precios", "write");
  const version = Number(form.get("version")),
    operation = String(form.get("operation") ?? "save");
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !["save", "restore"].includes(operation)
  )
    return { error: "Vuelve a abrir Precios antes de guardar." };
  let settings = null;
  if (operation === "save") {
    try {
      const payload = String(form.get("payload") ?? "");
      if (new TextEncoder().encode(payload).length > 200000) throw new Error();
      settings = capturePricingForm(JSON.parse(payload));
    } catch {
      return {
        error:
          "Revisa los valores de Precios. No se pudo leer la configuración.",
      };
    }
  }
  const { error } = await db.rpc("save_pricing_settings", {
    p_company: companyId,
    p_version: version,
    p_settings: settings,
  });
  if (error)
    return {
      error: isRecordConflict(error.code)
        ? "Precios cambió mientras lo editabas. Copia tus cambios y vuelve a abrir la última versión."
        : "No pudimos guardar. Revisa los valores y tu acceso.",
    };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(
    `/app/${companyId}/precios?${operation === "restore" ? "restored" : "saved"}=1`,
  );
}
