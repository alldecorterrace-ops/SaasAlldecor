import { backupStatus } from "@/lib/backup-status";
import { createHealthCheck } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const check = createHealthCheck(async () => {
  if (
    process.env.BACKUP_MONITOR_ENABLED !== "true" ||
    !process.env.BACKUP_RECEIPT_ROOT
  )
    return false;
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const project = url.hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1];
  if (!project) return false;
  return (
    (await backupStatus(process.env.BACKUP_RECEIPT_ROOT, project)).status ===
    "ok"
  );
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
