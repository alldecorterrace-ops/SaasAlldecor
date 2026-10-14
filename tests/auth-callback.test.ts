import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import {
  completeAuthCallback,
  emailFlowAuthOptions,
  forwardAuthCallback,
} from "../src/lib/auth-callback";

test("callback rejects malformed/ambiguous links before reading cookies or calling Auth", async () => {
  let calls = 0;
  for (const query of [
    "",
    "code=",
    "code=a&code=b",
    "code=has%20space",
    "code=%00",
    "code=" + "a".repeat(2049),
    "code=example&sb_flow_id=short",
    "code=example&sb_flow_id=valid-flow&sb_flow_id=other-flow",
    "code=example&sb_flow_id=../../cookie",
    "code=example&sb_flow_id=",
  ]) {
    const path = await completeAuthCallback(async () => {
      calls++;
      throw new Error("must not construct Auth");
    }, new URLSearchParams(query));
    assert.equal(new URL(path, "https://app.example.test").pathname, "/login");
  }
  assert.equal(calls, 0);
});

test("callback retains legacy links and restricts all post-login destinations", async () => {
  const auth = {
    async exchangeCodeForSession(code: string, options?: { flowId: string }) {
      assert.equal(code, "synthetic-code");
      assert.equal(options, undefined);
      return {
        data: { session: {}, user: { id: "synthetic-user" } },
        error: null,
      };
    },
  };
  for (const destination of [
    null,
    "https://outside.example",
    "//outside.example",
    "/admin",
    "/actualizar-contrasena?next=//outside.example",
  ])
    assert.equal(
      await completeAuthCallback(
        async () => auth,
        new URLSearchParams({
          code: "synthetic-code",
          ...(destination ? { next: destination } : {}),
        }),
      ),
      "/empresas",
    );
  assert.equal(
    await completeAuthCallback(
      async () => auth,
      new URLSearchParams({
        code: "synthetic-code",
        next: "/actualizar-contrasena",
      }),
    ),
    "/actualizar-contrasena",
  );
});

test("callback provider failures never expose codes, descriptions or private exceptions", async () => {
  for (const failure of [
    { code: "otp_expired" },
    { code: "flow_state_expired" },
    { status: 429 },
    { code: "bad_code_verifier" },
    null,
  ]) {
    const path = await completeAuthCallback(
      async () => ({
        async exchangeCodeForSession() {
          if (!failure) throw new Error("private exception detail");
          return { data: { session: null, user: null }, error: failure };
        },
      }),
      new URLSearchParams({ code: "private-synthetic-code" }),
    );
    assert.ok(path.startsWith("/login?error="));
    assert.doesNotMatch(path, /private|synthetic-code|bad_code_verifier/);
  }
  let calls = 0;
  const path = await completeAuthCallback(
    async () => {
      calls++;
      throw new Error();
    },
    new URLSearchParams({
      error: "raw-private-error",
      error_code: "otp_expired",
      error_description: "private info",
    }),
  );
  assert.match(decodeURIComponent(path), /venció/);
  assert.doesNotMatch(path, /raw-private-error|private.info/);
  assert.equal(calls, 0);
});

test("Site URL forwarding preserves the matching flow and recovery but not other parameters", () => {
  assert.equal(forwardAuthCallback({}), null);
  const path = forwardAuthCallback({
    code: "synthetic-code",
    sb_flow_id: "valid-flow",
    next: "/actualizar-contrasena",
    refresh_token: "must-not-leave",
    error_description: "private",
  })!;
  const url = new URL(path, "https://app.example.test");
  assert.equal(url.pathname, "/auth/callback");
  assert.equal(url.searchParams.get("sb_flow_id"), "valid-flow");
  assert.equal(url.searchParams.get("next"), "/actualizar-contrasena");
  assert.deepEqual([...url.searchParams.keys()].sort(), [
    "code",
    "next",
    "sb_flow_id",
  ]);
  assert.ok(
    forwardAuthCallback({ code: ["a", "b"] })?.startsWith("/login?error="),
  );
  assert.equal(
    new URL(
      forwardAuthCallback({ code: "ok", next: "//outside.example" })!,
      "https://app.example.test",
    ).searchParams.has("next"),
    false,
  );
});

// Real pinned SSR/Auth SDK, synthetic HTTP endpoint and in-memory cookie jar.
// This exercises the verifier selection, encoding, immediate cookie writes and
// returned session; it is not proof of the hosted native Auth service.
function sdkFixture() {
  const cookies = new Map<string, string>();
  const requests: { challenge: string; redirect: URL; code: string }[] = [];
  const syntheticUser = "00000000-0000-4000-8000-000000000014";
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.pathname === "/auth/v1/recover") {
      requests.push({
        challenge: body.code_challenge,
        redirect: new URL(url.searchParams.get("redirect_to")!),
        code: "synthetic-code-" + requests.length,
      });
      return Response.json({});
    }
    assert.equal(url.pathname, "/auth/v1/token");
    assert.equal(url.searchParams.get("grant_type"), "pkce");
    const request = requests.find((item) => item.code === body.auth_code)!;
    const challenge = createHash("sha256")
      .update(body.code_verifier)
      .digest("base64url");
    if (challenge !== request.challenge)
      return Response.json(
        { code: "bad_code_verifier", msg: "synthetic mismatch" },
        { status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" } },
      );
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({
          sub: syntheticUser,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url"),
      "synthetic-test-signature",
    ].join(".");
    return Response.json({
      access_token: token,
      refresh_token: "synthetic-refresh",
      expires_in: 3600,
      token_type: "bearer",
      user: { id: syntheticUser, email: "fixture@saasalldecor.invalid" },
    });
  };
  const client = () =>
    createServerClient(
      "https://auth.example.test",
      "synthetic-publishable-key",
      {
        auth: emailFlowAuthOptions,
        global: { fetch: fetcher },
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll: (values) =>
            values.forEach(({ name, value }) =>
              value ? cookies.set(name, value) : cookies.delete(name),
            ),
        },
      },
    );
  const start = async () => {
    const { error } = await client().auth.resetPasswordForEmail(
      "fixture@saasalldecor.invalid",
      {
        redirectTo:
          "https://staging.example.test/auth/callback?next=%2Factualizar-contrasena",
      },
    );
    assert.equal(error, null);
  };
  return { client, requests, start };
}

test("pinned SDK reproduces a wrong verifier when an older callback loses its flow ID", async () => {
  const fixture = sdkFixture();
  await fixture.start();
  await fixture.start();
  assert.notEqual(fixture.requests[0].challenge, fixture.requests[1].challenge);
  const { error } = await fixture
    .client()
    .auth.exchangeCodeForSession(fixture.requests[0].code);
  assert.equal(error?.code, "bad_code_verifier");
});

test("two pending email flows complete with their own verifier and persisted SSR session", async () => {
  const fixture = sdkFixture();
  await fixture.start();
  await fixture.start();
  assert.notEqual(
    fixture.requests[0].redirect.searchParams.get("sb_flow_id"),
    fixture.requests[1].redirect.searchParams.get("sb_flow_id"),
  );
  for (const request of fixture.requests) {
    request.redirect.searchParams.set("code", request.code);
    const path = await completeAuthCallback(
      async () => fixture.client().auth,
      request.redirect.searchParams,
    );
    assert.equal(path, "/actualizar-contrasena");
    assert.ok((await fixture.client().auth.getSession()).data.session);
  }
});
