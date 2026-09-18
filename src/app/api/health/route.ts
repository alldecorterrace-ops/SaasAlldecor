import { createClient } from "@supabase/supabase-js";
import { createHealthCheck } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const check = createHealthCheck(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  // An anonymous, read-only RPC checks Postgres without exposing business data
  // or using a service key. The returned value is intentionally discarded.
  const { error } = await db
    .rpc("web_form_info", {
      p_form: "00000000-0000-0000-0000-000000000000",
    })
    .abortSignal(AbortSignal.timeout(5000));
  return !error;
});

export async function GET() {
  const ok = await check();
  return Response.json(
    { status: ok ? "ok" : "unavailable" },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
