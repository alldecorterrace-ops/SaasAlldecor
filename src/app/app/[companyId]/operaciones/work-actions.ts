"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { financeError } from "@/lib/finance";
import { workspaceKind, workspaces, workspaceError } from "@/lib/workspaces";
import { parseInstallationCrew } from "@/lib/installation-crew";
import { parseWorkIdentity, confirmedWorkResult } from "@/lib/work-requests";
export type WorkState = { error?: string; success?: string };
export async function saveWork(
  companyId: string,
  kind: string,
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const k = workspaceKind(kind);
  if (!k) return { error: "Módulo inválido." };
  const config = workspaces[k];
  const { db } = await requireModule(companyId, config.module, "write");
  const request = parseWorkIdentity(form);
  const id = uuid.safeParse(form.get("id")),
    version = Number(form.get("version"));
  if (!request || !id.success || !Number.isSafeInteger(version) || version < 0)
    return { error: "Recarga la ficha." };
  const name = String(form.get("name") ?? "").trim(),
    status = String(form.get("status") ?? "");
  if (
    name.length < 2 ||
    name.length > 190 ||
    !Object.hasOwn(config.statuses, status)
  )
    return { error: "Revisa el nombre y el estado." };
  const data = Object.fromEntries(
    config.fields.map((f) => [f.name, String(form.get(f.name) ?? "")]),
  );
  const parsed = config.schema.safeParse(data);
  if (!parsed.success)
    return { error: "Revisa los campos: " + parsed.error.issues[0]?.message };
  const project_id = String(form.get("project_id") ?? "") || null,
    worker_id = String(form.get("worker_id") ?? "") || null;
  if (
    (project_id && !uuid.safeParse(project_id).success) ||
    (worker_id && !uuid.safeParse(worker_id).success)
  )
    return { error: "Revisa las relaciones." };
  const crew =
    k === "installations"
      ? parseInstallationCrew(form)
      : { success: true as const, data: undefined };
  if (!crew.success)
    return {
      error: "Selecciona hasta 20 trabajadores distintos para la cuadrilla.",
    };
  const { data: receipt, error } = await db.rpc("execute_work_action", {
    p_request: request,
    p_operation: "save",
    p_company: companyId,
    p_id: id.data,
    p_version: version,
    p_kind: k,
    p_data: {
      name,
      status,
      project_id,
      worker_id,
      data: {
        ...(parsed.data as object),
        ...(crew.data === undefined
          ? {}
          : { crew_worker_ids: crew.data.sort() }),
      },
    },
  });
  if (error) return { error: workspaceError(error) ?? financeError(error) };
  if (!confirmedWorkResult(receipt, k, "save", id.data, id.data))
    return {
      error:
        "No se pudo confirmar la respuesta. Conserva el formulario y repite la misma solicitud.",
    };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/operaciones/${k}/${id.data}?saved=1`);
}
export async function inventoryMovement(
  companyId: string,
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const { db } = await requireModule(companyId, "inventario", "write");
  const request = parseWorkIdentity(form);
  const id = uuid.safeParse(form.get("id")),
    item = uuid.safeParse(form.get("item_id")),
    version = Number(form.get("version"));
  if (
    !request ||
    !id.success ||
    !item.success ||
    !Number.isSafeInteger(version)
  )
    return { error: "Recarga la ficha." };
  const data = Object.fromEntries(
    [
      "quantity",
      "reason",
      "reference",
      "movement_date",
      "project_id",
      "reversal_of",
    ].map((k) => [k, String(form.get(k) ?? "")]),
  );
  const { data: receipt, error } = await db.rpc("execute_work_action", {
    p_company: companyId,
    p_request: request,
    p_operation: "movement",
    p_kind: "inventory",
    p_id: item.data,
    p_version: version,
    p_data: { ...data, movement_id: id.data },
  });
  if (error) return { error: workspaceError(error) ?? financeError(error) };
  if (
    !confirmedWorkResult(receipt, "inventory", "movement", item.data, id.data)
  )
    return {
      error:
        "No se pudo confirmar el movimiento. Repite la misma solicitud antes de preparar otra.",
    };
  revalidatePath(`/app/${companyId}`, "layout");
  return {
    success:
      "Movimiento registrado. La existencia y el historial se actualizaron.",
  };
}
export async function workAttachment(
  companyId: string,
  kind: string,
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const k = workspaceKind(kind);
  if (!k) return { error: "Módulo inválido." };
  const { db } = await requireModule(companyId, workspaces[k].module, "write");
  const request = parseWorkIdentity(form);
  const record = uuid.safeParse(form.get("record_id")),
    version = Number(form.get("version"));
  if (!request || !record.success || !Number.isSafeInteger(version))
    return { error: "Recarga la ficha." };
  const { data: r, error: loadError } = await db
    .from("work_records")
    .select("kind")
    .eq("company_id", companyId)
    .eq("id", record.data)
    .maybeSingle();
  if (loadError || r?.kind !== k) return { error: "Registro no disponible." };
  let id = String(form.get("attachment_id") ?? ""),
    path = "",
    name = "",
    active = true,
    contentSha256: string | null = null;
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Archivo inválido." };
    const { data: f, error } = await db
      .from("work_attachments")
      .select("path,name,active")
      .eq("company_id", companyId)
      .eq("record_id", record.data)
      .eq("id", id)
      .maybeSingle();
    if (error || !f) return { error: "Archivo no disponible." };
    path = f.path;
    name = f.name;
    const requestedActive = form.get("active");
    if (requestedActive !== "true" && requestedActive !== "false")
      return { error: "Reabre la ficha para preparar el estado del archivo." };
    active = requestedActive === "true";
  } else {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 5000000)
      return { error: "Selecciona una imagen o PDF de hasta 5 MB." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const type =
      bytes.subarray(0, 5).toString() === "%PDF-"
        ? { ext: "pdf", mime: "application/pdf" }
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? { ext: "png", mime: "image/png" }
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? { ext: "jpg", mime: "image/jpeg" }
            : bytes.subarray(0, 4).toString() === "RIFF" &&
                bytes.subarray(8, 12).toString() === "WEBP"
              ? { ext: "webp", mime: "image/webp" }
              : null;
    if (!type)
      return { error: "Formato no admitido. Usa PDF, PNG, JPEG o WebP." };
    id = request;
    contentSha256 = createHash("sha256").update(bytes).digest("hex");
    path = `${companyId}/${record.data}/${id}.${type.ext}`;
    name = file.name.slice(0, 255);
    const { error } = await db.storage
      .from("work-files")
      .upload(path, bytes, { contentType: type.mime, upsert: false });
    if (error) {
      // A lost response may leave the immutable object already uploaded.
      // Reuse only byte-identical content at this request's private path.
      const previous = await db.storage.from("work-files").download(path);
      if (
        previous.error ||
        !previous.data ||
        createHash("sha256")
          .update(Buffer.from(await previous.data.arrayBuffer()))
          .digest("hex") !== contentSha256
      )
        return {
          error:
            "No se pudo cargar o confirmar el archivo original. Conserva la solicitud y revisa el documento.",
        };
    }
  }
  const { data: receipt, error } = await db.rpc("execute_work_action", {
    p_company: companyId,
    p_request: request,
    p_operation: "attachment",
    p_kind: k,
    p_id: record.data,
    p_version: version,
    p_data: {
      attachment_id: id,
      path,
      name,
      active,
      content_sha256: contentSha256,
    },
  });
  if (error) return { error: workspaceError(error) ?? financeError(error) };
  if (!confirmedWorkResult(receipt, k, "attachment", record.data, id))
    return {
      error:
        "No se pudo confirmar el documento. Conserva el formulario y repite la misma solicitud.",
    };
  revalidatePath(`/app/${companyId}`, "layout");
  return {
    success: active
      ? "Archivo incorporado."
      : "Archivo archivado; se conserva el original.",
  };
}
