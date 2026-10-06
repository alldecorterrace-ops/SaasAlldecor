import { test } from "node:test";
import assert from "node:assert/strict";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import config from "../next.config.mjs";

const response = (path: string) =>
  unstable_getResponseFromNextConfig({
    nextConfig: config,
    url: `https://staging.example.invalid${path}`,
  });

test("private download paths retain no-referrer through the actual Next route matcher", async () => {
  for (const path of [
    "/api/commercial-documents/company/document",
    "/api/commercial-documents/company/document?customer=synthetic",
    "/api/invoice-email/company/attempt",
    "/api/customers/company/customer/documents/attachment",
    "/api/work-documents/company/instalaciones/record/attachment",
    "/api/history-files/company/invoice/record",
    "/api/expenses/company/expense/receipt",
    "/api/expenses/company/batches/batch/receipts/expense",
    "/api/expenses/company/export",
    "/api/workforce/company/expenses/expense/receipt",
  ]) {
    const result = await response(path);
    assert.equal(result.headers.get("Referrer-Policy"), "no-referrer", path);
    assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff", path);
    assert.equal(result.headers.get("X-Frame-Options"), "DENY", path);
  }
});

test("private client access pages retain their existing privacy and indexing contract", async () => {
  for (const path of [
    "/cliente",
    "/cliente?token=synthetic",
    "/acceso",
    "/acceso?token=synthetic",
  ]) {
    const result = await response(path);
    assert.equal(result.headers.get("Referrer-Policy"), "no-referrer", path);
    assert.equal(
      result.headers.get("Cache-Control"),
      "private, no-store",
      path,
    );
    assert.equal(result.headers.get("X-Robots-Tag"), "noindex, nofollow", path);
  }
});

test("ordinary pages and non-document APIs retain the general security policy", async () => {
  for (const path of [
    "/",
    "/login",
    "/empresas",
    "/app/company/horas",
    "/api/health",
    "/api/operations/company",
  ]) {
    const result = await response(path);
    assert.equal(
      result.headers.get("Referrer-Policy"),
      "strict-origin-when-cross-origin",
      path,
    );
    assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff", path);
    assert.equal(result.headers.get("X-Frame-Options"), "DENY", path);
    assert.equal(
      result.headers.get("Permissions-Policy"),
      "camera=(), microphone=(), geolocation=()",
      path,
    );
  }
});
