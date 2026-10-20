import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fullDatabase } from "./helpers/full-database";
import {
  webNoticeConfig,
  deliverWebNotice,
  downloadWebNotice,
} from "../src/lib/web-notices";
import {
  webNoticeBody,
  webNoticeEvent,
  composeWebNotice,
  type WebNoticeConfig,
} from "../src/lib/web-notice-template";
const stage = {
  APP_ENVIRONMENT: "staging",
  STAGING_SUPABASE_PROJECT_REF: "a".repeat(20),
  NEXT_PUBLIC_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
  NEXT_PUBLIC_SITE_URL: "https://staging.example.test",
};
const capture: WebNoticeConfig = {
  mode: "capture",
  from: "notice@saasalldecor.invalid",
  site: stage.NEXT_PUBLIC_SITE_URL,
};
test("web notices are opt-in per company and staging rejects live mail/service credentials", () => {
  const co = randomUUID();
  assert.deepEqual(webNoticeConfig(stage, co), capture);
  assert.equal(
    webNoticeConfig({ ...stage, WEB_NOTICE_MAIL_ENABLED: "true" }, co),
    null,
  );
  assert.equal(
    webNoticeConfig(
      { ...stage, WEB_NOTICE_SUPABASE_SERVICE_KEY: "unsafe" },
      co,
    ),
    null,
  );
  assert.equal(webNoticeConfig({}, co), null);
  const prod = {
    APP_ENVIRONMENT: "production",
    NEXT_PUBLIC_SITE_URL: "https://app.example.test",
    WEB_NOTICE_MAIL_ENABLED: "true",
    WEB_NOTICE_MAIL_COMPANY_IDS: co,
    MAIL_FROM_ADDRESS: "notice@example.test",
  };
  assert.equal(webNoticeConfig(prod, co)?.mode, "send");
  for (const patch of [
    { WEB_NOTICE_MAIL_ENABLED: "false" },
    { WEB_NOTICE_MAIL_COMPANY_IDS: randomUUID() },
    { WEB_NOTICE_MAIL_COMPANY_IDS: `${co},invalid` },
    { MAIL_FROM_ADDRESS: "safe@example.test\r\nBcc: bad@example.test" },
  ])
    assert.equal(webNoticeConfig({ ...prod, ...patch }, co), null);
});
test("web notice queue keeps inquiry, delivery and tenant routing distinct", async (t) => {
  const { db } = await fullDatabase(),
    co = randomUUID(),
    owner = randomUUID(),
    member = randomUUID(),
    foreign = randomUUID(),
    form = randomUUID();
  let lostFinish = false,
    handovers = 0;
  const files = new Map<string, Uint8Array>();
  const as = async (id: string, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.query("select set_config('request.jwt.claim.role',$1,false)", [
      role,
    ]);
    await db.exec(`set role ${role}`);
  };
  const data = {
    name: "QA Peña <img src=x onerror=bad()>",
    email: "qa-web@saasalldecor.invalid",
    phone: "000-000-0000",
    service: "Pérgola",
    message: "Saved text <script>bad()</script> & details",
    length: "24",
    width: "6",
    height: "6",
    address: "Synthetic address",
    city: "QA",
    postal_code: "33101",
    contact_preference: "Email",
    appointment_date: "2026-11-01",
  };
  const submit = async () => {
    const id = randomUUID();
    await db.query("select submit_web_request($1,$2,$3)", [
      form,
      id,
      JSON.stringify(data),
    ]);
    return id;
  };
  const events = async (id: string) =>
    (
      await db.query<{ event: unknown }>(
        "select to_jsonb(e) event from web_notice_events e where request_id=$1 order by kind",
        [id],
      )
    ).rows.map((r) => webNoticeEvent.parse(r.event));
  const client = {
    rpc: async (name: string, p: Record<string, unknown>) => {
      try {
        if (name === "finish_web_notice" && lostFinish) {
          lostFinish = false;
          return { data: null, error: new Error("lost finish") };
        }
        const expression =
          name === "claim_web_notice"
            ? "claim_web_notice($1,$2,$3)"
            : "to_jsonb(finish_web_notice($1,$2,$3,$4,$5))";
        const params =
          name === "claim_web_notice"
            ? [p.p_company, p.p_event, p.p_mode]
            : [p.p_company, p.p_event, p.p_status, p.p_sha256, p.p_bytes];
        return {
          data: (
            await db.query<{ v: unknown }>(`select ${expression} v`, params)
          ).rows[0].v,
          error: null,
        };
      } catch (error) {
        return { error, data: null };
      }
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
            : { data: null, error: new Error("missing") };
        },
      }),
    },
    from: () => {
      let company: string, id: string;
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          if (key === "company_id") company = value;
          else id = value;
          return query;
        },
        maybeSingle: async () => ({
          data:
            (
              await db.query<{ v: unknown }>(
                "select to_jsonb(e) v from web_notice_events e where company_id=$1 and id=$2",
                [company, id],
              )
            ).rows[0]?.v ?? null,
          error: null,
        }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  try {
    await db.query(
      "insert into auth.users(id,email) values($1,'owner@example.test'),($2,'member@example.test')",
      [owner, member],
    );
    await db.query(
      "insert into companies(id,name,created_by) values($1,'QA Company',$2)",
      [co, owner],
    );
    await db.query(
      "insert into memberships(company_id,user_id,email,role,permissions) values($1,$2,'owner@example.test','owner','{}'),($1,$3,'member@example.test','member',$4)",
      [co, owner, member, JSON.stringify({ estimadosweb: ["read"] })],
    );
    await as(owner);
    await db.query("select manage_web_form($1,$2,true)", [co, form]);
    let first: string;
    await t.test(
      "completed inquiry creates two atomic notices; replay and archive do not duplicate",
      async () => {
        first = await submit();
        const e = await events(first);
        assert.equal(e.length, 2);
        assert.equal(e[0].status, "pending");
        assert.equal(e[1].status, "blocked");
        await db.query("select submit_web_request($1,$2,$3)", [
          form,
          first,
          JSON.stringify(data),
        ]);
        await db.query("select review_web_request($1,$2,false)", [co, first]);
        assert.equal((await events(first)).length, 2);
        await assert.rejects(
          db.query("select submit_web_request($1,$2,$3)", [
            form,
            first,
            JSON.stringify({ ...data, message: "changed" }),
          ]),
          /request_conflict/,
        );
      },
    );
    await t.test(
      "routing snapshots and explicit blocked recovery preserve captured request data",
      async () => {
        await db.query(
          "select save_web_notice_settings($1,0,'staff-a@saasalldecor.invalid')",
          [co],
        );
        const second = await submit();
        await db.query(
          "select save_web_notice_settings($1,1,'staff-b@saasalldecor.invalid')",
          [co],
        );
        assert.equal(
          (await events(second))[1].recipient,
          "staff-a@saasalldecor.invalid",
        );
        const blocked = (await events(first!))[1];
        await assert.rejects(
          db.query(
            "select assign_blocked_web_notice($1,$2,'staff-a@saasalldecor.invalid')",
            [co, blocked.id],
          ),
          /recipient_changed/,
        );
        assert.equal((await events(first!))[1].status, "blocked");
        await db.query(
          "select assign_blocked_web_notice($1,$2,'staff-b@saasalldecor.invalid')",
          [co, blocked.id],
        );
        const recovered = (await events(first!))[1];
        assert.equal(recovered.recipient, "staff-b@saasalldecor.invalid");
        assert.deepEqual(recovered.snapshot.request, blocked.snapshot.request);
        await assert.rejects(
          db.query(
            "select assign_blocked_web_notice($1,$2,'staff-b@saasalldecor.invalid')",
            [co, blocked.id],
          ),
          /notice_not_blocked/,
        );
        await assert.rejects(
          db.query(
            "select save_web_notice_settings($1,1,'other@saasalldecor.invalid')",
            [co],
          ),
          /record_conflict/,
        );
      },
    );
    await t.test(
      "capture stores independent private MIME for customer and staff, with safe HTML and no attachment",
      async () => {
        const id = await submit();
        for (const e of await events(id)) {
          const r = await deliverWebNotice(
            client,
            co,
            e.id,
            capture,
            async () => {
              handovers++;
              return "queued";
            },
          );
          assert.equal(r.status, "captured");
          const download = await downloadWebNotice(client, co, e.id);
          assert(download);
          const raw = download.bytes.toString("utf8");
          assert(raw.includes("multipart/alternative"));
          assert(!raw.includes("application/pdf"));
          const saved = (await events(id)).find((x) => x.id === e.id)!;
          assert.equal(
            saved.mime_sha256,
            createHash("sha256").update(download.bytes).digest("hex"),
          );
          await deliverWebNotice(client, co, e.id, capture);
          assert.equal((await events(id)).length, 2);
          const composing = { ...saved, status: "processing" as const };
          const mime = await composeWebNotice(capture, composing);
          assert(mime.message.length > 0);
          const body = webNoticeBody(composing, true);
          assert(!body.html.includes("<script>bad()"));
          assert(body.html.includes("&lt;img"));
          if (e.kind === "staff") assert(body.html.includes("&lt;script&gt;"));
          await assert.rejects(
            composeWebNotice(capture, { ...composing, company_id: foreign }),
            /notice_snapshot_mismatch/,
          );
          await assert.rejects(
            composeWebNotice(capture, {
              ...composing,
              recipient: "real@example.test",
            }),
            /notice_snapshot_mismatch|synthetic_recipient_required/,
          );
        }
        assert.equal(handovers, 0);
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from web_requests where id=$1",
              [id],
            )
          ).rows[0].status,
          "NUEVO",
        );
      },
    );
    await t.test(
      "uncertain persisted handoff is never automatically repeated",
      async () => {
        const id = await submit(),
          e = (await events(id))[0];
        lostFinish = true;
        const r = await deliverWebNotice(
          client,
          co,
          e.id,
          { ...capture, mode: "send" },
          async () => {
            handovers++;
            return "queued";
          },
        );
        assert.equal(r.status, "unknown");
        const retry = await deliverWebNotice(
          client,
          co,
          e.id,
          { ...capture, mode: "send" },
          async () => {
            handovers++;
            return "queued";
          },
        );
        assert.equal(retry.status, "processing");
        assert.equal(handovers, 1);
      },
    );
    await t.test(
      "sent, failed and uncertain outcomes are immutable and do not create a sale",
      async () => {
        for (const outcome of ["queued", "failed", "unknown"] as const) {
          const id = await submit(),
            e = (await events(id))[0];
          const r = await deliverWebNotice(
            client,
            co,
            e.id,
            { ...capture, mode: "send" },
            async () => outcome,
          );
          assert.equal(r.status, outcome);
          assert.equal(
            (
              await db.query<{ status: string }>(
                "select status from web_requests where id=$1",
                [id],
              )
            ).rows[0].status,
            "NUEVO",
          );
          await assert.rejects(
            db.query("select finish_web_notice($1,$2,'failed',null,null)", [
              co,
              e.id,
            ]),
            /immutable_notice_outcome/,
          );
        }
        for (const table of ["invoices", "payments", "projects"])
          assert.equal(
            (
              await db.query<{ n: number }>(
                `select count(*)::int n from ${table}`,
              )
            ).rows[0].n,
            0,
          );
      },
    );
    await t.test(
      "anonymous completed submission persists a private queue without exposing recipients",
      async () => {
        await as("", "anon");
        const id = await submit();
        await assert.rejects(
          db.query("select * from web_notice_events"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from web_notice_settings"),
          /permission denied/,
        );
        await as(owner);
        const notice = await events(id);
        assert.equal(notice.length, 2);
        assert.equal(notice[1].recipient, "staff-b@saasalldecor.invalid");
      },
    );
    await t.test(
      "trusted worker claims once and cannot use capture or rewrite a final outcome",
      async () => {
        const id = await submit(),
          e = (await events(id))[0];
        await as("", "service_role");
        await assert.rejects(
          db.query("select claim_web_notice($1,$2,'capture')", [co, e.id]),
          /invalid_notice_mode/,
        );
        const claimed = (
          await db.query<{ v: { claimed: boolean } }>(
            "select claim_web_notice($1,$2,'send') v",
            [co, e.id],
          )
        ).rows[0].v;
        assert.equal(claimed.claimed, true);
        await db.query("select finish_web_notice($1,$2,'queued',null,null)", [
          co,
          e.id,
        ]);
        const replay = (
          await db.query<{ v: { claimed: boolean } }>(
            "select claim_web_notice($1,$2,'send') v",
            [co, e.id],
          )
        ).rows[0].v;
        assert.equal(replay.claimed, false);
        await as(owner);
      },
    );
    await t.test(
      "current ADT lead states, archive/restore and conversion retain one linked customer",
      async () => {
        const lead = (
          await db.query<{ id: string }>(
            "select review_web_request($1,$2,true) id",
            [co, first!],
          )
        ).rows[0].id;
        const payload = {
          full_name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          city: data.city,
          postal_code: data.postal_code,
          service: data.service,
          message: data.message,
          contact_preference: data.contact_preference,
          appointment_date: data.appointment_date,
          lead_date: "2026-10-07",
          source: "Formulario web",
          status: "NUEVO",
          archived: false,
        };
        for (const status of [
          "NUEVO",
          "CONTACTADO",
          "COTIZANDO",
          "GANADO",
          "PERDIDO",
        ]) {
          const old = (
            await db.query<{ version: number }>(
              "select version from leads where id=$1",
              [lead],
            )
          ).rows[0];
          await db.query("select save_lead($1,$2,$3,$4)", [
            co,
            lead,
            old.version,
            JSON.stringify({ ...payload, status }),
          ]);
          assert.equal(
            (
              await db.query<{ status: string }>(
                "select status from leads where id=$1",
                [lead],
              )
            ).rows[0].status,
            status,
          );
        }
        for (const archived of [true, false]) {
          const old = (
            await db.query<{ version: number }>(
              "select version from leads where id=$1",
              [lead],
            )
          ).rows[0];
          await db.query("select save_lead($1,$2,$3,$4)", [
            co,
            lead,
            old.version,
            JSON.stringify({ ...payload, archived }),
          ]);
        }
        const old = (
            await db.query<{ version: number }>(
              "select version from leads where id=$1",
              [lead],
            )
          ).rows[0],
          customer = (
            await db.query<{ id: string }>("select convert_lead($1,$2,$3) id", [
              co,
              lead,
              old.version,
            ])
          ).rows[0].id;
        assert.equal(
          (
            await db.query<{ id: string }>("select convert_lead($1,$2,$3) id", [
              co,
              lead,
              old.version,
            ])
          ).rows[0].id,
          customer,
        );
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from leads where id=$1",
              [lead],
            )
          ).rows[0].status,
          "CLIENTE",
        );
        assert.equal((await events(first!)).length, 2);
      },
    );
    await t.test(
      "read-only, revoked, anonymous and foreign access cannot configure or claim",
      async () => {
        const event = (await events(first!))[0];
        await as(member);
        await assert.rejects(
          db.query(
            "select save_web_notice_settings($1,2,'bad@saasalldecor.invalid')",
            [co],
          ),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select claim_web_notice($1,$2,'capture')", [co, event.id]),
          /permission_denied/,
        );
        assert.equal(await downloadWebNotice(client, foreign, event.id), null);
        await db.exec("reset role");
        await db.query(
          "update memberships set active=false where company_id=$1 and user_id=$2",
          [co, member],
        );
        await as(member);
        assert.equal(
          (await db.query("select id from web_notice_events")).rows.length,
          0,
        );
        await as("", "anon");
        await assert.rejects(
          db.query("select claim_web_notice($1,$2,'capture')", [co, event.id]),
          /permission denied/,
        );
        await as(owner);
        await assert.rejects(
          db.query("select claim_web_notice($1,$2,'capture')", [
            foreign,
            event.id,
          ]),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("update web_notice_events set status='queued'"),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
