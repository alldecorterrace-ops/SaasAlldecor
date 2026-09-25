import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { analyzeAdtZones, type ZoneSource } from "../src/lib/zone-analysis";
import { commercialZonePermissions } from "../src/lib/commercial-zones";

test("commercial map reads a complete tenant snapshot and preserves source permissions", async (t) => {
  const { db } = await fullDatabase();
  const owner = id(),
    reader = id(),
    company = id(),
    foreign = id(),
    customer = id(),
    form = id();
  const inquiry = {
    name: "Synthetic web inquiry",
    email: "web@saasalldecor.invalid",
    phone: "",
    message: "Synthetic only",
    service: "Pérgola",
    length: "10",
    width: "12",
    height: "9",
  };
  const as = async (user: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  };
  const source = async (target = company) =>
    (
      await db.query<{ result: ZoneSource }>(
        "select public.commercial_zone_source($1) result",
        [target],
      )
    ).rows[0].result;
  const permissions = Object.fromEntries(
    commercialZonePermissions.map(([k]) => [k, ["read"]]),
  );
  try {
    await db.query(
      "insert into auth.users values($1,'map-owner@saasalldecor.invalid',now()),($2,'map-reader@saasalldecor.invalid',now())",
      [owner, reader],
    );
    await as(owner);
    for (const target of [company, foreign])
      await db.query(
        "select public.create_company($1,'Synthetic map company')",
        [target],
      );
    await db.query("select public.save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({
        full_name: "Synthetic paid customer",
        email: "customer@saasalldecor.invalid",
        postal_code: "33101",
        city: "QA City",
        status: "active",
      }),
    ]);
    const estimate = id();
    await db.query("select public.save_estimate($1,$2,0,$3)", [
      company,
      estimate,
      JSON.stringify({
        customer_id: customer,
        estimate_date: "2026-09-25",
        valid_until: null,
        status: "BORRADOR",
        notes: "",
        discount: "0",
        taxes: "0",
        items: [{ ...emptyItem, name: "Synthetic work", unit_price: "100" }],
      }),
    ]);
    const invoice = (
      await db.query<{ result: string }>(
        "select public.approve_estimate($1,$2,1,'2026-09-25','Synthetic map project','Synthetic approval') result",
        [company, estimate],
      )
    ).rows[0].result;
    await db.query("select public.record_payment($1,$2,$3,1,$4)", [
      company,
      id(),
      invoice,
      JSON.stringify({
        amount: "40.25",
        payment_date: "2026-09-25",
        method: "OTRO",
        reference: "synthetic-only",
        notes: "No real payment",
      }),
    ]);
    await db.query("select public.save_customer($1,$2,0,$3)", [
      foreign,
      id(),
      JSON.stringify({
        full_name: "Foreign private name",
        postal_code: "33101",
        status: "active",
      }),
    ]);
    await db.query("select public.manage_web_form($1,$2,true)", [
      company,
      form,
    ]);
    await db.query(
      "select public.add_company_member($1,'map-reader@saasalldecor.invalid')",
      [company],
    );
    await db.query("select public.set_member_access($1,$2,'member',true,$3)", [
      company,
      reader,
      JSON.stringify(permissions),
    ]);

    await t.test(
      "old public requests replay with empty optional locations and malformed new locations fail",
      async () => {
        const request = id();
        await db.exec("reset role;set role anon");
        await db.query("select public.submit_web_request($1,$2,$3)", [
          form,
          request,
          JSON.stringify(inquiry),
        ]);
        await db.query("select public.submit_web_request($1,$2,$3)", [
          form,
          request,
          JSON.stringify({
            ...inquiry,
            address: "",
            city: "",
            postal_code: null,
          }),
        ]);
        await assert.rejects(
          db.query("select public.submit_web_request($1,$2,$3)", [
            form,
            id(),
            JSON.stringify({ ...inquiry, address: { bad: true } }),
          ]),
          /invalid_location/,
        );
        await assert.rejects(
          db.query("select public.submit_web_request($1,$2,$3)", [
            form,
            id(),
            JSON.stringify({ ...inquiry, postal_code: "x".repeat(25) }),
          ]),
          /invalid_location/,
        );
        await as(owner);
        assert.equal(
          (await db.query("select id from public.web_requests")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "web location survives conversion; manual leads never masquerade as web submissions",
      async () => {
        const request = id();
        await db.query("select public.submit_web_request($1,$2,$3)", [
          form,
          request,
          JSON.stringify({
            ...inquiry,
            name: "Synthetic ZIP inquiry",
            address: "Sample avenue",
            city: "QA City",
            postal_code: "33101",
          }),
        ]);
        const linked = (
          await db.query<{ lead: string }>(
            "select public.review_web_request($1,$2,true) lead",
            [company, request],
          )
        ).rows[0].lead;
        const row = (
          await db.query<{
            address: string;
            city: string;
            postal_code: string;
          }>("select address,city,postal_code from public.leads where id=$1", [
            linked,
          ])
        ).rows[0];
        assert.deepEqual(row, {
          address: "Sample avenue",
          city: "QA City",
          postal_code: "33101",
        });
        await db.query("select public.save_lead($1,$2,0,$3)", [
          company,
          id(),
          JSON.stringify({
            full_name: "Manual lead must not count",
            email: "manual@saasalldecor.invalid",
            phone: "",
            address: "",
            city: "QA City",
            postal_code: "33101",
            service: "",
            message: "",
            contact_preference: "",
            appointment_date: null,
            lead_date: "2026-09-25",
            source: "Formulario web",
            status: "NUEVO",
            archived: false,
          }),
        ]);
        let s = await source();
        assert.equal(s.webformLeads.length, 2);
        assert.equal(s.leadStatuses[0].lead_id, request);
        assert.equal(analyzeAdtZones(s).zonas[0].lead, 1);
        // Simulate the linked lead status without editing the original submission.
        await db.exec("reset role");
        await db.query(
          "update public.leads set status='FUERA_AREA',postal_code='90210' where id=$1",
          [linked],
        );
        await as(owner);
        s = await source();
        assert.equal(
          s.webformLeads.find((x) => x.id === request)?.postal_code,
          "33101",
        );
        assert.equal(analyzeAdtZones(s).zonas[0].lead, 0);
      },
    );
    await t.test(
      "postal centers are tenant scoped, audited, idempotent and reject conflicts",
      async () => {
        const save = (target: string, lat: number, version: number) =>
          db.query<{ result: number }>(
            "select public.save_postal_center($1,'33101',$2,-80.3,'QA City',$3) result",
            [target, lat, version],
          );
        assert.equal((await save(company, 25.8, 0)).rows[0].result, 1);
        assert.equal((await save(company, 25.8, 0)).rows[0].result, 1);
        await save(foreign, 26.8, 0);
        assert.equal((await save(company, 25.9, 1)).rows[0].result, 2);
        await assert.rejects(save(company, 26, 1), { code: "PT409" });
        await assert.rejects(save(company, 91, 2), { code: "22023" });
        await assert.rejects(save(company, 0, 2), { code: "22023" });
        assert.equal((await source()).postalCenters[0].lat, 25.9);
        await as(reader);
        assert.equal(
          (await db.query("select * from public.postal_centers")).rows.length,
          1,
        );
        await assert.rejects(save(company, 26, 2), { code: "42501" });
        await assert.rejects(
          db.query("update public.postal_centers set lat=26"),
          { code: "42501" },
        );
        await as(owner);
        assert.equal(
          (
            await db.query(
              "select * from public.audit_events where company_id=$1 and entity='postal_centers'",
              [company],
            )
          ).rows.length,
          2,
        );
      },
    );
    await t.test(
      "every source permission, active membership and authentication is required",
      async () => {
        for (const [module] of commercialZonePermissions) {
          const restricted = { ...permissions };
          delete restricted[module];
          await as(owner);
          await db.query(
            "select public.set_member_access($1,$2,'member',true,$3)",
            [company, reader, JSON.stringify(restricted)],
          );
          await as(reader);
          await assert.rejects(source(), { code: "42501" });
        }
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [company, reader, JSON.stringify(permissions)],
        );
        await as(reader);
        const s = await source();
        assert.equal(s.customers.length, 1);
        assert.equal(s.invoices.length, 1);
        assert.equal(analyzeAdtZones(s).zonas[0].ingresos, 40.25);
        assert.ok(!JSON.stringify(s).includes("Foreign private name"));
        await assert.rejects(source(foreign), { code: "42501" });
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',false,$3)",
          [company, reader, JSON.stringify(permissions)],
        );
        await as(reader);
        await assert.rejects(source(), { code: "42501" });
        await db.exec("reset role;set role anon");
        await assert.rejects(source(), { code: "42501" });
        await as(owner);
      },
    );
    await t.test(
      "single JSON result contains more than 1000 source rows without silently dropping records",
      async () => {
        await db.exec("reset role");
        await db.query(
          "insert into public.customers(company_id,full_name,postal_code,created_by,updated_by) select $1,'Synthetic bulk '||n,'33101',$2,$2 from generate_series(1,1005) n",
          [company, owner],
        );
        await as(owner);
        const s = await source(),
          report = analyzeAdtZones(s);
        assert.equal(s.customers.length, 1006);
        assert.equal(report.zonas[0].contactos, 1006);
        assert.equal(report.zonas[0].ingresos, 40.25);
        assert.equal(report.puntos.length, 1006);
      },
    );
  } finally {
    await db.close();
  }
});

test("vendored Leaflet assets retain upstream checksums and license", async () => {
  const base = new URL("../public/vendor/leaflet-1.9.4/", import.meta.url);
  const hashes = JSON.parse(
    await readFile(new URL("SHA256.json", base), "utf8"),
  ) as Record<string, string>;
  for (const [file, expected] of Object.entries(hashes))
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL(file, base)))
        .digest("hex"),
      expected,
    );
  assert.equal(
    createHash("sha256")
      .update(await readFile(new URL("leaflet.js", base)))
      .digest("base64"),
    "20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
  );
  assert.match(await readFile(new URL("LICENSE", base), "utf8"), /Copyright/);
});
