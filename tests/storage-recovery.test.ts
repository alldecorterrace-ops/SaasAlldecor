import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sealSnapshot } from "../scripts/ops/seal-snapshot";
import { backupDigest } from "../src/lib/backup-verification";
import {
  planStorageRecovery,
  restoreStorageObjects,
  validateRecoveryTarget,
} from "../scripts/ops/storage-recovery";

const source = "a".repeat(20),
  target = "b".repeat(20);
const bucket = {
  id: "work-files",
  name: "work-files",
  public: false as const,
  file_size_limit: 5000000,
  allowed_mime_types: ["application/pdf"],
};
const name = "synthetic-company/record/file #1.pdf";
const bytes = Buffer.from("%PDF-1.4\nSynthetic fixture only\n");
const hash = (body: Buffer | string) =>
  createHash("sha256").update(body).digest("hex");
const objectPath = `storage/objects/${hash(bucket.id + "\0" + name)}`;

async function fixture() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "saas-storage-recovery-"),
  );
  const bodies: Record<string, string | Buffer> = {
    "database/roles.sql": "-- synthetic roles",
    "database/schema.sql": "-- synthetic schema",
    "database/data.sql": "-- synthetic data",
    "database/managed-schema.sql": "-- synthetic reference",
    "hosting/private-files.tar.gz": "synthetic fixture",
    "hosting/configuration.tar.gz": "synthetic fixture",
    "storage/buckets.json": JSON.stringify([bucket]),
    "storage/manifest.json": JSON.stringify([
      {
        path: objectPath,
        bytes: bytes.length,
        sha256: hash(bytes),
        source: {
          id: "synthetic-original-id",
          bucket_id: bucket.id,
          name,
          metadata: {
            size: bytes.length,
            mimetype: "application/pdf",
            eTag: "fixture",
          },
        },
      },
    ]),
    [objectPath]: bytes,
  };
  for (const [relative, body] of Object.entries(bodies)) {
    await mkdir(path.dirname(path.join(directory, relative)), {
      recursive: true,
    });
    await writeFile(path.join(directory, relative), body);
  }
  await sealSnapshot(
    directory,
    source,
    new Date(Date.now() - 1000).toISOString(),
  );
  const config = {
    directory,
    sourceProjectRef: source,
    targetProjectRef: target,
    manifestSha256: await backupDigest(path.join(directory, "manifest.json")),
    maxObjectBytes: 5000000,
  };
  const clearance = {
    targetProjectRef: target,
    manifestSha256: config.manifestSha256,
    isolationEvidenceSha256: "c".repeat(64),
    applicationStopped: true as const,
    externalEffectsDisabled: true as const,
    accessRestricted: true as const,
    sourceKind: "synthetic" as const,
    verifiedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  return {
    config,
    clearance,
    env: {
      RECOVERY_ENVIRONMENT: "isolated",
      RECOVERY_TARGET_PROJECT_REF: target,
    },
    serviceKey: "synthetic-key-no-external-access",
    async dispose() {
      const resolved = await realpath(directory),
        parent = await realpath(tmpdir());
      assert.equal(path.dirname(resolved), parent);
      assert.ok(path.basename(resolved).startsWith("saas-storage-recovery-"));
      await rm(resolved, { recursive: true, force: true });
    },
    async revise(relative: string, body: unknown) {
      const file = path.join(directory, relative);
      await writeFile(file, JSON.stringify(body));
      const manifestFile = path.join(directory, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      const entry = manifest.artifacts.find(
        (x: { path: string }) => x.path === relative,
      );
      entry.sha256 = await backupDigest(file);
      entry.bytes = Buffer.byteLength(JSON.stringify(body));
      await writeFile(manifestFile, JSON.stringify(manifest));
      config.manifestSha256 = await backupDigest(manifestFile);
      clearance.manifestSha256 = config.manifestSha256;
    },
  };
}

function storageMock(
  options: {
    loseUploadResponse?: boolean;
    corruptReadback?: boolean;
    authFailure?: boolean;
  } = {},
) {
  const buckets = new Map<string, Record<string, unknown>>();
  const objects = new Map<string, Buffer>();
  const calls: { path: string; method: string }[] = [];
  const uploadPath = `/storage/v1/object/${bucket.id}/${name.split("/").map(encodeURIComponent).join("/")}`;
  let lost = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)),
      method = init?.method ?? "GET";
    assert.equal(url.origin, `https://${target}.supabase.co`);
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("apikey"),
      "synthetic-key-no-external-access",
    );
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer synthetic-key-no-external-access",
    );
    assert.ok(init?.signal);
    calls.push({ path: url.pathname, method });
    if (options.authFailure)
      return Response.json(
        { message: "private-provider-diagnostic" },
        { status: 403 },
      );
    if (
      url.pathname === `/storage/v1/bucket/${bucket.id}` &&
      method === "GET"
    ) {
      const item = buckets.get(bucket.id);
      return item ? Response.json(item) : new Response(null, { status: 404 });
    }
    if (url.pathname === "/storage/v1/bucket" && method === "POST") {
      const item = JSON.parse(String(init?.body));
      assert.equal(item.public, false);
      if (buckets.has(item.id)) return new Response(null, { status: 409 });
      buckets.set(item.id, item);
      return Response.json({ name: item.id });
    }
    if (url.pathname === uploadPath && method === "POST") {
      assert.equal(new Headers(init?.headers).get("x-upsert"), "false");
      assert.equal(
        new Headers(init?.headers).get("content-type"),
        "application/pdf",
      );
      if (objects.has(name)) return new Response(null, { status: 409 });
      objects.set(name, Buffer.from(init!.body as Uint8Array));
      if (options.loseUploadResponse && !lost) {
        lost = true;
        throw new Error("synthetic response lost");
      }
      return Response.json({
        Id: "new-target-id",
        Key: `${bucket.id}/${name}`,
      });
    }
    if (
      url.pathname ===
        uploadPath.replace("/object/", "/object/authenticated/") &&
      method === "GET"
    ) {
      const item = objects.get(name);
      if (!item) return new Response(null, { status: 404 });
      return new Response(
        new Uint8Array(
          options.corruptReadback ? Buffer.from("bad bytes") : item,
        ),
        {
          headers: { "Content-Type": "application/pdf" },
        },
      );
    }
    throw new Error(`Unexpected synthetic request ${method} ${url.pathname}`);
  };
  return { buckets, objects, calls, fetcher };
}

