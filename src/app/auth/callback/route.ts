import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeAuthCallback } from "@/lib/auth-callback";
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Use the configured public origin when running behind a reverse proxy.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const path = await completeAuthCallback(
    async () => (await createClient()).auth,
    url.searchParams,
  );
  const response = NextResponse.redirect(new URL(path, origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
