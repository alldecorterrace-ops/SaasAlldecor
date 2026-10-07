import { NextResponse } from "next/server";
import { companyContext } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { downloadWebNotice } from "@/lib/web-notices";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string; eventId: string }> },
) {
  const { companyId, eventId } = await params,
    deny = () =>
      new NextResponse("Documento no disponible", {
        status: 404,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
  try {
    const { db, member } = await companyContext(companyId);
    if (!canAccess(member, "estimadosweb")) return deny();
    const file = await downloadWebNotice(db, companyId, eventId);
    if (!file) return deny();
    return new NextResponse(file.bytes, {
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": `attachment; filename="${file.name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return deny();
  }
}
