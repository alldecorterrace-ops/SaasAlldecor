"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { commercialKind, commercialModule } from "@/lib/commercial-documents";
import { renderCommercialPdf } from "@/lib/commercial-pdf";
import { generateCommercialDocument } from "@/lib/commercial-document-service";
export type CommercialState = { error?: string; documentId?: string };
export async function generatePdf(
  companyId: string,
  _: CommercialState,
  form: FormData,
): Promise<CommercialState> {
  const kind = commercialKind.safeParse(form.get("kind")),
    record = uuid.safeParse(form.get("record")),
    version = Number(form.get("version"));
  if (
    !kind.success ||
    !record.success ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    return { error: "Recarga el documento antes de generar el PDF." };
  const { db } = await requireModule(
    companyId,
    commercialModule(kind.data),
    "write",
  );
  try {
    const documentId = await generateCommercialDocument(
      db,
      companyId,
      kind.data,
      record.data,
      version,
      (d) => renderCommercialPdf(d, process.env.APP_ENVIRONMENT === "staging"),
    );
    revalidatePath(`/app/${companyId}`, "layout");
    return { documentId };
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
    return {
      error: message.includes("record_conflict")
        ? "El documento cambió. Recarga la ficha antes de generar el PDF."
        : message.includes("unsupported_document_character")
          ? "El texto contiene caracteres que la fuente del PDF no admite. El archivo no se publicó."
          : "No se pudo conservar el PDF. Puedes reintentar; se conservará una sola copia por revisión.",
    };
  }
}
