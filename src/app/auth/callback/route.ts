import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  if (code) {
    const db = await createClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/empresas", url.origin));
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=El%20enlace%20no%20es%20v%C3%A1lido%20o%20ya%20venci%C3%B3.",
      url.origin,
    ),
  );
}
