import assert from "node:assert/strict";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
// Read the generated PDF's Unicode maps and text operators, not renderer calls.
export async function printedPages(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((page) => {
    const maps = new Map<string, Map<string, string>>();
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    for (const [name, ref] of fonts.entries()) {
      const font = pdf.context.lookup(ref, PDFDict);
      const stream = font.lookup(PDFName.of("ToUnicode"));
      assert.ok(stream instanceof PDFRawStream);
      const cmap = Buffer.from(decodePDFRawStream(stream).decode()).toString();
      const mapping = new Map<string, string>();
      for (const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
        for (const match of section[1].matchAll(
          /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
        ))
          mapping.set(
            match[1].toUpperCase(),
            (match[2].match(/.{4}/g) ?? [])
              .map((x) => String.fromCharCode(parseInt(x, 16)))
              .join(""),
          );
      maps.set(name.toString(), mapping);
    }
    const contents = page.node.Contents()!;
    const streams =
      contents instanceof PDFArray
        ? Array.from({ length: contents.size() }, (_, i) => contents.lookup(i))
        : [pdf.context.lookup(contents)];
    const drawn: Array<{ text: string; y: number }> = [];
    for (const stream of streams) {
      assert.ok(stream instanceof PDFRawStream);
      const source = Buffer.from(
        decodePDFRawStream(stream).decode(),
      ).toString();
      for (const block of source.matchAll(/BT([\s\S]*?)ET/g)) {
        const font = block[1].match(/(\/[^\s]+) [\d.]+ Tf/),
          pos = block[1].match(/1 0 0 1 [\d.]+ ([\d.]+) Tm/),
          glyphs = block[1].match(/<([0-9A-Fa-f]+)> Tj/);
        if (!font || !pos || !glyphs) continue;
        const map = maps.get(font[1]);
        assert.ok(map, "PDF text has a Unicode mapping");
        const text = (glyphs[1].match(/.{4}/g) ?? [])
          .map((x) => {
            const char = map.get(x.toUpperCase());
            assert.notEqual(char, undefined, "PDF glyph must be readable");
            return char;
          })
          .join("");
        drawn.push({ text, y: Number(pos[1]) });
      }
    }
    return drawn.filter((x) => x.y > 58);
  });
}