test("recovery restores private bytes, encoded paths and mime; repeat has no writes", async () => {
  const f = await fixture(),
    remote = storageMock();
  try {
    const receipt = await restoreStorageObjects(f, remote.fetcher);
    assert.equal(receipt.uploaded, 1);
    assert.equal(receipt.storageBytesVerified, true);
    assert.equal(receipt.databaseRestored, false);
    assert.equal(receipt.applicationRestored, false);
    assert.equal(receipt.sourceObjectIdsPreserved, false);
    assert.deepEqual(remote.objects.get(name), bytes);
    remote.calls.length = 0;
    const repeat = await restoreStorageObjects(f, remote.fetcher);
    assert.equal(repeat.uploaded, 0);
    assert.equal(repeat.reused, 1);
    assert.equal(remote.calls.filter((x) => x.method !== "GET").length, 0);
  } finally {
    await f.dispose();
  }
});

test("lost upload response leaves recoverable bytes and retry verifies without duplication", async () => {
  const f = await fixture(),
    remote = storageMock({ loseUploadResponse: true });
  try {
    await assert.rejects(restoreStorageObjects(f, remote.fetcher), /incierta/);
    assert.equal(remote.objects.size, 1);
    const repeat = await restoreStorageObjects(f, remote.fetcher);
    assert.equal(repeat.reused, 1);
    assert.equal(
      remote.calls.filter(
        (x) => x.method === "POST" && x.path.includes("/object/"),
      ).length,
      1,
    );
  } finally {
    await f.dispose();
  }
});

test("existing unequal bytes abort preflight without overwriting or deleting", async () => {
  const f = await fixture(),
    remote = storageMock();
  remote.buckets.set(bucket.id, bucket);
  remote.objects.set(name, Buffer.from("unique existing document"));
  try {
    await assert.rejects(restoreStorageObjects(f, remote.fetcher), /diferente/);
    assert.equal(remote.calls.filter((x) => x.method !== "GET").length, 0);
    assert.equal(
      remote.objects.get(name)?.toString(),
      "unique existing document",
    );
  } finally {
    await f.dispose();
  }
});

test("public or incompatible target buckets are rejected before writing", async () => {
  const f = await fixture();
  try {
    for (const item of [
      { ...bucket, public: true },
      { ...bucket, file_size_limit: 42 },
    ]) {
      const remote = storageMock();
      remote.buckets.set(bucket.id, item);
      await assert.rejects(restoreStorageObjects(f, remote.fetcher));
      assert.equal(remote.calls.filter((x) => x.method !== "GET").length, 0);
    }
  } finally {
    await f.dispose();
  }
});

test("corruption after upload never produces a verified receipt", async () => {
  const f = await fixture(),
    remote = storageMock({ corruptReadback: true });
  try {
    await assert.rejects(
      restoreStorageObjects(f, remote.fetcher),
      /lectura final/,
    );
    assert.equal(remote.objects.size, 1);
  } finally {
    await f.dispose();
  }
});

