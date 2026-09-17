import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  // Use the configured public origin when running behind a reverse proxy.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  if (code) {
    const db = await createClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/empresas", origin));
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=El%20enlace%20no%20es%20v%C3%A1lido%20o%20ya%20venci%C3%B3.",
      origin,
    ),
  );
}
