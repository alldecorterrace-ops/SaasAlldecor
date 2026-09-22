import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createOperationIngress,
  type IngressConfig,
} from "../supabase/functions/operation-ingress/handler";

const config: IngressConfig = {
  enabled: true,
  projectRef: "abcdefghijklmnopqrst",
  publicKey: "sb_publishable_synthetic",
  siteOrigin: "https://staging.example.test",
  environment: "staging",
};
const company = randomUUID(),
  actor = randomUUID(),
  id = randomUUID();
const input = {
  id,
  action: "customer.save",
  payload: {
    recordId: randomUUID(),
    version: 0,
    data: { full_name: "Synthetic ingress" },
  },
};
const request = (
  body: unknown = input,
  origin = config.siteOrigin,
  method = "POST",
) =>
  new Request(
    `https://${config.projectRef}.supabase.co/functions/v1/operation-ingress/companies/${company}/requests${method === "GET" ? "/" + id : ""}`,
    {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        authorization: "Bearer synthetic.user.signature",
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    },
  );
const user = () =>
  Response.json({ id: actor, email_confirmed_at: new Date().toISOString() });

test("independent ingress remains disabled by default, refuses foreign origins and forbids live staging", async () => {
  const never = async () => {
    throw new Error("network must not be called");
  };
  assert.equal(
    (
      await createOperationIngress(
        { ...config, enabled: false },
        never,
      )(request())
    ).status,
    503,
  );
  assert.equal(
    (
      await createOperationIngress(
        config,
        never,
      )(request(input, "https://foreign.test"))
    ).status,
    403,
  );
  assert.equal(
    (
      await createOperationIngress(
        { ...config, projectRef: "loqbmrlkhskqzozknehx" },
        never,
      )(request())
    ).status,
    503,
  );
  assert.equal(
    (
      await createOperationIngress(
        { ...config, publicKey: "sb_secret_forbidden" },
        never,
      )(request())
    ).status,
    503,
  );
  assert.equal(
    (
      await createOperationIngress(
        config,
        never,
      )(request(undefined, config.siteOrigin, "OPTIONS"))
    ).status,
    204,
  );
});

test("identity is checked before a write and only the user's JWT reaches SQL", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) return user();
    assert.equal(
      init?.headers && new Headers(init.headers).get("authorization"),
      "Bearer synthetic.user.signature",
    );
    const args = JSON.parse(String(init?.body));
    assert.deepEqual(args, {
      p_company: company,
      p_request: id,
      p_action: input.action,
      p_payload: input.payload,
    });
    return Response.json({
      id,
      status: "queued",
      replayed: false,
      payload: "private",
      claimToken: "secret",
    });
  };
  const handler = createOperationIngress(config, api);
  const response = await handler(request());
  assert.equal(response.status, 202);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    config.siteOrigin,
  );
  assert.deepEqual(await response.json(), {
    id,
    status: "queued",
    replayed: false,
  });
  assert.equal(calls.length, 2);
  assert.equal(
    (await handler(request({ ...input, actorId: randomUUID() }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ ...input, payload: { text: "x".repeat(40000) } })))
      .status,
    400,
  );
});

test("lost response returns uncertainty and retry preserves request identity", async () => {
  const receipts = new Map<string, unknown>();
  let lose = true;
  const handler = createOperationIngress(config, async (url, init) => {
    if (String(url).endsWith("/auth/v1/user")) return user();
    const body = JSON.parse(String(init?.body)),
      prior = receipts.has(body.p_request);
    receipts.set(body.p_request, body.p_payload);
    if (lose) {
      lose = false;
      throw new Error("Simulated response lost after commit");
    }
    return Response.json({
      id: body.p_request,
      status: "queued",
      replayed: prior,
    });
  });
  assert.equal((await handler(request())).status, 503);
  const retry = await handler(request());
  assert.equal(retry.status, 202);
  assert.equal((await retry.json()).replayed, true);
  assert.equal(receipts.size, 1);
});

test("revoked identity, SQL authorization and status privacy fail safely", async () => {
  assert.equal(
    (
      await createOperationIngress(
        config,
        async () => new Response(null, { status: 401 }),
      )(request())
    ).status,
    401,
  );
  const forbidden = createOperationIngress(config, async (url) =>
    String(url).endsWith("/auth/v1/user")
      ? user()
      : Response.json(
          { code: "42501", detail: "private detail" },
          { status: 403 },
        ),
  );
  const denied = await forbidden(request());
  assert.equal(denied.status, 403);
  assert.equal((await denied.text()).includes("private detail"), false);
  const status = createOperationIngress(config, async (url) =>
    String(url).endsWith("/auth/v1/user")
      ? user()
      : Response.json({
          id,
          status: "review",
          resultCode: "outcome_unknown",
          payload: "private",
          claimToken: "private",
        }),
  );
  assert.deepEqual(
    await (await status(request(undefined, config.siteOrigin, "GET"))).json(),
    { id, status: "review", resultCode: "outcome_unknown" },
  );
});
