import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccess, modules, type Membership } from "../src/lib/modules";
import { customerSchema } from "../src/lib/validation";
const member: Membership = {
  company_id: "a",
  user_id: "u",
  email: "test@example.test",
  role: "member",
  active: true,
  permissions: { clientes: ["write"] },
};
test("write includes read and does not grant other modules", () => {
  assert.equal(canAccess(member, "clientes", "read"), true);
  assert.equal(canAccess(member, "clientes", "write"), true);
  assert.equal(canAccess(member, "config", "write"), false);
});
test("suspended owner receives no access", () => {
  assert.equal(
    canAccess({ ...member, role: "owner", active: false }, "clientes"),
    false,
  );
});
test("module catalog is complete and has distinct identifiers", () => {
  assert.equal(modules.length, 23);
  assert.equal(new Set(modules.map((m) => m.id)).size, 23);
});
test("customer validation rejects invalid dates and preserves Unicode and notes", () => {
  const base = {
    full_name: "José Álvarez",
    email: "",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    service: "",
    client_date: "2026-09-17",
    notes: "Línea uno\nLínea dos",
    status: "active",
  };
  assert.equal(
    customerSchema.safeParse({ ...base, client_date: "2026-02-30" }).success,
    false,
  );
  assert.deepEqual(customerSchema.parse(base), base);
});
