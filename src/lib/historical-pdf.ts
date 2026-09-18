import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
export async function readHistoricalPdf(
  root: string,
  sha256: string,
  bytes: number,
) {
  if (
    !path.isAbsolute(root) ||
    !/^[0-9a-f]{64}$/.test(sha256) ||
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > 20 * 1024 * 1024
  )
    throw new Error("historical_file_unavailable");
  const directory = await realpath(root),
    file = await realpath(path.join(directory, `${sha256}.pdf`));
  if (path.dirname(file) !== directory)
    throw new Error("historical_file_unavailable");
  const info = await stat(file);
  if (!info.isFile() || info.size !== bytes)
    throw new Error("historical_file_unavailable");
  const data = await readFile(file);
  if (
    !data.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    data.length !== bytes ||
    createHash("sha256").update(data).digest("hex") !== sha256
  )
    throw new Error("historical_file_unavailable");
  return data;
}
