export function imageFormat(
  bytes: Uint8Array,
): { extension: string; contentType: string } | null {
  if (bytes.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return { extension: "png", contentType: "image/png" };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return { extension: "jpg", contentType: "image/jpeg" };
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return { extension: "webp", contentType: "image/webp" };
  return null;
}
