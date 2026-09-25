import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  geocoderConfig,
  lookupPostalCode,
  parsePostalResponse,
  type GeocoderConfig,
} from "../src/lib/postal-geocoder";
import { SqlitePostalLookupStore } from "../src/lib/postal-geocoder-store";
import { locateMissingPostalCenter } from "../src/lib/locate-postal-center";
import type { ZoneSource } from "../src/lib/zone-analysis";

const config: GeocoderConfig = {
  provider: "nominatim",
  endpoint: "https://geocoder.example.invalid/search",
  userAgent: "SaasAlldecor/1.0 (+https://app.example.invalid)",
  directory: tmpdir(),
};
const staging = {
  APP_ENVIRONMENT: "staging",
  STAGING_SUPABASE_PROJECT_REF: "ejeuxzukutzzlbzjnyio",
  NEXT_PUBLIC_SUPABASE_URL: "https://ejeuxzukutzzlbzjnyio.supabase.co",
  NEXT_PUBLIC_SITE_URL: "https://staging.example.invalid",
};
function stores() {
  const dir = mkdtempSync(join(tmpdir(), "saas-postal-test-"));
  let now = 1_000_000;
  const a = new SqlitePostalLookupStore(dir, () => now),
    b = new SqlitePostalLookupStore(dir, () => now);
  return {
    a,
    b,
    tick: (n: number) => {
      now += n;
    },
    close: () => {
      a.close();
      b.close();
      rmSync(dir, { recursive: true });
    },
  };
}
test("geocoder requires deliberate provider, single host, private path and valid environment", () => {
  const env = {
    APP_ENVIRONMENT: "production",
    ZONE_GEOCODER_PROVIDER: "nominatim",
    ZONE_GEOCODER_SINGLE_HOST: "one-host",
    ZONE_GEOCODER_POLICY_REVIEWED: "true",
    ZONE_GEOCODER_DIRECTORY: tmpdir(),
    ZONE_GEOCODER_ENDPOINT: config.endpoint,
    ZONE_GEOCODER_CONTACT_URL: "https://example.invalid/contact",
  };
  assert.equal(geocoderConfig(env, "one-host").provider, "nominatim");
  assert.equal(geocoderConfig(env, "other-host").provider, "disabled");
  for (const change of [
    { APP_ENVIRONMENT: undefined },
    { ZONE_GEOCODER_DIRECTORY: "relative" },
    { ZONE_GEOCODER_POLICY_REVIEWED: "false" },
    { ZONE_GEOCODER_ENDPOINT: "http://example.invalid" },
    { ZONE_GEOCODER_ENDPOINT: "https://user:secret@example.invalid" },
    { ZONE_GEOCODER_ENDPOINT: "https://example.invalid/?key=x" },
    { ZONE_GEOCODER_CONTACT_URL: "" },
    staging,
  ])
    assert.equal(
      geocoderConfig({ ...env, ...change }, "one-host").provider,
      "disabled",
    );
  assert.equal(
    geocoderConfig({ ...staging, ZONE_GEOCODER_PROVIDER: "synthetic" })
      .provider,
    "synthetic",
  );
  for (const change of [
    { APP_ENVIRONMENT: "production" },
    { APP_ENVIRONMENT: undefined },
    { NEXT_PUBLIC_SUPABASE_URL: "https://loqbmrlkhskqzozknehx.supabase.co" },
  ])
    assert.equal(
      geocoderConfig({
        ...staging,
        ZONE_GEOCODER_PROVIDER: "synthetic",
        ...change,
      }).provider,
      "disabled",
    );
});

