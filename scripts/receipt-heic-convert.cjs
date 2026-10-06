/* eslint-disable @typescript-eslint/no-require-imports */
const process = require("node:process");
const { Buffer } = require("node:buffer");
const convert = require("heic-convert");
const limit = 8388608;
const chunks = [];
let size = 0;
process.stdin.on("data", (chunk) => {
  size += chunk.length;
  if (size > limit) process.exit(1);
  chunks.push(chunk);
});
process.stdin.on("end", async () => {
  try {
    if (!size) process.exit(1);
    // ADT uses iterator 0 and JPEG quality 88. The original is never written.
    const jpeg = Buffer.from(
      await convert({
        buffer: Buffer.concat(chunks, size),
        format: "JPEG",
        quality: 0.88,
      }),
    );
    if (!jpeg.length || jpeg.length > limit) process.exit(1);
    process.stdout.end(jpeg);
  } catch {
    // Decoder diagnostics must not escape into a receipt history or response.
    process.exit(1);
  }
});
