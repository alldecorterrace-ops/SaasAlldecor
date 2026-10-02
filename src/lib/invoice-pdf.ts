import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import type { StoredCommercialDocument } from "./commercial-documents";
import { usd, paymentMethods, paymentStatuses } from "./finance";
import { priceBases } from "./commercial";
import { paymentStageLabels } from "./payment-terms";
import { appliedPaymentTotal } from "./commercial-documents";

// ADT's invoice structure: company header, billed-to/date blocks, line table,
// notes and totals, applied-payment table and payment instructions. Company
// identity comes exclusively from the captured tenant, never a shared brand.
export function drawInvoicePdf(
  pdf: PDFDocument,
  font: PDFFont,
  doc: StoredCommercialDocument,
  synthetic: boolean,
) {
  const navy = rgb(0.051, 0.165, 0.29),
    gold = rgb(0.67, 0.5, 0.27),
    muted = rgb(0.4, 0.47, 0.54),
    pale = rgb(0.933, 0.953, 0.976),
    border = rgb(0.89, 0.91, 0.93),
    green = rgb(0.12, 0.48, 0.3),
    white = rgb(1, 1, 1);
  const r = doc.snapshot.record,
    width = 516,
    left = 48,
    bottom = 68;
  const supported = new Set(font.getCharacterSet());
  function wrap(value: string, size: number, available: number) {
    const lines: string[] = [];
    const normalized = value
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ");
    for (const paragraph of normalized.split("\n")) {
      const chars = Array.from(paragraph);
      for (const ch of chars)
        if (!supported.has(ch.codePointAt(0)!))
          throw new Error("unsupported_document_character");
      if (!chars.length) lines.push("");
      while (chars.length) {
        let lo = 1,
          hi = chars.length,
          fit = 0;
        while (lo <= hi) {
          const n = Math.floor((lo + hi) / 2);
          if (
            font.widthOfTextAtSize(chars.slice(0, n).join(""), size) <=
            available
          ) {
            fit = n;
            lo = n + 1;
          } else hi = n - 1;
        }
        if (!fit) throw new Error("document_character_too_wide");
        const space = chars.slice(0, fit).lastIndexOf(" ");
        if (fit < chars.length && space > fit / 2) {
          lines.push(chars.splice(0, space).join(""));
          chars.shift();
        } else lines.push(chars.splice(0, fit).join(""));
      }
    }
    return lines;
  }
  function draw(
    value: string,
    x: number,
    y: number,
    size = 10,
    color = navy,
    align: "left" | "right" = "left",
  ) {
    // Validate labels as well as wrapped business text before embedding glyphs.
    for (const ch of Array.from(value))
      if (!supported.has(ch.codePointAt(0)!))
        throw new Error("unsupported_document_character");
    page.drawText(value, {
      x: align === "right" ? x - font.widthOfTextAtSize(value, size) : x,
      y,
      size,
      font,
      color,
    });
  }
  let page!: PDFPage,
    y = 0;
  function next(first = false) {
    if (pdf.getPageCount() >= 100) throw new Error("document_too_long");
    page = pdf.addPage([612, 792]);
    const names = wrap(doc.snapshot.company.name, first ? 17 : 12, 303);
    const numbers = wrap(doc.number, first ? 11 : 9, 158);
    const headerHeight = first
      ? Math.max(98, names.length * 23 + 50, numbers.length * 15 + 66)
      : Math.max(68, names.length * 17 + 36, numbers.length * 13 + 39);
    page.drawRectangle({
      x: 0,
      y: 792 - headerHeight,
      width: 612,
      height: headerHeight,
      color: navy,
    });
    page.drawRectangle({
      x: 0,
      y: 788 - headerHeight,
      width: 612,
      height: 4,
      color: gold,
    });
    names.forEach((line, n) =>
      draw(line, left, 759 - n * (first ? 23 : 17), first ? 17 : 12, white),
    );
    draw(
      first ? "INVOICE / FACTURA" : "FACTURA · CONTINUACIÓN",
      564,
      760,
      first ? 17 : 10,
      white,
      "right",
    );
    numbers.forEach((line, n) =>
      draw(line, 564, 737 - n * 15, first ? 11 : 9, white, "right"),
    );
    if (synthetic)
      draw(
        "PRUEBA · DATOS FICTICIOS · SIN VALIDEZ COMERCIAL",
        left,
        778,
        7,
        white,
      );
    y = 768 - headerHeight;
  }
  function ensure(height: number) {
    if (y - height < bottom) next();
  }
  function paragraph(value: string, size = 9, color = muted) {
    for (const line of wrap(value, size, width)) {
      ensure(size * 1.4);
      draw(line, left, y, size, color);
      y -= size * 1.4;
    }
    y -= 7;
  }
  function section(label: string, firstHeight = 30) {
    ensure(firstHeight + 28);
    page.drawRectangle({ x: left, y: y - 20, width, height: 25, color: pale });
    draw(label, left + 12, y - 11, 10);
    y -= 29;
  }
  function table(
    columns: Array<{ title: string; width: number; right?: boolean }>,
    rows: string[][],
  ) {
    const leading = 13,
      padding = 8,
      size = 9;
    function header() {
      ensure(48);
      page.drawRectangle({
        x: left,
        y: y - 23,
        width,
        height: 26,
        color: navy,
      });
      let x = left;
      for (const c of columns) {
        draw(
          c.title,
          c.right ? x + c.width - padding : x + padding,
          y - 13,
          8,
          white,
          c.right ? "right" : "left",
        );
        x += c.width;
      }
      y -= 26;
    }
    header();
    for (const cells of rows) {
      const lines = cells.map((value, i) =>
        wrap(value, size, columns[i].width - padding * 2),
      );
      const count = Math.max(...lines.map((cell) => cell.length));
      let offset = 0;
      while (offset < count) {
        // Keep ordinary rows together; split exceptionally long rows with a
        // repeated table header and without repeating numeric amounts.
        const required = (count - offset) * leading + padding * 2;
        const maximum = 792 - 92 - bottom - 26;
        if (required <= maximum && y - required < bottom) {
          next();
          header();
        }
        if (y - (padding * 2 + leading) < bottom) {
          next();
          header();
        }
        const chunk = Math.min(
          count - offset,
          Math.floor((y - bottom - padding * 2) / leading),
        );
        const height = chunk * leading + padding * 2;
        let x = left;
        columns.forEach((c, i) => {
          lines[i]
            .slice(offset, offset + chunk)
            .forEach((line, n) =>
              draw(
                line,
                c.right ? x + c.width - padding : x + padding,
                y - padding - size - n * leading,
                size,
                i === 0 ? navy : muted,
                c.right ? "right" : "left",
              ),
            );
          x += c.width;
        });
        page.drawLine({
          start: { x: left, y: y - height },
          end: { x: 564, y: y - height },
          color: border,
          thickness: 0.6,
        });
        y -= height;
        offset += chunk;
      }
    }
    y -= 12;
  }
  next(true);
  const clientLines = [
    r.customer_snapshot.full_name,
    [
      r.customer_snapshot.address,
      r.customer_snapshot.city,
      r.customer_snapshot.postal_code,
    ]
      .filter(Boolean)
      .join(", "),
    [r.customer_snapshot.phone, r.customer_snapshot.email]
      .filter(Boolean)
      .join(" · "),
  ].flatMap((s, i) => wrap(s, i === 0 ? 12 : 9, 290));
  const dateLines = [
    `Fecha: ${r.invoice_date}`,
    `Vence: ${r.due_date ?? "Sin fecha"}`,
    `Estado al generar: ${r.status === "VOID" ? "Anulada" : "Emitida"}`,
    ...(r.payment_status !== undefined
      ? [`Estado de pago al generar: ${paymentStatuses[r.payment_status]}`]
      : []),
  ].flatMap((s) => wrap(s, 8, 181));
  const metaHeight = Math.max(
    clientLines.length * 15 + 34,
    dateLines.length * 13 + 22,
  );
  ensure(metaHeight);
  draw("BILLED TO / CLIENTE", left, y, 9, gold);
  clientLines.forEach((line, n) =>
    draw(line, left, y - 21 - n * 15, n === 0 ? 12 : 9, n === 0 ? navy : muted),
  );
  page.drawRectangle({
    x: 359,
    y: y - metaHeight + 8,
    width: 205,
    height: metaHeight - 3,
    color: pale,
  });
  page.drawRectangle({
    x: 359,
    y: y - metaHeight + 8,
    width: 3,
    height: metaHeight - 3,
    color: gold,
  });
  dateLines.forEach((line, n) => draw(line, 371, y - 12 - n * 13, 8, navy));
  y -= metaHeight + 11;
  table(
    [
      { title: "SERVICE / PRODUCT", width: 350 },
      { title: "QTY", width: 55, right: true },
      { title: "AMOUNT", width: 111, right: true },
    ],
    r.items.map((i) => {
      const measured = ["linear_ft", "area_ft2", "volume_ft3"].includes(i.base);
      const dimensions = measured
        ? `Medidas: ${i.length}${i.base !== "linear_ft" ? ` × ${i.width}` : ""}${i.base === "volume_ft3" ? ` × ${i.height}` : ""} ft`
        : "";
      return [
        [
          i.name,
          i.description,
          dimensions,
          `${priceBases[i.base as keyof typeof priceBases] ?? i.base} · Precio base: ${i.base === "manual" ? "Manual" : usd(i.unit_price)}`,
        ]
          .filter(Boolean)
          .join("\n"),
        String(i.qty),
        usd(i.line_total),
      ];
    }),
  );
  const totals = [
    ["Subtotal", usd(r.subtotal)],
    ["Discount / Descuento", `-${usd(r.discount)}`],
    [
      r.tax_pct === 7 ? "Tax / Impuestos (7%)" : "Tax / Impuestos",
      usd(r.taxes),
    ],
    ["Total", usd(r.total)],
    ...(r.paid_amount !== undefined
      ? [["Paid / Pagado", `-${usd(r.paid_amount)}`]]
      : []),
    ...(r.balance_due !== undefined
      ? [["Balance Due / Saldo", usd(r.balance_due)]]
      : []),
  ];
  const totalHeight = totals.length * 23 + 18;
  ensure(totalHeight);
  const notes = wrap(r.notes || "Thank you for your business.", 9, 254);
  page.drawRectangle({
    x: left,
    y: y - Math.min(totalHeight, 125),
    width: 276,
    height: Math.min(totalHeight, 125),
    color: pale,
  });
  draw("NOTES / NOTAS", left + 12, y - 18, 9, gold);
  const shortNotes = notes.slice(
    0,
    Math.min(6, Math.floor((totalHeight - 34) / 13)),
  );
  shortNotes.forEach((line, n) =>
    draw(line, left + 12, y - 36 - n * 13, 9, muted),
  );
  if (notes.length > shortNotes.length)
    draw(
      "Notas completas al final del documento.",
      left + 12,
      y - 119,
      8,
      muted,
    );
  totals.forEach(([label, value], n) => {
    const grand =
      label.startsWith("Balance") ||
      (label === "Total" && r.balance_due === undefined);
    if (grand)
      page.drawLine({
        start: { x: 344, y: y - n * 23 - 2 },
        end: { x: 564, y: y - n * 23 - 2 },
        color: navy,
        thickness: 1,
      });
    draw(label, 344, y - n * 23 - 18, grand ? 10 : 9, grand ? navy : muted);
    draw(
      value,
      564,
      y - n * 23 - 18,
      Math.min(grand ? 15 : 10, 95 / font.widthOfTextAtSize(value, 1)),
      grand ? gold : label.startsWith("Paid") ? green : navy,
      "right",
    );
  });
  y -= totalHeight + 12;
  if (r.payments !== undefined) {
    section("Pagos y depósitos aplicados", 70);
    if (r.payments.length)
      table(
        [
          { title: "DATE", width: 85 },
          { title: "METHOD / REFERENCE", width: 320 },
          { title: "AMOUNT", width: 111, right: true },
        ],
        r.payments.map((p) => [
          p.payment_date,
          [
            paymentMethods[p.method as keyof typeof paymentMethods] ?? p.method,
            p.reference ? `Referencia: ${p.reference}` : "",
            p.notes,
          ]
            .filter(Boolean)
            .join("\n"),
          usd(p.amount),
        ]),
      );
    else paragraph("Sin pagos aplicados al generar.");
    paragraph(
      `Total de pagos aplicados al generar: ${usd(appliedPaymentTotal(r.payments))}`,
      9,
      green,
    );
    if (r.status === "VOID")
      paragraph(
        "Factura anulada. Pagado y saldo conservan los importes de la factura; los pagos asociados a la anulación no se presentan como aplicados.",
      );
  }
  if (r.commercial_terms) {
    const terms = r.commercial_terms;
    ensure(165);
    section("Calendario de pagos", 135);
    table(
      [
        { title: "ETAPA", width: 350 },
        { title: "%", width: 55, right: true },
        { title: "AMOUNT", width: 111, right: true },
      ],
      paymentStageLabels.map((label, n) => [
        label,
        String(terms.percentages[n]),
        usd(terms.amounts[n]),
      ]),
    );
    paragraph("El calendario no acredita pagos recibidos.", 8);
    if (terms.delivery_date)
      paragraph(`Entrega prevista: ${terms.delivery_date}`);
    if (terms.conditions) {
      section("Condiciones particulares");
      paragraph(terms.conditions);
    }
  }
  if (notes.length > shortNotes.length) {
    section("Notas completas");
    paragraph(r.notes);
  }
  section("PAYMENT METHODS / MÉTODOS DE PAGO");
  paragraph(`Zelle / Wire transfer / Check / Cash. Referencia: ${doc.number}.`);
  paragraph(
    "Documento conservado de la factura. Los pagos y el saldo corresponden al momento de generación.",
    8,
  );
  pdf.getPages().forEach((p, n) => {
    p.drawLine({
      start: { x: left, y: 48 },
      end: { x: 564, y: 48 },
      color: border,
      thickness: 0.6,
    });
    const footer = `Factura ${doc.number} · Revisión ${doc.record_version} · ${n + 1} / ${pdf.getPageCount()}`;
    p.drawText(footer, { x: left, y: 30, size: 8, font, color: muted });
  });
}