test("independent processes contend on one persistent gate without duplicate reservations", async () => {
  const directory = mkdtempSync(join(tmpdir(), "saas-postal-process-"));
  const initial = new SqlitePostalLookupStore(directory);
  initial.close();
  const worker = `import {SqlitePostalLookupStore} from './src/lib/postal-geocoder-store.ts';
    const store=new SqlitePostalLookupStore(process.argv[1]);
    process.stdout.write(JSON.stringify(store.reserve('33101')));store.close();`;
  const run = () =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", worker, directory],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "",
        error = "";
      child.stdout.on("data", (c) => {
        output += c;
      });
      child.stderr.on("data", (c) => {
        error += c;
      });
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code !== 0) reject(new Error(error));
        else {
          try {
            resolve(JSON.parse(output));
          } catch (e) {
            reject(e);
          }
        }
      });
    });
  try {
    const results = await Promise.all([run(), run(), run()]);
    assert.equal(results.filter((r) => "token" in r).length, 1);
    assert.equal(results.filter((r) => "result" in r).length, 2);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
test("synthetic lookup has explicit limited fixtures and zero network requests", async () => {
  const network: typeof fetch = async () => {
    throw new Error("network forbidden");
  };
  assert.deepEqual(
    await lookupPostalCode(
      "33198",
      { provider: "synthetic" },
      undefined,
      network,
    ),
    { status: "found", point: { lat: 25.81, lng: -80.31 } },
  );
  assert.deepEqual(
    await lookupPostalCode(
      "33199",
      { provider: "synthetic" },
      undefined,
      network,
    ),
    { status: "missing" },
  );
  assert.equal(
    (
      await lookupPostalCode(
        "33101",
        { provider: "synthetic" },
        undefined,
        network,
      )
    ).status,
    "unavailable",
  );
  assert.equal(
    (
      await lookupPostalCode(
        "33198",
        { provider: "disabled" },
        undefined,
        network,
      )
    ).status,
    "unavailable",
  );
});
test("public provider response parsing refuses invalid coordinates and preserves first result", () => {
  assert.deepEqual(
    parsePostalResponse([
      { lat: "25.8", lon: "-80.3" },
      { lat: 1, lon: 1 },
    ]),
    { status: "found", point: { lat: 25.8, lng: -80.3 } },
  );
  assert.deepEqual(parsePostalResponse([]), { status: "missing" });
  for (const value of [
    null,
    {},
    [null],
    [{ lat: 91, lon: 1 }],
    [{ lat: 20, lon: -181 }],
    [{ lat: null, lon: 10 }],
    [{ lat: true, lon: 10 }],
    [{ lat: "NaN", lon: 10 }],
    [{ lat: 0, lon: 1 }],
  ])
    assert.equal(parsePostalResponse(value).status, "unavailable");
});
test("global gate serializes workers, enforces spacing and survives restart/cache reuse", async () => {
  const s = stores();
  let calls = 0;
  const request: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(
      url.search,
      "?format=json&limit=1&countrycodes=us&postalcode=33101",
    );
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("User-Agent"),
      config.userAgent,
    );
    assert.ok(init?.signal);
    const other = s.b.reserve("33102");
    assert.ok("result" in other);
    assert.equal(other.result.status, "busy");
    return Response.json([{ lat: 25.8, lon: -80.3 }]);
  };
  try {
    assert.equal(
      (await lookupPostalCode("33101", config, s.a, request)).status,
      "found",
    );
    assert.equal(
      (await lookupPostalCode("33101", config, s.b, request)).status,
      "found",
    );
    assert.equal(calls, 1);
    assert.deepEqual(s.b.reserve("33102"), {
      result: { status: "busy", retryAfterMs: 15_250 },
    });
    s.tick(15_249);
    assert.deepEqual(s.b.reserve("33102"), {
      result: { status: "busy", retryAfterMs: 1 },
    });
    s.tick(1);
    const next = s.b.reserve("33102");
    assert.ok("token" in next);
    assert.equal(s.b.finish("33102", next.token, { status: "missing" }), true);
    assert.deepEqual(s.a.reserve("33102"), { result: { status: "missing" } });
  } finally {
    s.close();
  }
});
test("crashed executor expires conservatively; stale result cannot release or poison a new lease", () => {
  const s = stores();
  try {
    const abandoned = s.a.reserve("33101");
    assert.ok("token" in abandoned);
    s.tick(44_999);
    assert.deepEqual(s.b.reserve("33102"), {
      result: { status: "busy", retryAfterMs: 1 },
    });
    s.tick(1);
    const next = s.b.reserve("33102");
    assert.ok("token" in next);
    assert.equal(
      s.a.finish("33101", abandoned.token, {
        status: "found",
        point: { lat: 25, lng: -80 },
      }),
      false,
    );
    assert.equal("token" in s.a.reserve("33101"), false);
    s.b.finish("33102", next.token, { status: "unavailable" });
    assert.deepEqual(s.a.reserve("33101"), {
      result: { status: "busy", retryAfterMs: 60_000 },
    });
    s.tick(60_000);
    assert.ok("token" in s.a.reserve("33101"));
  } finally {
    s.close();
  }
});
test("errors/oversized responses are not cached as missing and impose a cooldown", async () => {
  for (const request of [
    async () => Response.json({}, { status: 429 }),
    async () => Response.json([{ lat: 95, lon: 80 }]),
    async () => new Response("x".repeat(65_537)),
    async () => {
      throw new Error("timeout/private provider detail");
    },
  ]) {
    const s = stores();
    try {
      assert.deepEqual(await lookupPostalCode("33101", config, s.a, request), {
        status: "unavailable",
      });
      assert.deepEqual(s.b.reserve("33101"), {
        result: { status: "busy", retryAfterMs: 60_000 },
      });
    } finally {
      s.close();
    }
  }
});
test("expired positive/negative cache entries require a fresh globally limited request", () => {
  const s = stores();
  try {
    const found = s.a.reserve("33101");
    assert.ok("token" in found);
    s.a.finish("33101", found.token, {
      status: "found",
      point: { lat: 25, lng: -80 },
    });
    s.tick(15_250);
    const missing = s.a.reserve("33102");
    assert.ok("token" in missing);
    s.a.finish("33102", missing.token, { status: "missing" });
    s.tick(86_400_000);
    assert.deepEqual(s.b.reserve("33101"), {
      result: { status: "found", point: { lat: 25, lng: -80 } },
    });
    assert.ok("token" in s.b.reserve("33102"));
    s.tick(7 * 86_400_000);
    assert.ok("token" in s.b.reserve("33101"));
  } finally {
    s.close();
  }
});
test("lookup authorizes before network, limits to current report and never overwrites a saved center", async () => {
  const source: ZoneSource = {
    customers: [
      {
        external_id: "synthetic",
        full_name: "QA ZIP",
        address: "",
        city: "QA City",
        postal_code: "33198",
        phone: "",
        email: "zip@saasalldecor.invalid",
      },
    ],
    invoices: [],
    webformLeads: [],
    leadStatuses: [],
    postalCenters: [],
  };
  let authorized = false,
    calls = 0,
    saves = 0;
  const deps = {
    source: async () => (authorized ? source : null),
    lookup: async () => {
      calls++;
      return { status: "found" as const, point: { lat: 25.81, lng: -80.31 } };
    },
    save: async (
      zip: string,
      point: { lat: number; lng: number },
      city: string,
    ) => {
      saves++;
      assert.equal(zip, "33198");
      assert.deepEqual(point, { lat: 25.81, lng: -80.31 });
      assert.equal(city, "QA City");
      return "conflict" as const; // Another user saved a manual location during lookup.
    },
  };
  assert.deepEqual(await locateMissingPostalCenter("33198", deps), {
    status: "forbidden",
  });
  assert.equal(calls, 0);
  assert.equal(saves, 0);
  authorized = true;
  assert.deepEqual(await locateMissingPostalCenter("33101", deps), {
    status: "invalid",
  });
  assert.equal(calls, 0);
  assert.deepEqual(await locateMissingPostalCenter("33198", deps), {
    status: "conflict",
  });
  assert.equal(saves, 1);
  source.postalCenters.push({
    zip: "33198",
    lat: 25,
    lng: -80,
    ciudad: "Manual",
  });
  assert.deepEqual(await locateMissingPostalCenter("33198", deps), {
    status: "already_saved",
  });
  assert.equal(calls, 1);
  assert.equal(saves, 1);
});
