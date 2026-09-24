import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  backupDigest,
  verifyBackup,
  type BackupManifest,
} from "../../src/lib/backup-verification";
import { storageDownload } from "./storage-snapshot";

const productionProject = "loqbmrlkhskqzozknehx";
const project = z.string().regex(/^[a-z]{20}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const bucketSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string(),
  public: z.literal(false),
  file_size_limit: z.number().int().positive().safe().nullable().optional(),
  allowed_mime_types: z.array(z.string().min(1)).nullable().optional(),
  type: z.literal("STANDARD").optional(),
  versioning_status: z.literal("DISABLED").optional(),
});
const objectSchema = z.object({
  path: z.string().regex(/^storage\/objects\/[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative().safe(),
  sha256: digest,
  source: z.object({
    id: z.string().min(1),
    bucket_id: z.string(),
    name: z.string(),
    metadata: z.object({
      size: z.number().int().nonnegative().safe(),
      mimetype: z.string().regex(/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/),
    }),
  }),
});
export const storageRecoveryConfig = z
  .object({
    directory: z.string().min(1),
    sourceProjectRef: project,
    targetProjectRef: project,
    manifestSha256: digest,
    maxObjectBytes: z
      .number()
      .int()
      .positive()
      .max(256 * 1024 * 1024),
  })
  .strict();
export type StorageRecoveryConfig = z.infer<typeof storageRecoveryConfig>;
type Bucket = z.infer<typeof bucketSchema>;
type ObjectEntry = z.infer<typeof objectSchema>;

/** A reviewed, short-lived attestation is required in addition to the target guard.
 * These assertions do not remotely configure Auth, RLS or scheduled tasks. */
export const storageRecoveryClearance = z
  .object({
    targetProjectRef: project,
    manifestSha256: digest,
    isolationEvidenceSha256: digest,
    applicationStopped: z.literal(true),
    externalEffectsDisabled: z.literal(true),
    accessRestricted: z.literal(true),
    sourceKind: z.enum(["synthetic", "anonymized", "production"]),
    verifiedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
type Clearance = z.infer<typeof storageRecoveryClearance>;
export function validateRecoveryTarget(
  config: StorageRecoveryConfig,
  clearance: Clearance,
  env: Record<string, string | undefined>,
  now = Date.now(),
) {
  storageRecoveryConfig.parse(config);
  storageRecoveryClearance.parse(clearance);
  const from = Date.parse(clearance.verifiedAt),
    to = Date.parse(clearance.expiresAt);
  if (
    config.targetProjectRef === productionProject ||
    config.targetProjectRef === config.sourceProjectRef ||
    env.RECOVERY_ENVIRONMENT !== "isolated" ||
    env.RECOVERY_TARGET_PROJECT_REF !== config.targetProjectRef ||
    clearance.targetProjectRef !== config.targetProjectRef ||
    clearance.manifestSha256 !== config.manifestSha256 ||
    from > now ||
    to <= now ||
    to <= from ||
    to - from > 2 * 3600000
  )
    throw new Error(
      "Destino de recuperación o evidencia de aislamiento inválidos",
    );
}

async function verifiedJson(
  directory: string,
  relative: string,
  sha256: string,
) {
  const root = await realpath(directory),
    file = path.join(root, relative);
  if ((await realpath(file)) !== file || !(await lstat(file)).isFile())
    throw new Error("Archivo de recuperación no regular");
  if ((await lstat(file)).size > 32 * 1024 * 1024)
    throw new Error("Inventario demasiado grande para este recuperador");
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== sha256)
    throw new Error("Inventario modificado o sin huella de confianza");
  return JSON.parse(bytes.toString("utf8"));
}

export async function planStorageRecovery(input: StorageRecoveryConfig) {
  const config = storageRecoveryConfig.parse(input);
  if (
    config.targetProjectRef === config.sourceProjectRef ||
    config.targetProjectRef === productionProject
  )
    throw new Error("La recuperación requiere otro proyecto aislado");
  const manifest: BackupManifest = await verifiedJson(
    config.directory,
    "manifest.json",
    config.manifestSha256,
  );
  await verifyBackup(config.directory, manifest, config.sourceProjectRef);
  const readArtifact = async (name: string) => {
    const artifact = manifest.artifacts.find((x) => x.path === name);
    if (!artifact)
      throw new Error("Falta el inventario requerido para recuperar Storage");
    return verifiedJson(config.directory, name, artifact.sha256);
  };
  const buckets = z
    .array(bucketSchema)
    .parse(await readArtifact("storage/buckets.json"));
  const objects = z
    .array(objectSchema)
    .parse(await readArtifact("storage/manifest.json"));
  const bucketIds = new Set<string>(),
    objectIds = new Set<string>();
  for (const bucket of buckets) {
    if (bucketIds.has(bucket.id) || bucket.name !== bucket.id)
      throw new Error("Bucket duplicado o con nombre no representable");
    bucketIds.add(bucket.id);
  }
  for (const object of objects) {
    storageDownload(object.source, config.sourceProjectRef);
    const identity = object.source.bucket_id + "\0" + object.source.name;
    if (
      !bucketIds.has(object.source.bucket_id) ||
      objectIds.has(identity) ||
      object.bytes !== object.source.metadata.size ||
      object.bytes > config.maxObjectBytes ||
      object.path !==
        `storage/objects/${createHash("sha256").update(identity).digest("hex")}`
    )
      throw new Error("Correspondencia, tamaño o límite de Storage inválido");
    objectIds.add(identity);
  }
  return {
    config,
    buckets,
    objects,
    totalBytes: objects.reduce((sum, x) => sum + x.bytes, 0),
  };
}

/** Only authenticated GET and append-only POST are exposed. No overwrite/delete,
 * public bucket, arbitrary origin or redirect can be requested by a snapshot. */
function recoveryTransport(
  targetRef: string,
  serviceKey: string,
  fetcher: typeof fetch,
) {
  if (!serviceKey || /[\r\n]/.test(serviceKey))
    throw new Error("Falta credencial privada del destino");
  const base = `https://${targetRef}.supabase.co/storage/v1`;
  async function request(endpoint: string, init: RequestInit = {}) {
    try {
      return await fetcher(base + endpoint, {
        ...init,
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          ...init.headers,
        },
        redirect: "error",
        signal: AbortSignal.timeout(300000),
      });
    } catch {
      throw new Error(
        "Respuesta incierta de Storage; conservar el plan y repetir sin sobrescribir",
      );
    }
  }
  async function json(response: Response) {
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        "Storage rechazó la consulta; no se asume que el recurso esté ausente",
      );
    }
    // Error bodies and provider messages are never returned to the operator.
    const bytes = await boundedBody(response, 128 * 1024);
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("Respuesta de inventario de Storage inválida");
    }
  }
  return {
    async bucket(id: string) {
      const response = await request(`/bucket/${encodeURIComponent(id)}`);
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      return bucketSchema.parse(await json(response));
    },
    async createBucket(bucket: Bucket) {
      const response = await request("/bucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bucket.id,
          name: bucket.id,
          public: false,
          file_size_limit: bucket.file_size_limit ?? null,
          allowed_mime_types: bucket.allowed_mime_types ?? null,
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          "Creación de bucket no confirmada; revisar y reintentar",
        );
      }
      await response.body?.cancel();
    },
    async read(object: ObjectEntry) {
      const endpoint = storageDownload(object.source, targetRef).slice(
        base.length,
      );
      const response = await request(endpoint);
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Lectura de objeto no confirmada");
      }
      const mime = response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();
      const bytes = await boundedBody(response, object.bytes);
      return {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        mime,
      };
    },
    async upload(object: ObjectEntry, bytes: Buffer) {
      const endpoint = storageDownload(object.source, targetRef)
        .slice(base.length)
        .replace("/object/authenticated/", "/object/");
      const response = await request(endpoint, {
        method: "POST",
        body: new Uint8Array(bytes),
        headers: {
          "x-upsert": "false",
          "Content-Type": object.source.metadata.mimetype,
          "Cache-Control": "max-age=0",
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          "Escritura no confirmada; repetir el mismo plan sin sobrescribir",
        );
      }
      await response.body?.cancel();
    },
  };
}

