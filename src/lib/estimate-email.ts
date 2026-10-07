import { mailCompanyEnabled } from "./mail-company-scope";
import {
  commercialCompanyName,
  commercialContactLines,
  commercialFooterLines,
} from "./commercial-identity";
import nodemailer from "nodemailer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertDeploymentEnvironment,
  externalEffectsAllowed,
} from "./deployment-environment";
import {
  storedCommercialDocument,
  type StoredCommercialDocument,
} from "./commercial-documents";
import { usd } from "./finance";

const address = z
  .string()
  .max(254)
  .pipe(z.email())
  .refine((s) => !s.startsWith("-") && !/[\r\n]/.test(s));
export const estimateEmailAttempt = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  request_id: z.uuid(),
  estimate_id: z.uuid(),
  document_id: z.uuid(),
  record_version: z.number().int().positive(),
  requested_by: z.uuid(),
  recipient: address,
  mode: z.enum(["capture", "send"]),
  status: z.enum(["processing", "captured", "queued", "failed", "unknown"]),
  created_at: z.iso.datetime({ offset: true }),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
  mime_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  mime_bytes: z.number().int().positive().max(8000000).nullable(),
});
export type EstimateEmailAttempt = z.infer<typeof estimateEmailAttempt>;
export type EstimateEmailConfig = {
  mode: "capture" | "send";
  from: string;
  site: string;
};
export type EstimateEmailResult = {
  error?: string;
  success?: string;
  attemptId?: string;
  status?: EstimateEmailAttempt["status"];
};

