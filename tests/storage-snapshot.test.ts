import { test } from "node:test";
import assert from "node:assert/strict";
import { storageDownload } from "../scripts/ops/storage-snapshot";
test("snapshot downloads remain on the exact project and preserve encoded object names", () => {
  const ref = "abcdefghijklmnopqrst";
  assert.equal(
    storageDownload(
      {
        id: "synthetic",
        bucket_id: "work-files",
        name: "company/record/file #1.pdf",
      },
      ref,
    ),
    `https://${ref}.supabase.co/storage/v1/object/authenticated/work-files/company/record/file%20%231.pdf`,
  );
  for (const name of [
    "../secret",
    "a/../../secret",
    "a\\b",
    "//foreign.example/path",
    "a\nb",
  ])
    assert.throws(() =>
      storageDownload({ id: "synthetic", bucket_id: "work-files", name }, ref),
    );
});
