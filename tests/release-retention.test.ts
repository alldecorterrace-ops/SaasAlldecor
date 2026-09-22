import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planReleaseRetention,
  type RetentionInventory,
} from "../src/lib/release-retention";

function inventory(): RetentionInventory {
  return {
    root: "/srv/releases",
    active: "active",
    rollback: "previous",
    rollbackVerified: true,
    processRoots: ["/srv/releases/active"],
    releases: ["active", "previous", "dependencies", "old"].map((name) => ({
      name,
      realPath: `/srv/releases/${name}`,
      commit: "a".repeat(40),
      published: true,
      sourceVerified: true,
      uniqueData: false,
      bytes: 100,
      entries: 4,
      dependencies: name === "active" ? ["dependencies"] : [],
    })),
  };
}
test("retention preserves active, rollback and transitive shared dependencies", () => {
  const i = inventory();
  i.releases[2].dependencies = ["previous"];
  const plan = planReleaseRetention(i);
  assert.deepEqual(plan.candidates, ["old"]);
  assert.equal(plan.reclaimableBytes, 100);
  assert.equal(plan.reclaimableEntries, 4);
});
test("a running old release is never removable", () => {
  const i = inventory();
  i.processRoots.push("/srv/releases/old/.next/server");
  assert.deepEqual(planReleaseRetention(i).candidates, []);
});
test("unverified code and unique files are kept with their dependencies", () => {
  for (const property of [
    "published",
    "sourceVerified",
    "uniqueData",
  ] as const) {
    const i = inventory();
    i.releases[1].dependencies = [];
    i.releases[3][property] = property === "uniqueData";
    i.releases[3].dependencies = ["dependencies"];
    assert.deepEqual(planReleaseRetention(i).candidates, []);
    assert.equal(planReleaseRetention(i).review.length, 1);
  }
});
test("unknown process, dependency and noncanonical paths block the whole plan", () => {
  const mutations = [
    (i: RetentionInventory) => i.processRoots.push("/srv/other"),
    (i: RetentionInventory) => i.releases[3].dependencies.push("outside"),
    (i: RetentionInventory) => {
      i.releases[3].realPath = "/srv/private";
    },
    (i: RetentionInventory) => {
      i.releases[3].name = "../private";
    },
    (i: RetentionInventory) => {
      i.rollbackVerified = false;
    },
  ];
  for (const mutate of mutations) {
    const i = inventory();
    mutate(i);
    assert.throws(() => planReleaseRetention(i));
  }
});
test("dependency cycles terminate and missing rollback blocks cleanup", () => {
  const i = inventory();
  i.releases[2].dependencies = ["active"];
  assert.deepEqual(planReleaseRetention(i).candidates, ["old"]);
  i.rollback = "missing";
  assert.throws(() => planReleaseRetention(i));
});
