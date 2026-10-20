import nodemailer from "nodemailer";
import { z } from "zod";
export const noticeAddress = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .refine((s) => !s.startsWith("-") && !/[\r\n]/.test(s));
export const webNoticeEvent = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  request_id: z.uuid(),
  kind: z.enum(["customer", "staff"]),
  recipient: noticeAddress.nullable(),
  status: z.enum([
    "blocked",
    "pending",
    "processing",
    "captured",
    "queued",
    "failed",
    "unknown",
  ]),
  mode: z.enum(["capture", "send"]).nullable(),
  requested_by: z.uuid().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
  mime_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  mime_bytes: z.number().int().positive().max(1000000).nullable(),
  snapshot: z.object({
    company: z.object({ id: z.uuid(), name: z.string().min(1).max(255) }),
    request: z.object({
      id: z.uuid(),
      created_at: z.iso.datetime({ offset: true }),
      data: z.object({
        name: z.string().min(2).max(160),
        email: noticeAddress,
        phone: z.string().max(64),
        service: z.string().max(255),
        message: z.string().max(2000),
        length: z.string().max(7),
        width: z.string().max(7),
        height: z.string().max(7),
        address: z.string().max(255).optional(),
        city: z.string().max(128).optional(),
        postal_code: z.string().max(24).optional(),
        contact_preference: z.string().max(60).optional(),
        appointment_date: z.string().max(10).optional(),
      }),
    }),
  }),
});
export type WebNoticeEvent = z.infer<typeof webNoticeEvent>;
export type WebNoticeConfig = {
  mode: "capture" | "send";
  from: string;
  site: string;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const header = (s: string) => s.replace(/[\r\n\u0000-\u001f\u007f]/g, " ");
export function webNoticeBody(e: WebNoticeEvent, synthetic: boolean) {
  const { company, request } = e.snapshot,
    d = request.data;
  const intro =
    e.kind === "customer"
      ? `Hello ${d.name},\n\nThank you for contacting ${company.name}. We have received your message and our team will review it.`
      : `A new inquiry was received by ${company.name}.`;
  const fields: [string, string][] = [
    ["Name", d.name],
    ["Email", d.email],
    ["Phone", d.phone],
    ["Service", d.service],
    ["Approximate dimensions (ft)", `${d.length} × ${d.width} × ${d.height}`],
    ["Address", [d.address, d.city, d.postal_code].filter(Boolean).join(", ")],
    ["Contact preference", d.contact_preference ?? ""],
    ["Requested appointment date", d.appointment_date ?? ""],
    ["Message", d.message],
  ];
  const detail = e.kind === "staff" ? fields.filter(([, v]) => v) : [];
  const warning = synthetic
    ? "PRUEBA · DATOS FICTICIOS · SIN ENVÍO EXTERNO"
    : "";
  const closing =
    e.kind === "customer"
      ? "This receipt confirms your message only. It is not a quote, appointment confirmation or payment request."
      : "Review the inquiry in the workspace before creating a lead or contacting the customer.";
  const text = [
    warning,
    intro,
    ...detail.map(([k, v]) => `${k}: ${v}`),
    closing,
    company.name,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:14px Arial,sans-serif;color:#18324b"><div style="max-width:640px;margin:24px auto;padding:24px;border:1px solid #d9e1e7"><h1>${escape(e.kind === "customer" ? "Message received" : "New inquiry")}</h1>${warning ? `<p>${escape(warning)}</p>` : ""}<p>${escape(intro).replace(/\n/g, "<br>")}</p>${detail.length ? `<table style="width:100%;border-collapse:collapse">${detail.map(([k, v]) => `<tr><th style="text-align:left;vertical-align:top;padding:8px">${escape(k)}</th><td style="padding:8px;overflow-wrap:anywhere">${escape(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>` : ""}<p>${escape(closing)}</p><p>${escape(company.name)}</p></div></body></html>`;
  return { text, html };
}
export async function composeWebNotice(
  config: WebNoticeConfig,
  raw: WebNoticeEvent,
) {
  const e = webNoticeEvent.parse(raw);
  noticeAddress.parse(config.from);
  const site = new URL(config.site);
  if (
    site.protocol !== "https:" ||
    site.username ||
    site.password ||
    site.pathname !== "/" ||
    site.search ||
    site.hash ||
    e.mode !== config.mode ||
    e.status !== "processing" ||
    e.company_id !== e.snapshot.company.id ||
    e.request_id !== e.snapshot.request.id ||
    !e.recipient ||
    (e.kind === "customer" && e.recipient !== e.snapshot.request.data.email)
  )
    throw new Error("notice_snapshot_mismatch");
  if (
    config.mode === "capture" &&
    (!/@saasalldecor[.]invalid$/i.test(e.recipient) ||
      !/@saasalldecor[.]invalid$/i.test(e.snapshot.request.data.email))
  )
    throw new Error("synthetic_recipient_required");
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const result = await composer.sendMail({
    from: { name: header(e.snapshot.company.name), address: config.from },
    to: e.recipient,
    envelope: { from: config.from, to: [e.recipient] },
    messageId: `<web-notice-${e.id}@${site.hostname}>`,
    date: new Date(e.created_at),
    subject:
      e.kind === "customer"
        ? "Message received"
        : `New inquiry · ${header(e.snapshot.company.name)}`,
    ...webNoticeBody(e, config.mode === "capture"),
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const message = result.message as Buffer;
  if (!message.length || message.length > 1000000)
    throw new Error("notice_too_large");
  return { message, from: config.from, to: e.recipient };
}
