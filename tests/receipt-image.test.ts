import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  prepareReceiptImage,
  extractReceiptForReview,
} from "../src/lib/receipt-image";
import { identifyWorkforceReceipt } from "../src/lib/workforce-receipts";

const require = createRequire(import.meta.url);
const jpeg = require("jpeg-js") as {
  decode: (
    data: Buffer,
    options: { useTArray: boolean },
  ) => { width: number; height: number; data: Uint8Array };
};
const fixture = async (name: string) => {
  const data = await readFile(
    new URL("./fixtures/receipt-heic/" + name, import.meta.url),
  );
  return {
    bytes: Uint8Array.from(data).buffer,
    contentType: identifyWorkforceReceipt(data).contentType,
  };
};
const hash = (b: ArrayBuffer) =>
  createHash("sha256").update(Buffer.from(b)).digest("hex");
const extraction = {
  es_recibo: true,
  legible: true,
  comercio: "QA SYNTHETIC",
  direccion_comercio: "",
  fecha: "2026-10-06",
  total: 100.01,
  subtotal: null,
  impuesto: null,
  moneda: "USD",
  numero_factura: "QA-HEIC-20261006",
  metodo_pago: "",
  tarjeta_ult4: "",
};

test("real HEIC and HEIF decode to JPEG with preserved dimensions and original bytes", async () => {
  for (const name of ["single.heic", "generic.heif", "multiple.heic"]) {
    const original = await fixture(name);
    const before = hash(original.bytes);
    const image = await prepareReceiptImage(original);
    assert.equal(image.contentType, "image/jpeg");
    assert.equal(
      identifyWorkforceReceipt(new Uint8Array(image.bytes)).extension,
      "jpg",
    );
    assert.equal(hash(original.bytes), before);
    assert.notEqual(image.bytes, original.bytes);
    const decoded = jpeg.decode(Buffer.from(image.bytes), { useTArray: true });
    assert.equal(decoded.width, 160);
    assert.equal(decoded.height, 120);
    const red = (20 * decoded.width + 20) * 4;
    assert(
      decoded.data[red] > 200 &&
        decoded.data[red + 1] < 50 &&
        decoded.data[red + 2] < 50,
    );
    // Multiple frames must not choose the blue second frame.
    const white = (100 * decoded.width + 140) * 4;
    assert(
      decoded.data[white] > 230 &&
        decoded.data[white + 1] > 230 &&
        decoded.data[white + 2] > 230,
    );
  }
});

test("JPEG, PNG and WebP pass through byte-for-byte; content-type spoofing is rejected", async () => {
  const input = await prepareReceiptImage(await fixture("single.heic"));
  assert.strictEqual((await prepareReceiptImage(input)).bytes, input.bytes);
  const { PNG } = require("pngjs") as {
    PNG: { sync: { write: (image: object) => Buffer } };
  };
  const png = PNG.sync.write({
    width: 1,
    height: 1,
    data: Buffer.from([10, 20, 30, 255]),
  });
  const bytes = Uint8Array.from(png).buffer;
  assert.strictEqual(
    (await prepareReceiptImage({ bytes, contentType: "image/png" })).bytes,
    bytes,
  );
  const webp = Buffer.alloc(30);
  webp.write("RIFF");
  webp.writeUInt32LE(22, 4);
  webp.write("WEBP", 8);
  webp.write("VP8X", 12);
  webp.writeUInt32LE(10, 16);
  const webpBytes = Uint8Array.from(webp).buffer;
  assert.strictEqual(
    (await prepareReceiptImage({ bytes: webpBytes, contentType: "image/webp" }))
      .bytes,
    webpBytes,
  );
  await assert.rejects(
    prepareReceiptImage({ bytes, contentType: "image/heic" }),
    /receipt_mismatch/,
  );
});

test("corrupt HEIC never reaches the provider and a retry with valid pixels can succeed", async () => {
  const corrupt = (await fixture("single.heic")).bytes.slice(0, 40);
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(extraction) }],
        },
      ],
      id: "qa-provider",
    });
  };
  const providers = [
    { name: "openai" as const, key: "qa-private-key", model: "qa-model" },
  ];
  await assert.rejects(
    extractReceiptForReview(
      providers,
      { bytes: corrupt, contentType: "image/heic" },
      request,
    ),
    /heic_conversion_required/,
  );
  assert.equal(calls, 0);
  const result = await extractReceiptForReview(
    providers,
    await fixture("single.heic"),
    request,
  );
  assert.equal(result.data.total, 100.01);
  assert.equal(calls, 1);
});

test("provider receives only the converted JPEG and original HEIC stays unchanged", async () => {
  const file = await fixture("generic.heif");
  const before = hash(file.bytes);
  let calls = 0;
  const request: typeof fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    const imageUrl = body.input[0].content[0].image_url as string;
    assert(imageUrl.startsWith("data:image/jpeg;base64,"));
    const pixels = jpeg.decode(Buffer.from(imageUrl.split(",")[1], "base64"), {
      useTArray: true,
    });
    assert.equal(pixels.width, 160);
    assert.equal(pixels.height, 120);
    assert.equal(body.store, false);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(extraction) }],
        },
      ],
      id: "qa-provider",
    });
  };
  const result = await extractReceiptForReview(
    [{ name: "openai", key: "qa-private-key", model: "qa-model" }],
    file,
    request,
  );
  assert.equal(result.requestId, "qa-provider");
  assert.equal(calls, 1);
  assert.equal(hash(file.bytes), before);
});

test("concurrent conversion is bounded and subsequent conversion is still available", async () => {
  const file = await fixture("single.heic");
  const first = prepareReceiptImage(file);
  await assert.rejects(prepareReceiptImage(file), /review_timeout/);
  assert.equal((await first).contentType, "image/jpeg");
  assert.equal((await prepareReceiptImage(file)).contentType, "image/jpeg");
});

test("conversion rejects bytes beyond the existing receipt size limit", async () => {
  await assert.rejects(
    prepareReceiptImage({
      bytes: new ArrayBuffer(8388609),
      contentType: "image/heic",
    }),
    /invalid_workforce_receipt/,
  );
});
