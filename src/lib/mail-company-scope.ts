import { z } from "zod";
// A SaaS deployment can explicitly cover new manager-created companies.
// Omission retains the existing per-company allowlist; this is not authorization.
// Database claims still enforce tenant access, recipients and deliberate actions.
export function mailCompanyEnabled(
  env: Record<string, string | undefined>,
  prefix: "INVOICE" | "ESTIMATE" | "WEB_NOTICE",
  company: string,
) {
  if (!z.uuid().safeParse(company).success) return false;
  const scope = env[`${prefix}_MAIL_COMPANY_SCOPE`];
  if (scope === "all") return true;
  if (scope !== undefined && scope !== "allowlist") return false;
  const companies = (env[`${prefix}_MAIL_COMPANY_IDS`] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    companies.length > 0 &&
    companies.every((s) => z.uuid().safeParse(s).success) &&
    companies.includes(company)
  );
}
