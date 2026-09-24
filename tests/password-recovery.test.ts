import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authCallbackPath,
  sendRecoveryRequest,
  saveNewPassword,
} from "../src/lib/password-recovery";

const stagingEnvironment = {
  APP_ENVIRONMENT: "staging",
  STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
  NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
  NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
  STAGING_AUTH_EMAIL_CAPTURE_VERIFIED: "true",
};

test("staging recovery refuses unsafe destinations before calling Auth", async () => {
  let calls = 0;
  const auth = {
    async resetPasswordForEmail() {
      calls++;
      return { error: null };
    },
  };
  for (const email of [
    "owner@example.com",
    "owner@saasalldecor.invalid.example.com",
    "owner@sub.saasalldecor.invalid",
    "x".repeat(65) + "@saasalldecor.invalid",
  ])
    assert.ok(
      (
        await sendRecoveryRequest(
          auth,
          email,
          stagingEnvironment.NEXT_PUBLIC_SITE_URL,
          stagingEnvironment,
        )
      ).error,
    );
  for (const patch of [
    { STAGING_AUTH_EMAIL_CAPTURE_VERIFIED: undefined },
    { STAGING_AUTH_EMAIL_CAPTURE_VERIFIED: "false" },
    { APP_ENVIRONMENT: "stagign" },
    { STAGING_SUPABASE_PROJECT_REF: "loqbmrlkhskqzozknehx" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://loqbmrlkhskqzozknehx.supabase.co" },
    { NEXT_PUBLIC_SITE_URL: "https://app.alldecorpatio.com" },
    { INVITATION_MAIL_ENABLED: "true" },
  ])
    assert.ok(
      (
        await sendRecoveryRequest(
          auth,
          "owner@saasalldecor.invalid",
          stagingEnvironment.NEXT_PUBLIC_SITE_URL,
          { ...stagingEnvironment, ...patch },
        )
      ).error,
    );
  assert.equal(calls, 0);
});

test("verified staging capture allows synthetic recovery without promising an external email", async () => {
  let calls = 0;
  const result = await sendRecoveryRequest(
    {
      async resetPasswordForEmail(email, options) {
        calls++;
        assert.equal(email, "owner@saasalldecor.invalid");
        assert.equal(
          options.redirectTo,
          "https://staging.example.test/auth/callback?next=%2Factualizar-contrasena",
        );
        return { error: null };
      },
    },
    " owner@saasalldecor.invalid ",
    stagingEnvironment.NEXT_PUBLIC_SITE_URL,
    stagingEnvironment,
  );
  assert.equal(calls, 1);
  assert.match(result.success ?? "", /receptor privado/);
  assert.match(result.success ?? "", /No se enviará correo externo/);
});

test("recovery callback accepts only the fixed local password destination", () => {
  assert.equal(
    authCallbackPath("/actualizar-contrasena"),
    "/actualizar-contrasena",
  );
  for (const type of [
    null,
    "signup",
    "https://untrusted.example",
    "//untrusted.example",
    "/actualizar-contrasena?next=https://untrusted.example",
  ])
    assert.equal(authCallbackPath(type), "/empresas");
});

test("recovery validates before sending and hides whether an account exists", async () => {
  let calls = 0;
  const auth = {
    async resetPasswordForEmail(
      email: string,
      options: { redirectTo: string },
    ) {
      calls++;
      assert.equal(email, "owner@example.test");
      assert.equal(
        options.redirectTo,
        "https://app.example.test/auth/callback?next=%2Factualizar-contrasena",
      );
      return { error: null };
    },
  };
  assert.ok(
    (await sendRecoveryRequest(auth, "invalid", "https://app.example.test"))
      .error,
  );
  assert.equal(calls, 0);
  const known = await sendRecoveryRequest(
    auth,
    " owner@example.test ",
    "https://app.example.test",
  );
  const unavailable = await sendRecoveryRequest(
    {
      async resetPasswordForEmail() {
        return { error: { status: 400 } };
      },
    },
    "owner@example.test",
    "https://app.example.test",
  );
  assert.deepEqual(unavailable, known);
  assert.ok(known.success);
  const throttled = await sendRecoveryRequest(
    {
      async resetPasswordForEmail() {
        return { error: { status: 429 } };
      },
    },
    "owner@example.test",
    "https://app.example.test",
  );
  assert.ok(throttled.error);
});

test("password update rejects invalid confirmation and expired sessions before mutating credentials", async () => {
  let updates = 0;
  const password = "synthetic-password-for-test";
  const auth = {
    async getUser() {
      return { data: { user: null }, error: null };
    },
    async updateUser() {
      updates++;
      return { error: null };
    },
  };
  assert.ok(
    (await saveNewPassword(auth, { password: "short", confirmation: "short" }))
      .error,
  );
  assert.ok(
    (
      await saveNewPassword(auth, {
        password,
        confirmation: "different-password",
      })
    ).error,
  );
  assert.ok(
    (await saveNewPassword(auth, { password, confirmation: password })).error,
  );
  assert.equal(updates, 0);
  const active = {
    ...auth,
    async getUser() {
      return { data: { user: { id: "synthetic" } }, error: null };
    },
  };
  assert.ok(
    (await saveNewPassword(active, { password, confirmation: password }))
      .success,
  );
  assert.equal(updates, 1);
  assert.ok(
    (
      await saveNewPassword(
        {
          ...active,
          async updateUser() {
            return { error: new Error("provider details") };
          },
        },
        { password, confirmation: password },
      )
    ).error,
  );
});
