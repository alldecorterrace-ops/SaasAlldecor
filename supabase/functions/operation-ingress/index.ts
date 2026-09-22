import { createOperationIngress } from "./handler.ts";

Deno.serve(
  createOperationIngress({
    enabled: Deno.env.get("OPERATION_INGRESS_ENABLED") === "true",
    projectRef: Deno.env.get("INGRESS_PROJECT_REF") ?? "",
    publicKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    siteOrigin: Deno.env.get("INGRESS_SITE_ORIGIN") ?? "",
    environment:
      Deno.env.get("APP_ENVIRONMENT") === "production"
        ? "production"
        : "staging",
  }),
);
