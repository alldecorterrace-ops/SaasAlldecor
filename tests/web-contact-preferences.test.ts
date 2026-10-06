import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";

test("web contact details survive validation, review and lead conversion", async (t) => {
  const { db } = await fullDatabase();
  const owner = id(),
    reader = id(),
    company = id(),
    foreign = id(),
    form = id();
  const base = {
    name: "Synthetic contact",
    email: "web@saasalldecor.invalid",
    phone: "",
    message: "Synthetic only",
    service: "Pérgola",
    length: "0",
    width: "0",
    height: "0",
  };
  const as = async (user: string | null) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user ?? "",
    ]);
    await db.exec(user ? "set role authenticated" : "set role anon");
  };
  const submit = async (
    request: string,
    data: Record<string, unknown>,
    target = form,
  ) =>
    (
      await db.query<{ v: string }>("select submit_web_request($1,$2,$3) v", [
        target,
        request,
        JSON.stringify(data),
      ])
    ).rows[0].v;
  const requestRow = async (request: string) =>
    (
      await db.query<{ data: Record<string, unknown>; status: string }>(
        "select data,status from web_requests where id=$1",
        [request],
      )
    ).rows[0];
  try {
    await db.query(
      "insert into auth.users values($1,'web-owner@saasalldecor.invalid',now()),($2,'web-reader@saasalldecor.invalid',now())",
      [owner, reader],
    );
    await as(owner);
    for (const target of [company, foreign])
      await db.query("select create_company($1,'Synthetic web company')", [
        target,
      ]);
    await db.query("select manage_web_form($1,$2,true)", [company, form]);
    await db.query(
      "select add_company_member($1,'web-reader@saasalldecor.invalid')",
      [company],
    );
    await db.query("select set_member_access($1,$2,'member',true,$3)", [
      company,
      reader,
      JSON.stringify({ estimadosweb: ["write"] }),
    ]);

    await t.test(
      "legacy payloads and blank optional values remain idempotent; foreign attributes are ignored",
      async () => {
        const request = id();
        await as(null);
        assert.equal(await submit(request, base), request);
        assert.equal(
          await submit(request, {
            ...base,
            contact_preference: "  ",
            appointment_date: null,
            company_id: foreign,
            lead_id: id(),
            status: "CONVERTIDO",
          }),
          request,
        );
        await as(owner);
        assert.deepEqual((await requestRow(request)).data, base);
        assert.equal((await requestRow(request)).status, "NUEVO");
      },
    );
    await t.test(
      "nonblank fields survive archive, lead conversion and retries",
      async () => {
        const request = id();
        await as(null);
        await submit(request, {
          ...base,
          address: "Synthetic avenue",
          city: "QA Peña",
          postal_code: "33101",
          contact_preference: " Llamada por la mañana ",
          appointment_date: "2028-02-29",
        });
        await assert.rejects(
          submit(request, {
            ...base,
            contact_preference: "Otro contacto",
            appointment_date: "2028-02-29",
          }),
          /request_conflict/,
        );
        await as(owner);
        await db.query("select review_web_request($1,$2,false)", [
          company,
          request,
        ]);
        assert.equal((await requestRow(request)).status, "ARCHIVADO");
        const convert = async () =>
          (
            await db.query<{ v: string }>(
              "select review_web_request($1,$2,true) v",
              [company, request],
            )
          ).rows[0].v;
        const lead = await convert();
        assert.equal(await convert(), lead);
        const row = (
          await db.query<{
            contact_preference: string;
            requested_day: string;
            address: string;
            city: string;
            postal_code: string;
            message: string;
          }>(
            "select contact_preference,appointment_date::text as requested_day,address,city,postal_code,message from leads where id=$1",
            [lead],
          )
        ).rows[0];
        assert.equal(row.contact_preference, "Llamada por la mañana");
        assert.equal(row.requested_day, "2028-02-29");
        assert.equal(row.address, "Synthetic avenue");
        assert.equal(row.city, "QA Peña");
        assert.equal(row.postal_code, "33101");
        assert.match(row.message, /Synthetic only/);
        assert.match(row.message, /0 × 0 × 0/);
        assert.equal(
          (await requestRow(request)).data.appointment_date,
          "2028-02-29",
        );
      },
    );
    await t.test(
      "invalid dates, types and excessive preferences do not create requests",
      async () => {
        await as(null);
        for (const value of [
          { appointment_date: "2026-02-29" },
          { appointment_date: "2026-2-06" },
          { appointment_date: "1900-02-29" },
          { appointment_date: "2026-10-32" },
          { appointment_date: " 2026-10-06 " },
          { appointment_date: [] },
          { contact_preference: { method: "email" } },
          { contact_preference: "x".repeat(61) },
        ]) {
          const request = id();
          await assert.rejects(
            submit(request, { ...base, ...value }),
            /invalid_contact_preferences/,
          );
          await as(owner);
          assert.equal(await requestRow(request), undefined);
          await as(null);
        }
      },
    );
    await t.test(
      "conversion still requires Leads write and rejects another tenant",
      async () => {
        const request = id();
        await as(null);
        await submit(request, {
          ...base,
          appointment_date: "2026-10-12",
          contact_preference: "Correo",
        });
        await as(reader);
        await assert.rejects(
          db.query("select review_web_request($1,$2,true)", [company, request]),
          /permission_denied/,
        );
        assert.equal((await requestRow(request)).status, "NUEVO");
        await as(owner);
        await assert.rejects(
          db.query("select review_web_request($1,$2,true)", [foreign, request]),
          /request_unavailable/,
        );
        assert.equal((await requestRow(request)).status, "NUEVO");
      },
    );
    await t.test(
      "anonymous submission grants no read or review access",
      async () => {
        await as(null);
        await assert.rejects(
          db.query("select * from web_requests"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select review_web_request($1,$2,true)", [company, id()]),
          /permission denied/,
        );
      },
    );
    await t.test(
      "revocation and expiry reject submission and old request retries",
      async () => {
        const request = id();
        await as(null);
        await submit(request, base);
        await as(owner);
        await db.query("select manage_web_form($1,$2,false)", [company, form]);
        await as(null);
        await assert.rejects(submit(request, base), /form_unavailable/);
        await assert.rejects(submit(id(), base), /form_unavailable/);
        const expired = id();
        await as(owner);
        await db.query("select manage_web_form($1,$2,true)", [
          company,
          expired,
        ]);
        await db.exec("reset role");
        await db.query(
          "update web_forms set expires_at=now()-interval '1 second' where id=$1",
          [expired],
        );
        await as(null);
        await assert.rejects(submit(id(), base, expired), /form_unavailable/);
      },
    );
  } finally {
    await db.close();
  }
});
