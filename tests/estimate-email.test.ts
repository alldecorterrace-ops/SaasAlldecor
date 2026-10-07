import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { storedCommercialDocument } from "../src/lib/commercial-documents";
import { renderCommercialPdf } from "../src/lib/commercial-pdf";
import {
  estimateEmailConfig,
  composeEstimateMail,
  deliverEstimateEmail,
  sendEstimateMail,
  type EstimateEmailConfig,
} from "../src/lib/estimate-email";
import { downloadEstimateEmailCapture } from "../src/lib/estimate-email-download";

const stage = {
  APP_ENVIRONMENT: "staging",
  STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
  NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
  NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
};
const capture: EstimateEmailConfig = {
  mode: "capture",
  from: "notice@saasalldecor.invalid",
  site: stage.NEXT_PUBLIC_SITE_URL,
};
test("estimate delivery is opt-in per production company; staging always captures or refuses configuration", () => {
  const company = randomUUID();
  assert.deepEqual(estimateEmailConfig(stage, company), capture);
  assert.equal(
    estimateEmailConfig({ ...stage, ESTIMATE_MAIL_ENABLED: "true" }, company),
    null,
  );
  assert.equal(estimateEmailConfig({}, company), null);
  const prod = {
    APP_ENVIRONMENT: "production",
    NEXT_PUBLIC_SITE_URL: "https://app.example.test",
    ESTIMATE_MAIL_ENABLED: "true",
    ESTIMATE_MAIL_COMPANY_IDS: company,
    MAIL_FROM_ADDRESS: "notice@example.test",
  };
  assert.equal(estimateEmailConfig(prod, company)?.mode, "send");
  for (const patch of [
    { ESTIMATE_MAIL_ENABLED: "false" },
    { ESTIMATE_MAIL_COMPANY_IDS: randomUUID() },
    { ESTIMATE_MAIL_COMPANY_IDS: `${company},bad` },
    { MAIL_FROM_ADDRESS: "safe@example.test\r\nBcc: bad@example.test" },
  ])
    assert.equal(estimateEmailConfig({ ...prod, ...patch }, company), null);
});

