import { test } from "node:test";
import assert from "node:assert/strict";
import { createHealthCheck } from "../src/lib/health";

test("health coalesces simultaneous probes, caches briefly and reports recovery", async () => {
  let time = 0,
    probes = 0,
    healthy = true;
  const check = createHealthCheck(
    async () => {
      probes++;
      return healthy;
    },
    () => time,
  );
  assert.deepEqual(await Promise.all([check(), check(), check()]), [
    true,
    true,
    true,
  ]);
  assert.equal(probes, 1);
  healthy = false;
  time = 14999;
  assert.equal(await check(), true);
  time = 15000;
  assert.equal(await check(), false);
  assert.equal(probes, 2);
  healthy = true;
  time = 20000;
  assert.equal(await check(), true);
  assert.equal(probes, 3);
});

test("health converts provider failures to unavailable and allows a new probe", async () => {
  let time = 0,
    fail = true;
  const check = createHealthCheck(
    async () => {
      if (fail) throw new Error("provider diagnostics must remain private");
      return true;
    },
    () => time,
  );
  assert.equal(await check(), false);
  time = 5000;
  fail = false;
  assert.equal(await check(), true);
});
