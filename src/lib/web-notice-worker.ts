import "server-only";
import { createClient } from "@supabase/supabase-js";
import { webNoticeConfig, deliverWebNotice } from "./web-notices";
import {
  assertDeploymentEnvironment,
  externalEffectsAllowed,
} from "./deployment-environment";
// Runs only after the inquiry was committed. It cannot turn a mail failure into
// a lost inquiry or expose mail routing/status to the anonymous caller.
export async function processSubmittedWebNotices(
  form: string,
  request: string,
) {
  const env = process.env;
  try {
    assertDeploymentEnvironment(env);
    if (
      !externalEffectsAllowed(env) ||
      env.WEB_NOTICE_MAIL_ENABLED !== "true" ||
      !env.WEB_NOTICE_SUPABASE_SERVICE_KEY
    )
      return;
    const db = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL!,
      env.WEB_NOTICE_SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const source = await db
      .from("web_requests")
      .select("company_id")
      .eq("form_id", form)
      .eq("id", request)
      .maybeSingle();
    if (source.error || !source.data) return;
    const company = source.data.company_id as string,
      config = webNoticeConfig(env, company);
    if (!config || config.mode !== "send") return;
    const events = await db
      .from("web_notice_events")
      .select("id")
      .eq("company_id", company)
      .eq("request_id", request)
      .eq("status", "pending")
      .order("kind")
      .limit(2);
    if (events.error) return;
    for (const event of events.data ?? [])
      await deliverWebNotice(db, company, event.id, config);
  } catch {
    // The durable pending/unknown event is reviewed from the workspace.
    return;
  }
}
