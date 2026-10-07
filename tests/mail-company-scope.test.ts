import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { invoiceEmailConfig } from "../src/lib/invoice-email";
import { estimateEmailConfig } from "../src/lib/estimate-email";
import { webNoticeConfig } from "../src/lib/web-notices";

test("explicit SaaS mail scope supports newly created companies without weakening flags or staging isolation", () => {
  for (const [prefix, configure] of [
    ["INVOICE", invoiceEmailConfig],
    ["ESTIMATE", estimateEmailConfig],
    ["WEB_NOTICE", webNoticeConfig],
  ] as const) {
    const company = randomUUID();
    const env = {
      APP_ENVIRONMENT: "production",
      NEXT_PUBLIC_SITE_URL: "https://app.example.test",
      MAIL_FROM_ADDRESS: "notice@example.test",
      [`${prefix}_MAIL_ENABLED`]: "true",
    };
    assert.equal(configure(env, company), null);
    const all = { ...env, [`${prefix}_MAIL_COMPANY_SCOPE`]: "all" };
    assert.equal(configure(all, company)?.mode, "send");
    assert.equal(configure(all, randomUUID())?.mode, "send");
    assert.equal(configure(all, "invalid"), null);
    assert.equal(
      configure({ ...all, [`${prefix}_MAIL_ENABLED`]: "false" }, company),
      null,
    );
    assert.equal(
      configure({ ...env, [`${prefix}_MAIL_COMPANY_SCOPE`]: "typo" }, company),
      null,
    );
    const stage = {
      ...all,
      APP_ENVIRONMENT: "staging",
      STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
      NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
      NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
    };
    assert.equal(configure(stage, company), null);
    assert.equal(
      configure({ ...stage, [`${prefix}_MAIL_ENABLED`]: "false" }, company)
        ?.mode,
      "capture",
    );
  }
});
