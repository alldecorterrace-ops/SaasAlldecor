import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { quantity } from "./inventory";

export type CountSheet = {
  asOf: string;
  rows: {
    sku: string;
    product: string;
    location: string;
    qty: number;
    unit: string;
  }[];
};
function wrap(text: string, width: number, font: PDFFont, size: number) {
  const result: string[] = [];
  let line = "";
  for (const char of Array.from(text.replace(/[\r\n\t]/g, " "))) {
    if (line && font.widthOfTextAtSize(line + char, size) > width) {
      result.push(line);
      line = "";
    }
    line += char;
  }
  result.push(line);
  return result;
}
export async function inventoryCountPdf(
  company: string,
  timezone: string,
  sheet: CountSheet,
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Conteo físico · " + company);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(
      path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"),
    ),
    { subset: true },
  );
  const ink = rgb(0.1, 0.18, 0.25),
    muted = rgb(0.36, 0.43, 0.48),
    rule = rgb(0.78, 0.82, 0.83);
  const cols = [36, 125, 310, 448, 525],
    widths = [82, 176, 130, 71, 52],
    headers = ["SKU", "Variante", "Ubicación", "Sistema", "Contado"];
  const date = new Intl.DateTimeFormat("es-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(sheet.asOf));
  let page = pdf.addPage([612, 792]),
    y = 0;
  const header = () => {
    page.drawText("Conteo físico de inventario", {
      x: 36,
      y: 746,
      font,
      size: 20,
      color: ink,
    });
    const title = wrap(company, 532, font, 11);
    let headY = 722;
    for (const text of title) {
      page.drawText(text, { x: 36, y: headY, font, size: 11, color: ink });
      headY -= 15;
    }
    page.drawText(
      date + " · Anota las unidades contadas en la última columna.",
      { x: 36, y: headY - 2, font, size: 9, color: muted },
    );
    y = headY - 28;
    headers.forEach((h, i) =>
      page.drawText(h, { x: cols[i], y, font, size: 9, color: ink }),
    );
    y -= 8;
    page.drawLine({
      start: { x: 36, y },
      end: { x: 578, y },
      color: ink,
      thickness: 1,
    });
    y -= 14;
  };
  const next = () => {
    page = pdf.addPage([612, 792]);
    header();
  };
  header();
  if (!sheet.rows.length)
    page.drawText("No hay existencias con los filtros seleccionados.", {
      x: 36,
      y,
      font,
      size: 10,
    });
  for (const r of sheet.rows) {
    const fields = [
      r.sku,
      r.product,
      r.location,
      quantity(r.qty) + " " + r.unit.toLowerCase(),
    ];
    const lines = fields.map((s, i) => wrap(s, widths[i], font, 9)),
      rowHeight = Math.max(1, ...lines.map((l) => l.length)) * 12 + 12;
    if (y - rowHeight < 52) next();
    lines.forEach((texts, i) =>
      texts.forEach((s, j) =>
        page.drawText(s, {
          x: cols[i],
          y: y - j * 12,
          font,
          size: 9,
          color: ink,
        }),
      ),
    );
    page.drawLine({
      start: { x: cols[4], y: y - 3 },
      end: { x: 578, y: y - 3 },
      color: muted,
      thickness: 0.6,
    });
    y -= rowHeight;
    page.drawLine({
      start: { x: 36, y: y + 7 },
      end: { x: 578, y: y + 7 },
      color: rule,
      thickness: 0.4,
    });
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Página ${i + 1} de ${pages.length}`, {
      x: 36,
      y: 28,
      font,
      size: 8,
      color: muted,
    }),
  );
  return pdf.save();
}
