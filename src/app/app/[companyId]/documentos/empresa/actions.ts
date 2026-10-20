"use server";
import { companyContext } from "@/lib/auth";
import { commercialIdentity } from "@/lib/commercial-identity";
import { revalidatePath } from "next/cache";
export type IdentityActionState = {
  error?: string;
  success?: string;
  version?: number;
};
export async function saveIdentity(
  companyId: string,
  _: IdentityActionState,
  form: FormData,
): Promise<IdentityActionState> {
  const { db, member } = await companyContext(companyId);
  if (member.role === "member")
    return {
      error: "Solo Administración puede cambiar la identidad comercial.",
    };
  const data = commercialIdentity.safeParse(
    Object.fromEntries(
      [
        "legal_name",
        "tagline",
        "address",
        "phone",
        "email",
        "website",
        "license",
        "payment_instructions",
        "footer",
      ].map((k) => [k, form.get(k)]),
    ),
  );
  const version = String(form.get("version") ?? "");
  if (
    !data.success ||
    !/^\d+$/.test(version) ||
    !Number.isSafeInteger(Number(version))
  )
    return { error: "Comprueba los textos, el correo y la dirección HTTPS." };
  if (form.get("confirmed") !== "yes")
    return { error: "Confirma que estos datos pertenecen a la empresa." };
  const { data: saved, error } = await db.rpc("save_commercial_identity", {
    p_company: companyId,
    p_version: Number(version),
    p_data: data.data,
    p_confirmed: true,
  });
  if (error)
    return {
      error:
        error.code === "PT409"
          ? "Otra persona cambió estos datos. Recarga y revisa antes de guardar."
          : "No se pudieron guardar los datos comerciales.",
    };
  revalidatePath(`/app/${companyId}/documentos/empresa`);
  return {
    success:
      "Datos guardados para los próximos documentos. Los PDF conservados siguen iguales.",
    version: saved as number,
  };
}
