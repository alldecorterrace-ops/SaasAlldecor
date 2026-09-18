import { createClient } from "@/lib/supabase/server";
import { archiveKindSchema } from "@/lib/historical-documents";
import { readHistoricalPdf } from "@/lib/historical-pdf";
import { uuid } from "@/lib/validation";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ companyId: string; kind: string; recordId: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status: number) =>
    Response.json({ error: "Archivo no disponible." }, { status, headers });
  const p = await params;
  if (
    !uuid.safeParse(p.companyId).success ||
    !uuid.safeParse(p.recordId).success ||
    !archiveKindSchema.safeParse(p.kind).success
  )
    return fail(404);
  const db = await createClient(),
    { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) return fail(401);
  // RLS checks active company membership, module permission and the manager-only review queue.
  const { data, error } = await db
    .from("historical_documents")
    .select("file_state,file_sha256,file_bytes")
    .eq("company_id", p.companyId)
    .eq("kind", p.kind)
    .eq("id", p.recordId)
    .maybeSingle();
  if (error) return fail(503);
  if (!data || data.file_state !== "available") return fail(404);
  try {
    const root = process.env.HISTORICAL_FILES_ROOT;
    if (!root) return fail(503);
    const pdf = await readHistoricalPdf(
      root,
      data.file_sha256,
      data.file_bytes,
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": 'attachment; filename="documento-historico.pdf"',
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return fail(503);
  }
}
