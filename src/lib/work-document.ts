import { z } from "zod";
import { uuid } from "./validation";
import { workspaceKind } from "./workspaces";

type Result = { data: unknown; error: { code?: string } | null };
type Query = {
  eq(column: string, value: string): Query;
  maybeSingle(): PromiseLike<Result>;
};
export type WorkDocumentClient = {
  auth: {
    getUser(): Promise<{ data: { user: unknown | null }; error: unknown }>;
  };
  from(table: "work_records" | "work_attachments"): {
    select(columns: string): Query;
  };
  storage: {
    from(bucket: "work-files"): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
};
const recordSchema = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  kind: z.string(),
});
const fileSchema = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  record_id: z.uuid(),
  path: z.string(),
  name: z.string().min(1).max(255),
});

export async function workDocument(
  companyId: string,
  kind: string,
  recordId: string,
  attachmentId: string,
  connect: () => Promise<WorkDocumentClient>,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  const fail = (status: number) =>
    Response.json({ error: "Documento no disponible." }, { status, headers });
  if (
    !workspaceKind(kind) ||
    ![companyId, recordId, attachmentId].every((v) => uuid.safeParse(v).success)
  )
    return fail(404);
  try {
    const db = await connect();
    const auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return fail(401);
    // Both queries and Storage use the caller's session and current RLS.
    // No service credential or signed URL reaches the browser.
    const record = await db
      .from("work_records")
      .select("id,company_id,kind")
      .eq("company_id", companyId)
      .eq("kind", kind)
      .eq("id", recordId)
      .maybeSingle();
    if (record.error) return fail(503);
    if (!record.data) return fail(404);
    const parsedRecord = recordSchema.safeParse(record.data);
    if (
      !parsedRecord.success ||
      parsedRecord.data.id !== recordId ||
      parsedRecord.data.company_id !== companyId ||
      parsedRecord.data.kind !== kind
    )
      return fail(503);
    const file = await db
      .from("work_attachments")
      .select("id,company_id,record_id,path,name")
      .eq("company_id", companyId)
      .eq("record_id", recordId)
      .eq("id", attachmentId)
      .maybeSingle();
    if (file.error) return fail(503);
    if (!file.data) return fail(404);
    const parsed = fileSchema.safeParse(file.data);
    if (!parsed.success) return fail(503);
    const f = parsed.data;
    const prefix = `${companyId}/${recordId}/`;
    const suffix = f.path.slice(prefix.length);
    const match = /^([a-f0-9-]{36})\.(pdf|png|jpg|webp)$/.exec(suffix);
    if (
      f.id !== attachmentId ||
      f.company_id !== companyId ||
      f.record_id !== recordId ||
      !f.path.startsWith(prefix) ||
      !match ||
      !uuid.safeParse(match[1]).success
    )
      return fail(503);
    const ext = match[2];
    const mime: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      webp: "image/webp",
    };
    const stored = await db.storage.from("work-files").download(f.path);
    if (
      stored.error ||
      !stored.data ||
      stored.data.size === 0 ||
      stored.data.size > 5000000 ||
      stored.data.type.split(";")[0] !== mime[ext]
    )
      return fail(503);
    const bytes = Buffer.from(await stored.data.arrayBuffer());
    const signature =
      ext === "pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : ext === "png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ext === "jpg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP";
    if (!signature) return fail(503);
    return new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type": mime[ext],
        "Content-Disposition": `inline; filename="documento.${ext}"; filename*=UTF-8''${encodeURIComponent(f.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return fail(503);
  }
}
