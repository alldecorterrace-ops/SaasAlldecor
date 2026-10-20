import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { estimateEmailAttempt } from "./estimate-email";

export async function downloadEstimateEmailCapture(
  db: SupabaseClient,
  company: string,
  id: string,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  const fail = (status: number) =>
    Response.json({ error: "Mensaje no disponible." }, { status, headers });
  if (!z.uuid().safeParse(company).success || !z.uuid().safeParse(id).success)
    return fail(404);
  try {
    const user = await db.auth.getUser();
    if (user.error || !user.data.user) return fail(401);
    const row = await db
      .from("estimate_email_attempts")
      .select("*")
      .eq("company_id", company)
      .eq("id", id)
      .eq("status", "captured")
      .maybeSingle();
    if (row.error) return fail(503);
    if (!row.data) return fail(404);
    const a = estimateEmailAttempt.parse(row.data);
    if (
      a.company_id !== company ||
      a.id !== id ||
      a.mode !== "capture" ||
      a.status !== "captured" ||
      !a.mime_sha256 ||
      !a.mime_bytes
    )
      return fail(503);
    const file = await db.storage
      .from("estimate-email-captures")
      .download(`${company}/${id}.eml`);
    if (file.error || !file.data || file.data.size !== a.mime_bytes)
      return fail(503);
    const bytes = Buffer.from(await file.data.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== a.mime_sha256)
      return fail(503);
    return new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type": "message/rfc822",
        "Content-Disposition": `attachment; filename="Estimado-prueba-${id}.eml"`,
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return fail(503);
  }
}
