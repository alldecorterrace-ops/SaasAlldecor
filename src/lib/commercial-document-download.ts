import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuid } from "./validation";
import { storedCommercialDocument } from "./commercial-documents";
export async function downloadCommercialDocument(
  db: SupabaseClient,
  companyId: string,
  id: string,
  customer: string | null = null,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  const fail = (status: number) =>
    Response.json({ error: "Documento no disponible." }, { status, headers });
  if (
    !uuid.safeParse(companyId).success ||
    !uuid.safeParse(id).success ||
    (customer && !uuid.safeParse(customer).success)
  )
    return fail(404);
  try {
    const user = await db.auth.getUser();
    if (user.error || !user.data.user) return fail(401);
    const result = await db
      .from("commercial_documents")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .eq("state", "ready")
      .maybeSingle();
    if (result.error) return fail(503);
    if (!result.data) return fail(404);
    const d = storedCommercialDocument.parse(result.data);
    if (
      d.company_id !== companyId ||
      d.id !== id ||
      d.state !== "ready" ||
      !d.sha256 ||
      !d.bytes
    )
      return fail(503);
    if (customer) {
      const client = await db
        .from("customers")
        .select("id")
        .eq("company_id", companyId)
        .eq("id", customer)
        .maybeSingle();
      if (client.error) return fail(503);
      if (!client.data || customer !== d.customer_id) return fail(404);
      const source = await db
        .from(d.kind === "estimate" ? "estimates" : "invoices")
        .select("customer_id,status")
        .eq("company_id", companyId)
        .eq("id", d.record_id)
        .maybeSingle();
      if (source.error) return fail(503);
      if (
        !source.data ||
        source.data.customer_id !== customer ||
        source.data.status === (d.kind === "estimate" ? "BORRADOR" : "VOID")
      )
        return fail(404);
    }
    const file = await db.storage
      .from("commercial-pdfs")
      .download(`${companyId}/${id}.pdf`);
    if (file.error || !file.data || file.data.size !== d.bytes)
      return fail(503);
    const bytes = Buffer.from(await file.data.arrayBuffer());
    if (
      bytes.subarray(0, 5).toString() !== "%PDF-" ||
      createHash("sha256").update(bytes).digest("hex") !== d.sha256
    )
      return fail(503);
    const name = `${d.kind === "estimate" ? "Estimado" : "Factura"}-${d.number}-r${d.record_version}.pdf`;
    return new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="documento.pdf"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return fail(503);
  }
}
