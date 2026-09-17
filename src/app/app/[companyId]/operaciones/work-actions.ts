"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { financeError } from "@/lib/finance";
import { workspaceKind, workspaces, workspaceError } from "@/lib/workspaces";
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
  const id = uuid.safeParse(form.get("id")),
    version = Number(form.get("version"));
  if (!id.success || !Number.isSafeInteger(version) || version < 0)
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
  const { error } = await db.rpc("save_work_record", {
    p_company: companyId,
    p_id: id.data,
    p_version: version,
    p_kind: k,
    p_data: { name, status, project_id, worker_id, data: parsed.data },
  });
  if (error) return { error: workspaceError(error) ?? financeError(error) };
  revalidatePath(`/app/${companyId}`, "layout");
  redirect(`/app/${companyId}/operaciones/${k}/${id.data}?saved=1`);
}
export async function inventoryMovement(
  companyId: string,
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const { db } = await requireModule(companyId, "inventario", "write");
  const id = uuid.safeParse(form.get("id")),
    item = uuid.safeParse(form.get("item_id")),
    version = Number(form.get("version"));
  if (!id.success || !item.success || !Number.isSafeInteger(version))
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
  const { error } = await db.rpc("record_inventory_movement", {
    p_company: companyId,
    p_id: id.data,
    p_item: item.data,
    p_version: version,
    p_data: data,
  });
  if (error) return { error: workspaceError(error) ?? financeError(error) };
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
  const record = uuid.safeParse(form.get("record_id")),
    version = Number(form.get("version"));
  if (!record.success || !Number.isSafeInteger(version))
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
    active = true;
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
    active = !f.active;
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
    id = randomUUID();
    path = `${companyId}/${record.data}/${id}.${type.ext}`;
    name = file.name.slice(0, 255);
    const { error } = await db.storage
      .from("work-files")
      .upload(path, bytes, { contentType: type.mime, upsert: false });
    if (error) return { error: "No se pudo cargar el archivo." };
  }
  const { error } = await db.rpc("set_work_attachment", {
    p_company: companyId,
    p_record: record.data,
    p_record_version: version,
    p_id: id,
    p_path: path,
    p_name: name,
    p_active: active,
  });
  if (error) return { error: workspaceError(error) ?? financeError(error) };
  revalidatePath(`/app/${companyId}`, "layout");
  return {
    success: active
      ? "Archivo incorporado."
      : "Archivo archivado; se conserva el original.",
  };
}
