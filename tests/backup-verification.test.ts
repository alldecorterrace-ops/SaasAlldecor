import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  verifyBackup,
  planBackupRetention,
  backupFreshness,
  type BackupManifest,
  type BackupReceipt,
} from "../src/lib/backup-verification";
const project = "a".repeat(20),
  now = Date.parse("2026-09-22T12:00:00Z");
function receipt(id: string, ageHours: number): BackupReceipt {
  return {
    id,
    startedAt: new Date(now - ageHours * 3600000).toISOString(),
    completedAt: new Date(now - ageHours * 3600000 + 60000).toISOString(),
    fullSnapshot: true,
    encrypted: true,
    remoteVerified: true,
  };
}
test("backup requires every component and exact file hashes without claiming recovery", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "saas-backup-"));
  try {
    const names = [
      "database/roles.sql",
      "database/schema.sql",
      "database/data.sql",
      "database/managed-schema.sql",
      "storage/manifest.json",
      "hosting/private-files.tar.gz",
      "hosting/configuration.tar.gz",
    ];
    const manifest: BackupManifest = {
      version: 1,
      projectRef: project,
      startedAt: new Date(now - 60000).toISOString(),
      completedAt: new Date(now).toISOString(),
      fullSnapshot: true,
      artifacts: [],
    };
    for (const name of names) {
      const body = name === "storage/manifest.json" ? "[]" : "synthetic bytes";
      await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await writeFile(path.join(dir, name), body);
      manifest.artifacts.push({
        path: name,
        bytes: Buffer.byteLength(body),
        sha256: createHash("sha256").update(body).digest("hex"),
      });
    }
    const result = await verifyBackup(dir, manifest, project);
    assert.equal(result.localIntegrityVerified, true);
    assert.equal(result.remoteVerified, false);
    assert.equal(result.restoreVerified, false);
    await assert.rejects(verifyBackup(dir, manifest, "b".repeat(20)));
    await assert.rejects(
      verifyBackup(
        dir,
        { ...manifest, artifacts: manifest.artifacts.slice(1) },
        project,
      ),
    );
    await assert.rejects(
      verifyBackup(
        dir,
        {
          ...manifest,
          artifacts: [
            ...manifest.artifacts,
            { ...manifest.artifacts[0], path: "../outside" },
          ],
        },
        project,
      ),
    );
    await writeFile(path.join(dir, "database/data.sql"), "changed");
    await assert.rejects(verifyBackup(dir, manifest, project));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("retention preserves recent full copies and four older weekly recovery points", () => {
  const receipts = Array.from({ length: 43 }, (_, i) =>
    receipt(`day${i}`, i * 24 + 1),
  );
  receipts.push({ ...receipt("not_uploaded", 50 * 24), remoteVerified: false });
  const plan = planBackupRetention(receipts, now);
  for (let i = 0; i < 7; i++) assert.ok(plan.keep.includes(`day${i}`));
  for (const i of [7, 14, 21, 28]) assert.ok(plan.keep.includes(`day${i}`));
  assert.ok(plan.keep.includes("not_uploaded"));
  assert.ok(plan.candidates.includes("day42"));
  assert.equal(plan.automaticDeletion, false);
});
test("invalid or absent verified backups never authorize pruning", () => {
  assert.throws(() => planBackupRetention([], now));
  assert.throws(() =>
    planBackupRetention([{ ...receipt("bad", 1), encrypted: false }], now),
  );
  assert.throws(() =>
    planBackupRetention([receipt("same", 1), receipt("same", 2)], now),
  );
  const old = planBackupRetention([receipt("only", 60 * 24)], now);
  assert.deepEqual(old.keep, ["only"]);
  assert.deepEqual(old.candidates, []);
});
test("freshness uses snapshot start, not a late successful upload", () => {
  assert.equal(backupFreshness([], now).ok, false);
  assert.equal(backupFreshness([receipt("fresh", 1)], now).ok, true);
  assert.equal(
    backupFreshness(
      [
        {
          ...receipt("late", 5),
          completedAt: new Date(now - 60000).toISOString(),
        },
      ],
      now,
    ).ok,
    false,
  );
  assert.equal(
    backupFreshness(
      [{ ...receipt("not_remote", 1), remoteVerified: false }],
      now,
    ).ok,
    false,
  );
  assert.equal(backupFreshness([receipt("future", -2)], now).ok, false);
});
