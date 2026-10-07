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
  appliedPaymentTotal,
  type StoredCommercialDocument,
} from "./commercial-documents";
import { usd, paymentMethods, paymentStatuses } from "./finance";

const address = z
  .string()
  .max(254)
  .pipe(z.email())
  .refine((s) => !s.startsWith("-") && !/[\r\n]/.test(s));
export const invoiceEmailAttempt = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  request_id: z.uuid(),
  invoice_id: z.uuid(),
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
export type InvoiceEmailAttempt = z.infer<typeof invoiceEmailAttempt>;
export type InvoiceEmailConfig = {
  mode: "capture" | "send";
  from: string;
  site: string;
};
export type InvoiceEmailResult = {
  error?: string;
  success?: string;
  attemptId?: string;
  status?: InvoiceEmailAttempt["status"];
};

export function invoiceEmailConfig(
  env: Record<string, string | undefined>,
  company: string,
): InvoiceEmailConfig | null {
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
    if (!externalEffectsAllowed(env) || env.INVOICE_MAIL_ENABLED !== "true")
      return null;
    if (!mailCompanyEnabled(env, "INVOICE", company)) return null;
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
export function invoiceEmailBody(
  doc: StoredCommercialDocument,
  synthetic: boolean,
) {
  const r = doc.snapshot.record,
    company = commercialCompanyName(doc.snapshot.company);
  const contact = commercialContactLines(doc.snapshot.company).join("\n"),
    footer = commercialFooterLines(doc.snapshot.company).join("\n"),
    instructions =
      doc.snapshot.company.commercial?.payment_instructions ||
      `Zelle / Wire transfer / Check / Cash. Reference: ${doc.number}.`;
  const totals = [
    ["Subtotal", usd(r.subtotal)],
    ["Discount", `-${usd(r.discount)}`],
    [r.tax_pct === 7 ? "Tax (7%)" : "Tax", usd(r.taxes)],
    ["Total", usd(r.total)],
    ...(r.paid_amount !== undefined
      ? [["Paid", `-${usd(r.paid_amount)}`]]
      : []),
    ...(r.balance_due !== undefined
      ? [["Balance Due", usd(r.balance_due)]]
      : []),
  ];
  const row = (cells: string[], right = cells.map((_, n) => n).slice(1)) =>
    `<tr>${cells.map((s, n) => `<td style="padding:10px 12px;border-bottom:1px solid #e3e8ee;overflow-wrap:anywhere;${right.includes(n) ? "text-align:right;" : ""}">${escape(s).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`;
  const heading = (cells: string[]) =>
    `<tr>${cells.map((s) => `<th style="padding:10px 12px;background:#0d2a4a;color:#fff;text-align:left">${escape(s)}</th>`).join("")}</tr>`;
  const items = r.items
    .map((i) =>
      row([
        [i.name, i.description].filter(Boolean).join("\n"),
        String(i.qty),
        usd(i.line_total),
      ]),
    )
    .join("");
  const payments = r.payments?.length
    ? `<h2 style="font-size:14px;color:#0d2a4a">Payments / Deposits</h2><table style="width:100%;border-collapse:collapse">${heading(["Date", "Method / Reference", "Amount"])}${r.payments.map((p) => row([p.payment_date, [paymentMethods[p.method as keyof typeof paymentMethods] ?? p.method, p.reference, p.notes].filter(Boolean).join("\n"), usd(p.amount)], [2])).join("")}${row(["Total payments", "", usd(appliedPaymentTotal(r.payments))])}</table>`
    : "";
  const status =
    r.payment_status === undefined ? "" : paymentStatuses[r.payment_status];
  const intro = `Hello ${r.customer_snapshot.full_name},\n\nHere is invoice ${doc.number} from ${company}. The attached PDF contains the full breakdown, payments and balance at revision ${doc.record_version}.`;
  const text = [
    synthetic ? "PRUEBA · DATOS FICTICIOS · SIN ENVÍO EXTERNO\n" : "",
    intro,
    `Date: ${r.invoice_date} · Status: ${status}`,
    ...r.items.map((i) => `${i.name} · ${i.qty} · ${usd(i.line_total)}`),
    ...totals.map(([k, v]) => `${k}: ${v}`),
    ...(r.payments ?? []).map(
      (p) =>
        `${p.payment_date} · ${paymentMethods[p.method as keyof typeof paymentMethods] ?? p.method} · ${usd(p.amount)} · ${p.reference}`,
    ),
    r.status === "VOID"
      ? "Factura anulada. Los pagos asociados a la anulación no se presentan como aplicados."
      : "",
    r.notes,
    `Payment methods: ${instructions}`,
    "The PDF is attached to this email.",
    company,
    contact,
    footer,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef1f4;font:14px Arial,Helvetica,sans-serif;color:#3a4654"><table role="presentation" style="width:100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" style="width:100%;max-width:600px;background:white;border-collapse:collapse"><tr><td style="padding:28px 32px;background:#0d2a4a;border-bottom:4px solid #ab8045;color:white;font-size:24px">${escape(company)}</td></tr><tr><td style="padding:26px 32px">${synthetic ? '<p style="color:#a34118">PRUEBA · DATOS FICTICIOS · SIN ENVÍO EXTERNO</p>' : ""}<p style="color:#ab8045">Invoice ${escape(doc.number)} · ${escape(r.invoice_date ?? "")}</p><h1 style="font-size:23px;color:#0d2a4a">Hello ${escape(r.customer_snapshot.full_name)},</h1><p>Here is your invoice from ${escape(company)}. The PDF is attached, with the payments and balance at revision ${doc.record_version}.</p><p>Status: ${escape(status)}</p><table style="width:100%;border-collapse:collapse">${heading(["Service / Product", "Qty", "Amount"])}${items}</table><table style="width:100%;margin-top:12px;border-collapse:collapse">${totals.map(([k, v]) => row([k, v])).join("")}</table>${payments}${r.status === "VOID" ? "<p>Factura anulada. Los pagos asociados a la anulación no se presentan como aplicados.</p>" : ""}${r.notes ? `<p>${escape(r.notes).replace(/\n/g, "<br>")}</p>` : ""}<p><strong>Payment methods:</strong> ${escape(instructions).replace(/\n/g, "<br>")}</p><p>You can open or save the attached PDF.</p></td></tr><tr><td style="padding:18px 32px;background:#0d2a4a;color:#aecbe9">${escape(company)}${contact ? `<p>${escape(contact).replace(/\n/g, "<br>")}</p>` : ""}${footer ? `<p>${escape(footer).replace(/\n/g, "<br>")}</p>` : ""}</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

export async function composeInvoiceMail(
  config: InvoiceEmailConfig,
  rawAttempt: InvoiceEmailAttempt,
  rawDoc: StoredCommercialDocument,
  bytes: Uint8Array,
) {
  const a = invoiceEmailAttempt.parse(rawAttempt),
    d = storedCommercialDocument.parse(rawDoc);
  address.parse(config.from);
  const site = new URL(config.site);
  if (
    site.protocol !== "https:" ||
    site.username ||
    site.password ||
    a.mode !== config.mode ||
    a.status !== "processing" ||
    d.kind !== "invoice" ||
    d.state !== "ready" ||
    d.company_id !== a.company_id ||
    d.id !== a.document_id ||
    d.record_id !== a.invoice_id ||
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
  const body = invoiceEmailBody(d, config.mode === "capture");
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
    messageId: `<invoice-${a.id}@${site.hostname}>`,
    date: new Date(a.created_at),
    subject: `Invoice ${headerText(d.number)} · ${headerText(commercialCompanyName(d.snapshot.company))}`,
    ...body,
    attachments: [
      {
        filename: `Invoice-${headerText(d.number).replace(/[\\/]/g, "-")}-r${d.record_version}.pdf`,
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

export async function sendInvoiceMail(
  config: InvoiceEmailConfig,
  mail: Awaited<ReturnType<typeof composeInvoiceMail>>,
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
function outcome(a: InvoiceEmailAttempt): InvoiceEmailResult {
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
        "El servidor de correo aceptó la factura. Comprueba su recepción con el destinatario.",
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
export async function deliverInvoiceEmail(
  db: SupabaseClient,
  company: string,
  invoice: string,
  version: number,
  document: string,
  request: string,
  config: InvoiceEmailConfig | null,
  send = sendInvoiceMail,
  expectedRecipient: string | null = null,
): Promise<InvoiceEmailResult> {
  if (!config)
    return {
      error: "El envío de facturas no está habilitado en este entorno.",
    };
  const claimed = await db.rpc("claim_invoice_email", {
    p_company: company,
    p_invoice: invoice,
    p_version: version,
    p_document: document,
    p_request: request,
    p_mode: config.mode,
    p_expected_recipient: expectedRecipient,
  });
  if (claimed.error)
    return {
      error: claimed.error.message.includes("record_conflict")
        ? "La factura cambió. Recarga la ficha antes de enviar."
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
      attempt: invoiceEmailAttempt,
      document: storedCommercialDocument.optional(),
    })
    .safeParse(claimed.data);
  if (!parsed.success)
    return { error: "No se pudo comprobar el registro del envío." };
  const a = parsed.data.attempt;
  if (
    a.company_id !== company ||
    a.invoice_id !== invoice ||
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
    const mail = await composeInvoiceMail(
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
        .from("invoice-email-captures")
        .upload(path, mail.message, {
          contentType: "message/rfc822",
          upsert: false,
        });
      if (upload.error) {
        const existing = await db.storage
          .from("invoice-email-captures")
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
  const saved = await db.rpc("finish_invoice_email", {
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
  const final = invoiceEmailAttempt.safeParse(saved.data);
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
