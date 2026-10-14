import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authFailureMessage,
  registrationConfirmationMessage,
} from "../src/lib/auth-feedback";
import { invitationRequiredMessage } from "../src/lib/registration";

test("login distinguishes unconfirmed email and throttling without enumerating invalid accounts", () => {
  assert.match(
    authFailureMessage("login", { code: "email_not_confirmed" }),
    /correo aún no está confirmado/,
  );
  for (const error of [
    { status: 429 },
    { code: "over_email_send_rate_limit" },
    { code: "over_request_rate_limit" },
  ])
    assert.match(authFailureMessage("login", error), /demasiados intentos/);
  assert.equal(
    authFailureMessage("login", { code: "invalid_credentials" }),
    authFailureMessage("login", {}),
  );
  assert.match(
    authFailureMessage("login", { name: "AuthRetryableFetchError" }),
    /servicio/,
  );
});

test("registration preserves invitation guards and translates safe provider codes", () => {
  assert.equal(
    authFailureMessage("register", { code: "signup_invitation_required" }),
    invitationRequiredMessage,
  );
  assert.match(
    authFailureMessage("register", { code: "weak_password" }),
    /12 caracteres/,
  );
  assert.match(
    authFailureMessage("register", { code: "signup_disabled" }),
    /temporalmente cerrado/,
  );
  assert.match(authFailureMessage("register", { status: 503 }), /servicio/);
  assert.doesNotMatch(
    authFailureMessage("register", { code: "private-provider-code" }),
    /private-provider/,
  );
});

test("signup feedback describes private staging confirmation instead of claiming external delivery", () => {
  assert.match(registrationConfirmationMessage(true), /receptor privado/);
  assert.match(
    registrationConfirmationMessage(true),
    /No se enviará un correo externo/,
  );
  assert.match(registrationConfirmationMessage(false), /mismo navegador/);
  assert.doesNotMatch(
    registrationConfirmationMessage(false),
    /privado|pruebas/,
  );
});
