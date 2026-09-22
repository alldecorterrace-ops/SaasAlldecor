import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAvailability } from "../scripts/check-availability.mjs";

test("availability checks response meaning and exact-origin auth redirects", async () => {
  const request = async (input: URL | string | Request) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/health")
      return new Response('{"status":"ok"}', {
        headers: { "cache-control": "no-store" },
      });
    if (path === "/actualizar-contrasena")
      return new Response(null, {
        status: 307,
        headers: { location: "/login" },
      });
    return new Response(
      path === "/login" ? "Olvidé mi contraseña" : "Solicitar enlace",
    );
  };
  assert.ok(
    (
      await checkAvailability("https://example.test", request as typeof fetch)
    ).every((x) => x.ok),
  );
  assert.ok(
    (
      await checkAvailability(
        "https://example.test",
        async () => new Response("OK"),
      )
    ).every((x) => !x.ok),
  );
});
test("provider errors are sanitized and external redirects fail", async () => {
  const results = await checkAvailability("https://example.test", async () => {
    throw new Error("secret");
  });
  assert.ok(results.every((x) => !x.ok));
  assert.ok(!JSON.stringify(results).includes("secret"));
  const redirects = await checkAvailability(
    "https://example.test",
    async () =>
      new Response(null, {
        status: 307,
        headers: { location: "https://evil.test/login" },
      }),
  );
  assert.equal(redirects[3].ok, false);
  await assert.rejects(checkAvailability("https://user:password@example.test"));
});
