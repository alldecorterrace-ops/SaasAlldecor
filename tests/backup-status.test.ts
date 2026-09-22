import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { backupStatus } from "../src/lib/backup-status";

test("backup monitor rejects stale, wrong-project and malformed receipts without exposing private content", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "saas-backup-status-"));
  const ref = "abcdefghijklmnopqrst",
    now = Date.now(),
    name = path.join(directory, "backup-fixture.json");
  const receipt = {
    version: 1,
    id: "backup-fixture",
    projectRef: ref,
    startedAt: new Date(now - 3600000).toISOString(),
    completedAt: new Date(now - 1800000).toISOString(),
    fullSnapshot: true,
    encrypted: true,
    remoteVerified: true,
    ciphertext: { bytes: 1000, sha256: "a".repeat(64) },
  };
  try {
    assert.deepEqual(await backupStatus(directory, ref, now), {
      status: "stale",
    });
    await writeFile(name, JSON.stringify(receipt));
    assert.deepEqual(await backupStatus(directory, ref, now), { status: "ok" });
    assert.deepEqual(
      await backupStatus(directory, "zyxwvutsrqponmlkjihg", now),
      { status: "stale" },
    );
    assert.deepEqual(await backupStatus(directory, ref, now + 4 * 3600000), {
      status: "stale",
    });
    await writeFile(
      name,
      JSON.stringify({
        ...receipt,
        remoteVerified: false,
        private: "not-for-logs",
      }),
    );
    assert.deepEqual(await backupStatus(directory, ref, now), {
      status: "unavailable",
    });
  } finally {
    await rm(directory, { recursive: true });
  }
});
