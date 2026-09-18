import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authCallbackPath,
  sendRecoveryRequest,
  saveNewPassword,
} from "../src/lib/password-recovery";

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
