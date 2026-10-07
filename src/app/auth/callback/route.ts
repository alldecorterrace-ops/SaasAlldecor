import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authCallbackPath } from "@/lib/password-recovery";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  // Use the configured public origin when running behind a reverse proxy.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  if (code) {
    const db = await createClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(authCallbackPath(url.searchParams.get("next")), origin),
      );
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=No%20pudimos%20abrir%20la%20sesi%C3%B3n%20con%20este%20enlace.%20Si%20ya%20confirmaste%20tu%20correo%2C%20inicia%20sesi%C3%B3n.%20Si%20no%2C%20usa%20el%20enlace%20m%C3%A1s%20reciente%20en%20el%20navegador%20donde%20te%20registraste.",
      origin,
    ),
  );
}