async function boundedBody(response: Response, limit: number) {
  if (!response.body) throw new Error("Respuesta de Storage sin cuerpo");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit)
        throw new Error("Storage devolvió más bytes de los esperados");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function sameBucket(actual: Bucket, expected: Bucket) {
  return (
    actual.id === expected.id &&
    actual.name === expected.name &&
    actual.public === false &&
    (actual.file_size_limit ?? null) === (expected.file_size_limit ?? null) &&
    JSON.stringify(
      actual.allowed_mime_types == null
        ? null
        : [...actual.allowed_mime_types].sort(),
    ) ===
      JSON.stringify(
        expected.allowed_mime_types == null
          ? null
          : [...expected.allowed_mime_types].sort(),
      )
  );
}
function sameObject(
  actual: { bytes: number; sha256: string; mime?: string },
  object: ObjectEntry,
) {
  return (
    actual.bytes === object.bytes &&
    actual.sha256 === object.sha256 &&
    actual.mime === object.source.metadata.mimetype.toLowerCase()
  );
}

export async function restoreStorageObjects(
  input: {
    config: StorageRecoveryConfig;
    clearance: Clearance;
    env: Record<string, string | undefined>;
    serviceKey: string;
  },
  fetcher: typeof fetch = fetch,
) {
  validateRecoveryTarget(input.config, input.clearance, input.env);
  // Rebuild from trusted files; never accept a mutable caller-supplied plan.
  const plan = await planStorageRecovery(input.config);
  const transport = recoveryTransport(
    plan.config.targetProjectRef,
    input.serviceKey,
    fetcher,
  );
  const missingBuckets = new Set<string>();
  // Complete read-only preflight before the first mutation. Existing unequal bytes
  // stop the whole run; stale decisions are rechecked before each upload.
  for (const bucket of plan.buckets) {
    const existing = await transport.bucket(bucket.id);
    if (!existing) missingBuckets.add(bucket.id);
    else if (!sameBucket(existing, bucket))
      throw new Error("Configuración de bucket incompatible; no se modifica");
  }
  for (const object of plan.objects) {
    if (missingBuckets.has(object.source.bucket_id)) continue;
    const existing = await transport.read(object);
    if (existing && !sameObject(existing, object))
      throw new Error("Objeto diferente en destino; no se sobrescribe");
  }
  for (const bucket of plan.buckets) {
    validateRecoveryTarget(input.config, input.clearance, input.env);
    if (missingBuckets.has(bucket.id)) await transport.createBucket(bucket);
    const verified = await transport.bucket(bucket.id);
    if (!verified || !sameBucket(verified, bucket))
      throw new Error("Bucket privado no verificado");
  }
  let uploaded = 0,
    reused = 0;
  for (const object of plan.objects) {
    validateRecoveryTarget(input.config, input.clearance, input.env);
    const bucket = plan.buckets.find((b) => b.id === object.source.bucket_id)!;
    const actualBucket = await transport.bucket(bucket.id);
    if (!actualBucket || !sameBucket(actualBucket, bucket))
      throw new Error("El bucket cambió durante la recuperación");
    const existing = await transport.read(object);
    if (existing) {
      if (!sameObject(existing, object))
        throw new Error("Objeto diferente en destino; no se sobrescribe");
      reused++;
    } else {
      const root = await realpath(input.config.directory),
        file = path.join(root, object.path);
      if (
        (await realpath(file)) !== file ||
        !(await lstat(file)).isFile() ||
        (await lstat(file)).size !== object.bytes ||
        (await backupDigest(file)) !== object.sha256
      )
        throw new Error("Archivo local modificado antes de su recuperación");
      const bytes = await readFile(file);
      if (
        bytes.length !== object.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== object.sha256
      )
        throw new Error("Archivo local cambió al leerlo");
      await transport.upload(object, bytes);
      uploaded++;
    }
  }
  // Final readback also covers files reused after a lost response/restart.
  for (const bucket of plan.buckets) {
    const actual = await transport.bucket(bucket.id);
    if (!actual || !sameBucket(actual, bucket))
      throw new Error("Bucket final no verificado");
  }
  for (const object of plan.objects) {
    const actual = await transport.read(object);
    if (!actual || !sameObject(actual, object))
      throw new Error("La lectura final de Storage no coincide");
  }
  return {
    version: 1,
    sourceProjectRef: plan.config.sourceProjectRef,
    targetProjectRef: plan.config.targetProjectRef,
    manifestSha256: plan.config.manifestSha256,
    isolationEvidenceSha256: input.clearance.isolationEvidenceSha256,
    sourceKind: input.clearance.sourceKind,
    completedAt: new Date().toISOString(),
    buckets: plan.buckets.length,
    objects: plan.objects.length,
    bytes: plan.totalBytes,
    uploaded,
    reused,
    storageBytesVerified: true,
    sourceObjectIdsPreserved: false,
    sourceTimestampsPreserved: false,
    customMetadataRestored: false,
    databaseRestored: false,
    authorizationVerified: false,
    applicationRestored: false,
  };
}