test("estimate mail preserves snapshots, tenant permissions and durable delivery states", async (t) => {
  const { db } = await fullDatabase();
  const company = randomUUID(),
    owner = randomUUID(),
    staff = randomUUID(),
    foreign = randomUUID(),
    customer = randomUUID();
  let uid: string = owner,
    deliveries = 0,
    loseFinish = false;
  const files = new Map<string, Uint8Array>();
  const as = async (id: string) => {
    uid = id;
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const service = {
    auth: {
      getUser: async () => ({ data: { user: { id: uid } }, error: null }),
    },
    rpc: async (name: string, p: Record<string, unknown>) => {
      try {
        const args =
          name === "claim_estimate_email"
            ? [
                p.p_company,
                p.p_estimate,
                p.p_version,
                p.p_document,
                p.p_request,
                p.p_mode,
                p.p_expected_recipient,
              ]
            : [p.p_company, p.p_attempt, p.p_status, p.p_sha256, p.p_bytes];
        assert(
          ["claim_estimate_email", "finish_estimate_email"].includes(name),
        );
        const expression =
          name === "claim_estimate_email"
            ? `${name}($1,$2,$3,$4,$5,$6,$7)`
            : `to_jsonb(${name}($1,$2,$3,$4,$5))`;
        const data = (
          await db.query<{ data: unknown }>(`select ${expression} data`, args)
        ).rows[0].data;
        if (name === "finish_estimate_email" && loseFinish) {
          loseFinish = false;
          throw new Error("lost finish response");
        }
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    from: (table: string) => {
      assert.equal(table, "estimate_email_attempts");
      const where: string[] = [],
        values: unknown[] = [];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          assert(["company_id", "id", "status"].includes(k));
          values.push(v);
          where.push(`${k}=$${values.length}`);
          return q;
        },
        maybeSingle: async () => {
          try {
            return {
              data:
                (
                  await db.query<{ data: unknown }>(
                    `select to_jsonb(a) data from estimate_email_attempts a where ${where.join(" and ")}`,
                    values,
                  )
                ).rows[0]?.data ?? null,
              error: null,
            };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
      return q;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array) => {
          try {
            await db.query(
              "insert into storage.objects(bucket_id,name) values($1,$2)",
              [bucket, path],
            );
            files.set(`${bucket}:${path}`, bytes);
            return { error: null };
          } catch (error) {
            return { error };
          }
        },
        download: async (path: string) => {
          const visible = (
            await db.query(
              "select name from storage.objects where bucket_id=$1 and name=$2",
              [bucket, path],
            )
          ).rows;
          const bytes = files.get(`${bucket}:${path}`);
          return visible.length && bytes
            ? { data: new Blob([Buffer.from(bytes)]), error: null }
            : { data: null, error: new Error("missing file") };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const data = {
    customer_id: customer,
    estimate_date: "2026-10-07",
    valid_until: "2026-11-07",
    status: "PENDIENTE",
    notes: "Synthetic estimate. No sale or payment.",
    discount: "0",
    taxes: "0",
    tax_pct: "0",
    items: [
      {
        ...emptyItem,
        name: "QA Patio Peña",
        description: "Saved customer text <script>unsafe()</script>",
        unit_price: "100.10",
      },
    ],
    commercial_terms: {
      percentages: ["10", "50", "30", "10"],
      conditions: "QA condition & warranty",
      delivery_date: "2026-11-01",
    },
  };
  const create = async () => {
    const id = randomUUID();
    await db.query("select save_estimate($1,$2,0,$3)", [
      company,
      id,
      JSON.stringify(data),
    ]);
    return id;
  };
  const prepare = async (id: string, version = 1) => {
    let d = storedCommercialDocument.parse(
      (
        await db.query<{ d: unknown }>(
          "select to_jsonb(prepare_commercial_document($1,'estimate',$2,$3)) d",
          [company, id, version],
        )
      ).rows[0].d,
    );
    const bytes = await renderCommercialPdf(d, true);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('commercial-pdfs',$1)",
      [`${company}/${d.id}.pdf`],
    );
    files.set(`commercial-pdfs:${company}/${d.id}.pdf`, bytes);
    await db.query("select finish_commercial_document($1,$2,$3,$4)", [
      company,
      d.id,
      createHash("sha256").update(bytes).digest("hex"),
      bytes.length,
    ]);
    d = storedCommercialDocument.parse(
      (
        await db.query<{ d: unknown }>(
          "select to_jsonb(d) d from commercial_documents d where id=$1",
          [d.id],
        )
      ).rows[0].d,
    );
    return d;
  };
  const send = async () => {
    deliveries++;
    return "queued" as const;
  };
  const state = async (id: string) =>
    (
      await db.query<{ status: string; version: number }>(
        "select status,version from estimates where id=$1",
        [id],
      )
    ).rows[0];
  try {
    await db.query(
      "insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",
      [owner, staff],
    );
    await as(owner);
    await db.query(
      "select create_company($1,'Synthetic mail QA'),create_company($2,'Foreign QA')",
      [company, foreign],
    );
    await db.query("select save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "QA Customer Peña",
        email: "estimate-qa@saasalldecor.invalid",
        status: "active",
      }),
    ]);
    const id = await create(),
      doc = await prepare(id),
      request = randomUUID();
    let attempt = "";
    await t.test(
      "private captured MIME attaches the immutable PDF; lost final response never resends",
      async () => {
        loseFinish = true;
        const first = await deliverEstimateEmail(
          service,
          company,
          id,
          1,
          doc.id,
          request,
          capture,
          send,
          "estimate-qa@saasalldecor.invalid",
        );
        assert.equal(first.status, "unknown");
        const replay = await deliverEstimateEmail(
          service,
          company,
          id,
          1,
          doc.id,
          request,
          capture,
          send,
          "estimate-qa@saasalldecor.invalid",
        );
        assert.equal(replay.status, "captured");
        attempt = replay.attemptId!;
        assert.equal(deliveries, 0);
        assert.deepEqual(await state(id), { status: "PENDIENTE", version: 1 });
        assert.equal(
          (await db.query("select id from estimate_email_attempts")).rows
            .length,
          1,
        );
        const response = await downloadEstimateEmailCapture(
          service,
          company,
          attempt,
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control")!, /no-store/);
        const mime = Buffer.from(await response.arrayBuffer()).toString();
        assert.match(mime, /Content-Type: application\/pdf/);
        assert.match(mime, /Content-Disposition: attachment/);
        assert.doesNotMatch(mime, /^Bcc:/im);
        const pdfPart = mime
          .split("Content-Type: application/pdf")[1]
          .split(/\r?\n\r?\n/)[1]
          .split(/\r?\n--/)[0];
        assert.deepEqual(
          Buffer.from(pdfPart.replace(/\s/g, ""), "base64"),
          Buffer.from(files.get(`commercial-pdfs:${company}/${doc.id}.pdf`)!),
        );
      },
    );
    await t.test(
      "content and PDF hashes are validated before delivery; capture cannot invoke MTA",
      async () => {
        const claim = (
          await db.query<{ r: { attempt: unknown } }>(
            "select claim_estimate_email($1,$2,1,$3,$4,'capture') r",
            [company, id, doc.id, randomUUID()],
          )
        ).rows[0].r;
        const bytes = files.get(`commercial-pdfs:${company}/${doc.id}.pdf`)!;
        await assert.rejects(
          composeEstimateMail(
            capture,
            claim.attempt as Parameters<typeof composeEstimateMail>[1],
            doc,
            new Uint8Array(bytes.length),
          ),
          /mail_document_mismatch/,
        );
        const mail = await composeEstimateMail(
          capture,
          claim.attempt as Parameters<typeof composeEstimateMail>[1],
          doc,
          bytes,
        );
        await assert.rejects(
          sendEstimateMail(capture, mail),
          /external_email_disabled/,
        );
      },
    );
    await t.test(
      "recipient changes, stale revisions and foreign records cannot be mailed",
      async () => {
        await assert.rejects(
          db.query("select claim_estimate_email($1,$2,1,$3,$4,'capture',$5)", [
            company,
            id,
            doc.id,
            randomUUID(),
            "changed@saasalldecor.invalid",
          ]),
          /recipient_changed/,
        );
        await assert.rejects(
          db.query("select claim_estimate_email($1,$2,2,$3,$4,'capture')", [
            company,
            id,
            doc.id,
            randomUUID(),
          ]),
          /record_conflict/,
        );
        await assert.rejects(
          db.query("select claim_estimate_email($1,$2,1,$3,$4,'capture')", [
            foreign,
            id,
            doc.id,
            randomUUID(),
          ]),
          /estimate_unavailable/,
        );
      },
    );
    await t.test(
      "pending send blocks edits, queued result versions ENVIADO and keeps its original attachment",
      async () => {
        const next = await create(),
          d = await prepare(next),
          req = randomUUID();
        const claimed = (
          await db.query<{ r: { attempt: { id: string } } }>(
            "select claim_estimate_email($1,$2,1,$3,$4,'send') r",
            [company, next, d.id, req],
          )
        ).rows[0].r;
        assert.deepEqual(await state(next), {
          status: "PENDIENTE_ENVIO",
          version: 2,
        });
        await assert.rejects(
          db.query("select save_estimate($1,$2,2,$3)", [
            company,
            next,
            JSON.stringify(data),
          ]),
          /estimate_mail_pending/,
        );
        await assert.rejects(
          db.query(
            "select approve_estimate($1,$2,2,'2026-10-07','QA','QA approval')",
            [company, next],
          ),
          /invalid_approval/,
        );
        await db.query(
          "select finish_estimate_email($1,$2,'queued',null,null)",
          [company, claimed.attempt.id],
        );
        assert.deepEqual(await state(next), { status: "ENVIADO", version: 3 });
        await db.query(
          "select finish_estimate_email($1,$2,'queued',null,null)",
          [company, claimed.attempt.id],
        );
        assert.equal((await state(next)).version, 3);
        await db.query("select save_estimate($1,$2,3,$3)", [
          company,
          next,
          JSON.stringify({
            ...data,
            status: "ENVIADO",
            notes: "Edited after sent",
          }),
        ]);
        assert.equal((await state(next)).version, 4);
        await db.query(
          "select approve_estimate($1,$2,4,'2026-10-07','QA','QA approval')",
          [company, next],
        );
        assert.equal((await state(next)).status, "APROBADO");
        assert.equal(
          (
            await db.query<{ hash: string }>(
              "select sha256 hash from commercial_documents where id=$1",
              [d.id],
            )
          ).rows[0].hash,
          d.sha256,
        );
      },
    );
    await t.test(
      "failed and uncertain handoffs stay distinct; no automatic retry or fake manual sent state",
      async () => {
        for (const outcome of ["failed", "unknown"] as const) {
          const next = await create(),
            d = await prepare(next);
          const r = await deliverEstimateEmail(
            service,
            company,
            next,
            1,
            d.id,
            randomUUID(),
            { ...capture, mode: "send" },
            async () => outcome,
          );
          assert.equal(r.status, outcome);
          assert.equal(
            (await state(next)).status,
            outcome === "failed" ? "ERROR_ENVIO" : "PENDIENTE_ENVIO",
          );
          await assert.rejects(
            db.query("select finish_estimate_email($1,$2,'queued',null,null)", [
              company,
              r.attemptId,
            ]),
            /immutable_mail_outcome/,
          );
        }
        await assert.rejects(
          db.query("select save_estimate($1,$2,0,$3)", [
            company,
            randomUUID(),
            JSON.stringify({ ...data, status: "ENVIADO" }),
          ]),
          /invalid_estimate_mail_state/,
        );
      },
    );
    await t.test(
      "revocation, read-only role, direct writes and private file isolation are enforced",
      async () => {
        await db.exec("reset role");
        await db.query(
          "insert into memberships(company_id,user_id,email,role,permissions) values($1,$2,'staff@example.test','member',$3)",
          [
            company,
            staff,
            JSON.stringify({ "fin-estimados": ["read"] }),
          ],
        );
        await as(staff);
        assert.equal(
          (await db.query("select id from estimate_email_attempts")).rows
            .length > 0,
          true,
        );
        await assert.rejects(
          db.query("select claim_estimate_email($1,$2,1,$3,$4,'capture')", [
            company,
            id,
            doc.id,
            randomUUID(),
          ]),
          /permission_denied/,
        );
        await assert.rejects(
          db.query(
            "update estimate_email_attempts set status='queued' where id=$1",
            [attempt],
          ),
          /permission denied/,
        );
        assert.equal(
          (await downloadEstimateEmailCapture(service, foreign, attempt))
            .status,
          404,
        );
        await db.exec("reset role");
        await db.query(
          "update memberships set active=false where company_id=$1 and user_id=$2",
          [company, staff],
        );
        await as(staff);
        assert.equal(
          (await db.query("select id from estimate_email_attempts")).rows
            .length,
          0,
        );
        assert.equal(
          (await downloadEstimateEmailCapture(service, company, attempt))
            .status,
          404,
        );
      },
    );
  } finally {
    await db.close();
  }
});
