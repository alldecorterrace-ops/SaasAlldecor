import { NextResponse } from "next/server";
import {
  requireBilling,
  billingDatabase,
  stripeRequest,
} from "@/lib/subscription-server";
import {
  verifyBillingSignature,
  verifiedBillingSnapshot,
} from "@/lib/subscriptions";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let config: ReturnType<typeof requireBilling>;
  try {
    config = requireBilling();
  } catch {
    return NextResponse.json({ error: "billing_disabled" }, { status: 503 });
  }
  let body: string, hash: string;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 262144)
      throw new Error("payload_too_large");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("body_missing");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        throw new Error("payload_too_large");
      }
      chunks.push(part.value);
    }
    body = Buffer.concat(chunks).toString("utf8");
    hash = verifyBillingSignature(
      body,
      request.headers.get("stripe-signature") ?? "",
      config.webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  try {
    const result = await verifiedBillingSnapshot(body, config, (path) =>
      stripeRequest(config, path),
    );
    if (!result) return NextResponse.json({ received: true });
    const { error } = await billingDatabase(config).rpc(
      "apply_billing_snapshot",
      {
        p_event: result.event,
        p_created: result.created,
        p_hash: hash,
        p_snapshot: result.snapshot,
      },
    );
    if (error) throw new Error("billing_persistence_failed");
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "billing_retry_required" },
      { status: 500 },
    );
  }
}