test("forbidden, missing credentials, production and expired isolation fail closed", async () => {
  const f = await fixture(),
    remote = storageMock({ authFailure: true });
  try {
    await assert.rejects(
      restoreStorageObjects(f, remote.fetcher),
      (error: Error) => {
        assert.ok(!error.message.includes("private-provider-diagnostic"));
        return true;
      },
    );
    assert.equal(remote.calls.filter((x) => x.method !== "GET").length, 0);
    for (const input of [
      { ...f, serviceKey: "" },
      { ...f, env: {} },
      {
        ...f,
        config: { ...f.config, targetProjectRef: "loqbmrlkhskqzozknehx" },
      },
      { ...f, config: { ...f.config, targetProjectRef: source } },
      {
        ...f,
        clearance: {
          ...f.clearance,
          expiresAt: new Date(Date.now() - 100).toISOString(),
        },
      },
      { ...f, clearance: { ...f.clearance, manifestSha256: "0".repeat(64) } },
      {
        ...f,
        clearance: {
          ...f.clearance,
          expiresAt: new Date(Date.now() + 3 * 3600000).toISOString(),
        },
      },
    ]) {
      let contacted = false;
      await assert.rejects(
        restoreStorageObjects(input, async () => {
          contacted = true;
          throw new Error("must not contact");
        }),
      );
      assert.equal(contacted, false);
    }
    assert.doesNotThrow(() =>
      validateRecoveryTarget(f.config, f.clearance, f.env),
    );
  } finally {
    await f.dispose();
  }
});

test("local tampering and untrusted inventory are rejected before contacting destination", async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.config.directory, objectPath), "tampered");
    let contacted = false;
    await assert.rejects(
      restoreStorageObjects(f, async () => {
        contacted = true;
        throw new Error("must not contact");
      }),
    );
    assert.equal(contacted, false);
    await writeFile(path.join(f.config.directory, objectPath), bytes);
    await assert.rejects(
      planStorageRecovery({ ...f.config, manifestSha256: "f".repeat(64) }),
    );
    await assert.rejects(
      planStorageRecovery({ ...f.config, maxObjectBytes: 1 }),
    );
  } finally {
    await f.dispose();
  }
});

test("source public buckets, duplicate identities, unsupported paths and missing buckets stop planning", async () => {
  const f = await fixture();
  try {
    await f.revise("storage/buckets.json", [{ ...bucket, public: true }]);
    await assert.rejects(planStorageRecovery(f.config));
    await f.revise("storage/buckets.json", [bucket, bucket]);
    await assert.rejects(planStorageRecovery(f.config));
    await f.revise("storage/buckets.json", []);
    await assert.rejects(planStorageRecovery(f.config));
    await f.revise("storage/buckets.json", [bucket]);
    const original = JSON.parse(
      await readFile(
        path.join(f.config.directory, "storage/manifest.json"),
        "utf8",
      ),
    );
    for (const badName of [
      "../other",
      "folder/../other",
      "folder\\other",
      "/other",
      "folder//other",
      "other-file",
    ]) {
      await f.revise("storage/manifest.json", [
        { ...original[0], source: { ...original[0].source, name: badName } },
      ]);
      await assert.rejects(planStorageRecovery(f.config));
    }
  } finally {
    await f.dispose();
  }
});

test("another writer between preflight and upload cannot be overwritten", async () => {
  const f = await fixture(),
    remote = storageMock();
  remote.buckets.set(bucket.id, bucket);
  let reads = 0;
  const racing: typeof fetch = async (input, init) => {
    if (String(input).includes("/object/authenticated/") && ++reads === 2)
      remote.objects.set(name, Buffer.from("other writer"));
    return remote.fetcher(input, init);
  };
  try {
    await assert.rejects(restoreStorageObjects(f, racing), /diferente/);
    assert.equal(remote.objects.get(name)?.toString(), "other writer");
    assert.equal(remote.calls.filter((x) => x.method !== "GET").length, 0);
  } finally {
    await f.dispose();
  }
});

test("oversized readback stops without accepting an unbounded response", async () => {
  const f = await fixture(),
    remote = storageMock();
  remote.buckets.set(bucket.id, bucket);
  remote.objects.set(name, Buffer.alloc(bytes.length + 1));
  try {
    await assert.rejects(restoreStorageObjects(f, remote.fetcher), /más bytes/);
    assert.equal(remote.calls.filter((x) => x.method !== "GET").length, 0);
  } finally {
    await f.dispose();
  }
});

test("local changes during remote preflight are detected before uploading", async () => {
  const f = await fixture(),
    remote = storageMock();
  let changed = false;
  const racing: typeof fetch = async (input, init) => {
    if (!changed) {
      changed = true;
      await writeFile(
        path.join(f.config.directory, objectPath),
        "local concurrent edit",
      );
    }
    return remote.fetcher(input, init);
  };
  try {
    await assert.rejects(restoreStorageObjects(f, racing), /local modificado/);
    assert.equal(remote.objects.size, 0);
  } finally {
    await f.dispose();
  }
});