export function estimateEmailConfig(
  env: Record<string, string | undefined>,
  company: string,
): EstimateEmailConfig | null {
  try {
    assertDeploymentEnvironment(env);
    z.uuid().parse(company);
    const site = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    if (
      site.protocol !== "https:" ||
      site.username ||
      site.password ||
      site.search ||
      site.hash ||
      site.pathname !== "/"
    )
      return null;
    if (env.APP_ENVIRONMENT === "staging")
      return {
        mode: "capture",
        from: "notice@saasalldecor.invalid",
        site: site.origin,
      };
    if (!externalEffectsAllowed(env) || env.ESTIMATE_MAIL_ENABLED !== "true")
      return null;
    if (!mailCompanyEnabled(env, "ESTIMATE", company)) return null;
    return {
      mode: "send",
      from: address.parse(env.MAIL_FROM_ADDRESS),
      site: site.origin,
    };
  } catch {
    return null;
  }
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
const headerText = (s: string) => s.replace(/[\r\n\u0000-\u001f\u007f]/g, " ");
export function estimateEmailBody(
  doc: StoredCommercialDocument,
  synthetic: boolean,
) {
  const r = doc.snapshot.record,
    company = commercialCompanyName(doc.snapshot.company);
  const contact = commercialContactLines(doc.snapshot.company).join("\n"),
    footer = commercialFooterLines(doc.snapshot.company).join("\n");
  const rows = r.items
    .map(
      (i) =>
        `<tr><td style="padding:10px;border-bottom:1px solid #ddd">${escape(i.name)}${i.description ? `<br>${escape(i.description).replace(/\n/g, "<br>")}` : ""}</td><td style="padding:10px;text-align:right">${escape(usd(i.line_total))}</td></tr>`,
    )
    .join("");
  const intro = `Hello ${r.customer_snapshot.full_name},\n\nThank you for choosing ${company}. Here is estimate ${doc.number}.`;
  const totals = [
    ["Subtotal", usd(r.subtotal)],
    ["Discount", `-${usd(r.discount)}`],
    [r.tax_pct === 7 ? "Tax (7%)" : "Tax", usd(r.taxes)],
    ["Total", usd(r.total)],
  ];
  const terms = r.commercial_terms;
  const stages = [
    "Deposit on acceptance",
    "When scheduling start",
    "At 80% progress",
    "On completion",
  ];
  const schedule = terms
    ? terms.percentages
        .map((p, n) => `${stages[n]}: ${p}% · ${usd(terms.amounts[n])}`)
        .join("\n")
    : "";
  const text = [
    synthetic ? "PRUEBA · DATOS FICTICIOS · SIN ENVÍO EXTERNO" : "",
    intro,
    `Date: ${r.estimate_date} · Valid until: ${r.valid_until ?? "Not specified"}`,
    ...r.items.map(
      (i) =>
        `${i.name}${i.description ? `\n${i.description}` : ""} · ${usd(i.line_total)}`,
    ),
    ...totals.map(([k, v]) => `${k}: ${v}`),
    schedule,
    terms?.delivery_date ? `Expected delivery: ${terms.delivery_date}` : "",
    terms?.conditions,
    r.notes,
    "The estimate PDF is attached. This estimate does not confirm payment or a customer signature.",
    company,
    contact,
    footer,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="font:14px Arial,sans-serif;color:#18324b"><div style="max-width:680px;margin:auto"><h2>Estimate ${escape(doc.number)}</h2>${synthetic ? "<p>PRUEBA · DATOS FICTICIOS · SIN ENVÍO EXTERNO</p>" : ""}<p>Hello ${escape(r.customer_snapshot.full_name)},</p><p>Thank you for choosing ${escape(company)}. Here is your estimate:</p><table style="width:100%;border-collapse:collapse">${rows}${totals.map(([k, v]) => `<tr><td style="padding:10px">${escape(k)}</td><td style="padding:10px;text-align:right">${escape(v)}</td></tr>`).join("")}</table>${schedule ? `<h3>Payment schedule</h3><p>${escape(schedule).replace(/\n/g, "<br>")}</p>` : ""}${terms?.conditions ? `<p>${escape(terms.conditions).replace(/\n/g, "<br>")}</p>` : ""}${r.notes ? `<p>${escape(r.notes).replace(/\n/g, "<br>")}</p>` : ""}<p>The estimate PDF is attached. This estimate does not confirm payment or a customer signature.</p><p>${escape(company)}</p>${contact ? `<p>${escape(contact).replace(/\n/g, "<br>")}</p>` : ""}${footer ? `<p>${escape(footer).replace(/\n/g, "<br>")}</p>` : ""}</div></body></html>`;
  return { text, html };
}

export async function composeEstimateMail(
  config: EstimateEmailConfig,
  rawAttempt: EstimateEmailAttempt,
  rawDoc: StoredCommercialDocument,
  bytes: Uint8Array,
) {
  const a = estimateEmailAttempt.parse(rawAttempt),
    d = storedCommercialDocument.parse(rawDoc);
  address.parse(config.from);
  const site = new URL(config.site);
  if (
    site.protocol !== "https:" ||
    site.username ||
    site.password ||
    a.mode !== config.mode ||
    a.status !== "processing" ||
    d.kind !== "estimate" ||
    d.state !== "ready" ||
    d.company_id !== a.company_id ||
    d.id !== a.document_id ||
    d.record_id !== a.estimate_id ||
    d.record_version !== a.record_version ||
    bytes.length !== d.bytes ||
    bytes.length > 5000000 ||
    Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-" ||
    createHash("sha256").update(bytes).digest("hex") !== d.sha256
  )
    throw new Error("mail_document_mismatch");
  if (
    config.mode === "capture" &&
    !/@saasalldecor[.]invalid$/i.test(a.recipient)
  )
    throw new Error("synthetic_recipient_required");
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const body = estimateEmailBody(d, config.mode === "capture");
  const result = await composer.sendMail({
    from: {
      name: headerText(commercialCompanyName(d.snapshot.company)),
      address: config.from,
    },
    to: {
      name: headerText(d.snapshot.record.customer_snapshot.full_name),
      address: a.recipient,
    },
    envelope: { from: config.from, to: [a.recipient] },
    messageId: `<estimate-${a.id}@${site.hostname}>`,
    date: new Date(a.created_at),
    subject: `Estimate ${headerText(d.number)} · ${headerText(commercialCompanyName(d.snapshot.company))}`,
    ...body,
    attachments: [
      {
        filename: `Estimate-${headerText(d.number).replace(/[\\/]/g, "-")}-r${d.record_version}.pdf`,
        content: Buffer.from(bytes),
        contentType: "application/pdf",
        contentDisposition: "attachment",
      },
    ],
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const message = result.message as Buffer;
  if (!message.length || message.length > 8000000)
    throw new Error("mail_too_large");
  return { message, from: config.from, to: a.recipient };
}

export async function sendEstimateMail(
  config: EstimateEmailConfig,
  mail: Awaited<ReturnType<typeof composeEstimateMail>>,
): Promise<"queued" | "failed" | "unknown"> {
  if (config.mode !== "send") throw new Error("external_email_disabled");
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: "queued" | "failed" | "unknown") => {
      if (!done) {
        done = true;
        resolve(result);
      }
    };
    try {
      const child = spawn(
        "/usr/sbin/sendmail",
        ["-i", "-f", mail.from, "--", mail.to],
        {
          shell: false,
          stdio: ["pipe", "ignore", "ignore"],
          timeout: 20000,
          killSignal: "SIGKILL",
        },
      );
      child.once("error", () => finish("failed"));
      child.once("close", (code, signal) =>
        finish(signal ? "unknown" : code === 0 ? "queued" : "failed"),
      );
      child.stdin.once("error", () => finish("unknown"));
      child.stdin.end(mail.message);
    } catch {
      finish("failed");
    }
  });
}
function outcome(a: EstimateEmailAttempt): EstimateEmailResult {
  const base = { attemptId: a.id, status: a.status };
  if (a.status === "captured")
    return {
      ...base,
      success:
        "Prueba guardada sin enviar correo. Puedes descargar el mensaje con el mismo PDF adjunto.",
    };
  if (a.status === "queued")
    return {
      ...base,
      success:
        "El servidor de correo aceptó el estimado. Comprueba su recepción con el destinatario.",
    };
  if (a.status === "failed")
    return {
      ...base,
      error:
        "El envío no se completó. Revisa el registro antes de preparar otro envío.",
    };
  return {
    ...base,
    error:
      "No se pudo confirmar el resultado del envío. Comprueba el registro y la recepción antes de repetirlo para evitar duplicados.",
  };
}
export async function deliverEstimateEmail(
  db: SupabaseClient,
  company: string,
  estimate: string,
  version: number,
  document: string,
  request: string,
  config: EstimateEmailConfig | null,
  send = sendEstimateMail,
  expectedRecipient: string | null = null,
): Promise<EstimateEmailResult> {
  if (!config)
    return {
      error: "El envío de estimados no está habilitado en este entorno.",
    };
  const claimed = await db.rpc("claim_estimate_email", {
    p_company: company,
    p_estimate: estimate,
    p_version: version,
    p_document: document,
    p_request: request,
    p_mode: config.mode,
    p_expected_recipient: expectedRecipient,
  });
  if (claimed.error)
    return {
      error: claimed.error.message.includes("record_conflict")
        ? "El estimado cambió. Recarga la ficha antes de enviar."
        : claimed.error.message.includes("recipient_changed")
          ? "El correo del cliente cambió. Recarga la ficha para confirmar el destinatario actual."
          : claimed.error.message.includes("recipient")
            ? "El cliente no tiene un correo válido para este entorno. Revisa su ficha."
            : claimed.error.message.includes("mail_rate_limited")
              ? "Se alcanzó el límite diario de envíos de esta empresa."
              : "No se pudo preparar este envío. Recarga la ficha y revisa tus permisos.",
    };
  const parsed = z
    .object({
      claimed: z.boolean(),
      attempt: estimateEmailAttempt,
      document: storedCommercialDocument.optional(),
    })
    .safeParse(claimed.data);
  if (!parsed.success)
    return { error: "No se pudo comprobar el registro del envío." };
  const a = parsed.data.attempt;
  if (
    a.company_id !== company ||
    a.estimate_id !== estimate ||
    a.document_id !== document ||
    a.record_version !== version ||
    a.request_id !== request ||
    a.mode !== config.mode
  )
    return { error: "No se pudo comprobar el registro del envío." };
  if (!parsed.data.claimed) return outcome(a);
  let status: "captured" | "queued" | "failed" | "unknown" = "failed",
    sha: string | null = null,
    length: number | null = null;
  try {
    const d = parsed.data.document;
    if (!d) throw new Error("missing_document");
    const file = await db.storage
      .from("commercial-pdfs")
      .download(`${company}/${document}.pdf`);
    if (file.error || !file.data) throw new Error("missing_document_file");
    const mail = await composeEstimateMail(
      config,
      a,
      d,
      new Uint8Array(await file.data.arrayBuffer()),
    );
    sha = createHash("sha256").update(mail.message).digest("hex");
    length = mail.message.length;
    if (config.mode === "capture") {
      const path = `${company}/${a.id}.eml`;
      const upload = await db.storage
        .from("estimate-email-captures")
        .upload(path, mail.message, {
          contentType: "message/rfc822",
          upsert: false,
        });
      if (upload.error) {
        const existing = await db.storage
          .from("estimate-email-captures")
          .download(path);
        if (
          existing.error ||
          !existing.data ||
          existing.data.size !== length ||
          createHash("sha256")
            .update(Buffer.from(await existing.data.arrayBuffer()))
            .digest("hex") !== sha
        )
          throw new Error("mail_capture_failed");
      }
      status = "captured";
    } else {
      // Once handoff starts, an exception/timeout is uncertain, not a safe retry.
      try {
        status = await send(config, mail);
      } catch {
        status = "unknown";
      }
    }
  } catch {
    status = "failed";
  }
  const saved = await db.rpc("finish_estimate_email", {
    p_company: company,
    p_attempt: a.id,
    p_status: status,
    p_sha256: sha,
    p_bytes: length,
  });
  if (saved.error)
    return {
      attemptId: a.id,
      status: "unknown",
      error:
        "No se pudo confirmar el registro del envío. Comprueba la recepción antes de repetirlo.",
    };
  const final = estimateEmailAttempt.safeParse(saved.data);
  if (
    !final.success ||
    final.data.id !== a.id ||
    final.data.company_id !== company ||
    final.data.status !== status ||
    final.data.mime_sha256 !== sha ||
    final.data.mime_bytes !== length
  )
    return {
      attemptId: a.id,
      status: "unknown",
      error: "No se pudo confirmar el registro del envío. Revisa su historial.",
    };
  return outcome(final.data);
}
