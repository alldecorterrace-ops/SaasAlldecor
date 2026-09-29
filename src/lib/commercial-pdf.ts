import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { StoredCommercialDocument } from "./commercial-documents";
import { estimateStatuses } from "./estimates";
import { priceBases } from "./commercial";
import { usd } from "./finance";
// Vendor font is pinned, licensed and included in the release; never fetch customer content.
export async function renderCommercialPdf(
  doc: StoredCommercialDocument,
  synthetic: boolean,
  fontBytes?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    fontBytes ??
      (await readFile(
        path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"),
      )),
    { subset: true },
  );
  const created = new Date(doc.created_at);
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);
  pdf.setProducer("SaasAlldecor");
  pdf.setCreator("SaasAlldecor");
  const title = doc.kind === "estimate" ? "Estimado" : "Factura",
    r = doc.snapshot.record;
  pdf.setTitle(`${title} ${doc.number} · Revisión ${doc.record_version}`);
  const supported = new Set(font.getCharacterSet());
  const normalize = (s: string) =>
    s.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  function wrap(s: string, f: PDFFont, size: number, width: number) {
    const lines: string[] = [];
    for (const paragraph of normalize(s).split("\n")) {
      const characters = Array.from(paragraph);
      for (const ch of characters)
        if (!supported.has(ch.codePointAt(0)!))
          throw new Error("unsupported_document_character");
      if (!characters.length) lines.push("");
      while (characters.length) {
        let low = 1,
          high = characters.length,
          fit = 0;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          if (
            f.widthOfTextAtSize(characters.slice(0, middle).join(""), size) <=
            width
          ) {
            fit = middle;
            low = middle + 1;
          } else high = middle - 1;
        }
        if (!fit) throw new Error("document_character_too_wide");
        const split = characters.slice(0, fit).lastIndexOf(" ");
        if (fit < characters.length && split > fit / 2) {
          lines.push(characters.splice(0, split).join(""));
          characters.shift();
        } else lines.push(characters.splice(0, fit).join(""));
      }
    }
    return lines;
  }
  let page = pdf.addPage([612, 792]),
    y = 746;
  const addPage = () => {
    if (pdf.getPageCount() >= 100) throw new Error("document_too_long");
    page = pdf.addPage([612, 792]);
    y = 746;
  };
  function text(s: string, size = 10, color = rgb(0.12, 0.2, 0.18)) {
    for (const line of wrap(s, font, size, 516)) {
      if (y < size + 58) addPage();
      page.drawText(line, { x: 48, y, size, font, color });
      y -= size * 1.45;
    }
    y -= 5;
  }
  function rule() {
    if (y < 65) addPage();
    page.drawLine({
      start: { x: 48, y },
      end: { x: 564, y },
      thickness: 0.6,
      color: rgb(0.78, 0.82, 0.8),
    });
    y -= 17;
  }
  if (synthetic)
    text(
      "PRUEBA · DATOS FICTICIOS · SIN VALIDEZ COMERCIAL",
      9,
      rgb(0.55, 0.19, 0.08),
    );
  text(doc.snapshot.company.name, 14);
  text(`${title} ${doc.number}`, 22);
  text(`Revisión conservada: ${doc.record_version} · Moneda: USD`);
  text(
    `Fecha: ${r.estimate_date ?? r.invoice_date} · ${doc.kind === "estimate" ? "Válido hasta" : "Vencimiento"}: ${r.valid_until ?? r.due_date ?? "Sin fecha"}`,
  );
  const states: Record<string, string> = {
    ...estimateStatuses,
    OPEN: "Emitida",
    VOID: "Anulada",
  };
  text(`Estado al generar: ${states[r.status] ?? r.status}`);
  rule();
  text(r.customer_snapshot.full_name, 13);
  text(
    [r.customer_snapshot.email, r.customer_snapshot.phone]
      .filter(Boolean)
      .join(" · "),
  );
  text(
    [
      r.customer_snapshot.address,
      r.customer_snapshot.city,
      r.customer_snapshot.postal_code,
    ]
      .filter(Boolean)
      .join(", "),
  );
  rule();
  r.items.forEach((i, n) => {
    text(`${n + 1}. ${i.name}`, 12);
    if (i.description) text(i.description);
    text(
      `Cantidad: ${i.qty} · ${priceBases[i.base as keyof typeof priceBases] ?? i.base}`,
    );
    if (["linear_ft", "area_ft2", "volume_ft3"].includes(i.base))
      text(
        `Medidas: ${i.length}${i.base !== "linear_ft" ? ` × ${i.width}` : ""}${i.base === "volume_ft3" ? ` × ${i.height}` : ""} ft`,
      );
    text(
      `Precio base: ${i.base === "manual" ? "Manual" : usd(i.unit_price)} · Importe: ${usd(i.line_total)}`,
    );
    rule();
  });
  for (const [label, amount] of [
    ["Subtotal", r.subtotal],
    ["Descuento", r.discount],
    ["Impuestos", r.taxes],
    ["Total", r.total],
  ] as const)
    text(`${label}: ${usd(amount)}`, label === "Total" ? 16 : 11);
  if (
    doc.kind === "invoice" &&
    r.paid_amount !== undefined &&
    r.balance_due !== undefined
  )
    text(
      `Pagado al generar: ${usd(r.paid_amount)} · Saldo al generar: ${usd(r.balance_due)}`,
    );
  if (r.notes) {
    rule();
    text("Notas", 12);
    text(r.notes);
  }
  rule();
  text(
    doc.kind === "estimate"
      ? "Este documento es un estimado. No acredita un pago ni una firma del cliente."
      : "Documento conservado de la factura. Los pagos y el saldo corresponden al momento de generación.",
    9,
  );
  pdf
    .getPages()
    .forEach((p, n) =>
      p.drawText(
        `${title} ${doc.number} · Revisión ${doc.record_version} · ${n + 1} / ${pdf.getPageCount()}`,
        { x: 48, y: 28, size: 8, font, color: rgb(0.4, 0.45, 0.43) },
      ),
    );
  return pdf.save();
}
