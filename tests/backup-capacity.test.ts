import { test } from "node:test";
import assert from "node:assert/strict";
import { retentionCapacity } from "../scripts/ops/backup-package";
import { backupArtifactPath } from "../src/lib/backup-verification";

test("retention capacity includes all four-hour and weekly copies plus a candidate and margin", () => {
  assert.equal(retentionCapacity(1000, { free: 56400 }).retentionFits, true);
  assert.equal(retentionCapacity(1000, { free: 1000 }).retentionFits, false);
  assert.equal(
    retentionCapacity(1000, { free: 1000 }, 55400).retentionFits,
    true,
  );
  for (const quota of [{}, { free: -1 }, { free: NaN }])
    assert.throws(() => retentionCapacity(1000, quota));
});
test("archive entry paths reject traversal, option injection and listing ambiguity", () => {
  for (const name of [
    "../x",
    "/x",
    "C:/x",
    "a/../x",
    "a\nb",
    "a\tb",
    "--checkpoint-action=exec=x",
    "a/-b",
    "a\\b",
  ])
    assert.throws(() => backupArtifactPath(name));
  assert.equal(
    backupArtifactPath("storage/objects/abc123"),
    "storage/objects/abc123",
  );
});
