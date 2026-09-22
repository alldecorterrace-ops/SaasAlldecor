import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { backupFreshness } from "./backup-verification";

const receipt = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  projectRef: z.string().regex(/^[a-z]{20}$/),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  fullSnapshot: z.literal(true),
  encrypted: z.literal(true),
  remoteVerified: z.literal(true),
  ciphertext: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
  }),
});
export async function backupStatus(
  directory: string,
  projectRef: string,
  now = Date.now(),
) {
  try {
    if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("Project unavailable");
    const names = (await readdir(directory)).filter((x) =>
      /^backup-[A-Za-z0-9_-]+\.json$/.test(x),
    );
    if (names.length > 4096) throw new Error("Receipt inventory needs review");
    const valid = [];
    for (const name of names) {
      const target = path.join(directory, name),
        info = await lstat(target);
      if (!info.isFile() || info.size > 32768)
        throw new Error("Invalid receipt");
      const parsed = receipt.parse(JSON.parse(await readFile(target, "utf8")));
      if (parsed.projectRef !== projectRef) continue;
      if (`${parsed.id}.json` !== name)
        throw new Error("Receipt identity mismatch");
      valid.push(parsed);
    }
    const freshness = backupFreshness(valid, now);
    return { status: freshness.ok ? ("ok" as const) : ("stale" as const) };
  } catch {
    return { status: "unavailable" as const };
  }
}
