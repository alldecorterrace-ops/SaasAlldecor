import { test } from "node:test";
import assert from "node:assert/strict";
import { cartographyConfig, cartographyTileUrl } from "../src/lib/cartography";
import { externalEffectsAllowed } from "../src/lib/deployment-environment";
import {
  monitorCartography,
  type CartographyStatus,
} from "../src/lib/cartography-status";

const company = "00000000-0000-4000-8000-000000000001";
const staging = {
  APP_ENVIRONMENT: "staging",
  STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
  NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
  NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
  STAGING_CARTOGRAPHY_TEST_ENABLED: "true",
  STAGING_CARTOGRAPHY_OSM_REVIEWED: "true",
  STAGING_CARTOGRAPHY_TEST_COMPANY: company,
};

test("cartography bench cannot enable general delivery or a second company", () => {
  assert.deepEqual(cartographyConfig(staging, company), {
    provider: "openstreetmap",
    testBank: true,
  });
  assert.equal(externalEffectsAllowed(staging), false);
  assert.deepEqual(
    cartographyConfig(
      staging,
      "00000000-0000-4000-8000-000000000002",
      "unavailable",
    ),
    { provider: "disabled", testBank: false },
  );
  assert.deepEqual(cartographyConfig(staging, company, "unavailable"), {
    provider: "unavailable",
    testBank: true,
  });
});

test("unsafe or incomplete staging configuration never contacts the tile provider", () => {
  for (const patch of [
    { STAGING_CARTOGRAPHY_TEST_ENABLED: "false" },
    { STAGING_CARTOGRAPHY_OSM_REVIEWED: "false" },
    { STAGING_CARTOGRAPHY_TEST_COMPANY: "*" },
    { STAGING_CARTOGRAPHY_TEST_COMPANY: `${company},${company}` },
    { APP_ENVIRONMENT: "stagign" },
    { STAGING_SUPABASE_PROJECT_REF: "loqbmrlkhskqzozknehx" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://loqbmrlkhskqzozknehx.supabase.co" },
    { NEXT_PUBLIC_SITE_URL: "https://app.alldecorpatio.com" },
    { INVITATION_MAIL_ENABLED: "true" },
    { OPENAI_API_KEY: "synthetic" },
  ])
    assert.deepEqual(
      cartographyConfig({ ...staging, ...patch }, company, "unavailable"),
      { provider: "disabled", testBank: false },
    );
  assert.deepEqual(cartographyConfig(staging, "bad"), {
    provider: "disabled",
    testBank: false,
  });
});

test("production ignores the failure selector and preserves its existing provider", () => {
  for (const env of [{}, { ...staging, APP_ENVIRONMENT: "production" }])
    assert.deepEqual(cartographyConfig(env, company, "unavailable"), {
      provider: "openstreetmap",
      testBank: false,
    });
  assert.equal(cartographyTileUrl("disabled"), null);
  assert.equal(
    cartographyTileUrl("openstreetmap"),
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  );
  assert.equal(
    cartographyTileUrl("unavailable"),
    "/cartography-test-unavailable/{z}/{x}/{y}.png",
  );
});

function bench() {
  const states: CartographyStatus[] = [];
  const pending = new Map<number, () => void>();
  let id = 0;
  const monitor = monitorCartography((state) => states.push(state), {
    schedule(action, delay) {
      assert.equal(delay, 15_000);
      pending.set(++id, action);
      return id;
    },
    cancel(timer) {
      pending.delete(timer as number);
    },
  });
  return { monitor, states, pending };
}

test("partial tile errors survive the load event; a new visible batch can recover", () => {
  const b = bench();
  b.monitor.loading();
  b.monitor.tileerror();
  b.monitor.load();
  assert.deepEqual(b.states, ["loading", "unavailable", "unavailable"]);
  assert.equal(b.pending.size, 0);
  b.monitor.loading();
  b.monitor.load();
  assert.deepEqual(b.states.slice(-2), ["loading", "ready"]);
  assert.equal(b.pending.size, 0);
});

test("a stalled provider times out and does not start an automatic retry", () => {
  const b = bench();
  b.monitor.loading();
  const action = [...b.pending.values()][0];
  action();
  assert.deepEqual(b.states, ["loading", "unavailable"]);
  b.monitor.load();
  assert.equal(b.states.at(-1), "ready");
});

test("unmounted maps ignore late errors, loads and timeout callbacks", () => {
  const b = bench();
  b.monitor.loading();
  const action = [...b.pending.values()][0];
  b.monitor.stop();
  b.monitor.loading();
  b.monitor.tileerror();
  b.monitor.load();
  action();
  assert.deepEqual(b.states, ["loading"]);
  assert.equal(b.pending.size, 0);
});
