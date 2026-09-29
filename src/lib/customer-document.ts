import { z } from "zod";
import { uuid } from "./validation";
export type CustomerDocumentClient = {
  auth: {
    getUser(): Promise<{ data: { user: unknown | null }; error: unknown }>;
  };
  rpc(
    name: "customer_permit_file",
    args: { p_company: string; p_customer: string; p_attachment: string },
  ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  storage: {
    from(bucket: "work-files"): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
};
const fileSchema = z
  .array(
    z.object({
      path: z.string(),
      name: z.string().min(1).max(255),
      record_id: z.uuid(),
    }),
  )
  .max(1);
export async function customerDocument(
  companyId: string,
  customerId: string,
  attachmentId: string,
  connect: () => Promise<CustomerDocumentClient>,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  const fail = (status: number) =>
    Response.json({ error: "Documento no disponible." }, { status, headers });
  if (
    ![companyId, customerId, attachmentId].every(
      (v) => uuid.safeParse(v).success,
    )
  )
    return fail(404);
  try {
    const db = await connect();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth.user) return fail(401);
    const { data, error } = await db.rpc("customer_permit_file", {
      p_company: companyId,
      p_customer: customerId,
      p_attachment: attachmentId,
    });
    if (error) return fail(error.code === "42501" ? 403 : 503);
    const parsed = fileSchema.safeParse(data);
    if (!parsed.success) return fail(503);
    if (!parsed.data.length) return fail(404);
    const f = parsed.data[0];
    const suffix = f.path.slice(`${companyId}/${f.record_id}/`.length);
    if (
      !f.path.startsWith(`${companyId}/${f.record_id}/`) ||
      !/^[-a-f0-9]{36}\.(pdf|png|jpg|webp)$/.test(suffix)
    )
      return fail(503);
    const mime: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      webp: "image/webp",
    };
    const ext = suffix.split(".")[1];
    const file = await db.storage.from("work-files").download(f.path);
    if (
      file.error ||
      !file.data ||
      file.data.size === 0 ||
      file.data.size > 5000000 ||
      file.data.type.split(";")[0] !== mime[ext]
    )
      return fail(503);
    return new Response(file.data, {
      headers: {
        ...headers,
        "Content-Type": mime[ext],
        "Content-Disposition": `inline; filename="documento.${ext}"; filename*=UTF-8''${encodeURIComponent(f.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return fail(503);
  }
}
