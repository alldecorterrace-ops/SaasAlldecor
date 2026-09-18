import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fullDatabase } from "./helpers/full-database";
import { historicalEstimatePayload } from "../src/lib/migration/historical-estimate-payload";
import { historicalBusinessPayload } from "../src/lib/migration/historical-business-payload";
import { planOperationalCustomers } from "../src/lib/migration/operational-customers";
import { ImportedEstimateDetail } from "../src/components/imported-estimate-detail";
import type { EstimateRecord } from "../src/lib/estimate-record";

test("historical estimates preserve originals, amounts, access and no approval side effects", async (t) => {
  const { db } = await fullDatabase(),
    company = randomUUID(),
    owner = randomUUID(),
    other = randomUUID(),
    foreign = randomUUID(),
    staff = randomUUID();
  const j = {
    nombre: "Saved customer",
    email: "saved@example.test",
    telefono: "",
    direccion: "Original address",
    subtotal: "100.00",
    discount: "0.00",
    taxes: "0.00",
    total: "100.00",
    condiciones: "Original terms <script>not HTML</script>",
    pagos_pct: [50, 50],
    secret: "never-publish",
    items: [
      {
        label: "Original line",
        spec: "Saved detail",
        price: "100.00",
        data: { private_token: "never-publish" },
      },
    ],
  };
  const source = {
    format: "adt-history-snapshot-v1",
    origin: "restored_snapshot",
    clients: [
      {
        external_id: "c",
        full_name: "Current customer",
        email: "current@example.test",
        phone: "",
        address: "Current address",
        city: "",
        postal_code: "",
        service: "",
        client_date: "2020-01-01",
        notes: "",
        status: "ACTIVO",
      },
    ],
    estimates: [
      {
        external_id: "e",
        consecutive: "LEGACY-E1",
        client_external_id: "c",
        estimate_date: "2020-01-02",
        status: "ENVIADO",
        total: "100.00",
        discount: "0.00",
        taxes: "0.00",
        notes: "Original notes",
        source_json: JSON.stringify(j),
      },
    ],
    items: [],
    projects: [],
    invoices: [],
    payments: [],
    documents: [],
    contracts: [],
  };
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  try {
    for (const [id, email] of [
      [owner, "owner@example.test"],
      [other, "other@example.test"],
      [staff, "staff@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'Example company')", [
      company,
    ]);
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    await as(other);
    await db.query("select public.create_company($1,'Other company')", [
      foreign,
    ]);
    await as(owner);
    await db.exec("reset role");
    const ep = historicalEstimatePayload(source, company),
      bp = historicalBusinessPayload(source, company),
      cp = planOperationalCustomers(source, [], company);
    await db.query("select app_private.import_historical_estimates($1,$2,$3)", [
      company,
      ep.snapshotSha256,
      JSON.stringify(ep.records),
    ]);
    await db.query("select app_private.import_historical_business($1,$2,$3)", [
      company,
      bp.snapshotSha256,
      JSON.stringify(bp.records),
    ]);
    await db.query(
      "select app_private.import_operational_customers($1,$2,$3,$4,$5)",
      [company, owner, cp.snapshotSha256, "[]", JSON.stringify(cp.records)],
    );
    const customer = (
        await db.query<{ id: string }>("select id from public.customers")
      ).rows[0],
      hist = ep.records[0],
      expected = {
        source_sha256: hist.source_sha256,
        customer_id: customer.id,
      };
    const load = (e: unknown = expected, c = company, a = owner) =>
      db.query<{
        result: { estimate_id: string; inserted: number; unchanged: number };
      }>("select app_private.import_operational_estimate($1,$2,$3,$4) result", [
        c,
        a,
        hist.id,
        JSON.stringify(e),
      ]);
    const originals = (
        await db.query("select * from app_private.historical_estimate_sources")
      ).rows,
      customers = (await db.query("select * from public.customers")).rows;
    await t.test(
      "reject source changes, wrong company and missing customer mapping",
      async () => {
        await assert.rejects(
          load({ ...expected, source_sha256: "0".repeat(64) }),
          /source_changed/,
        );
        await assert.rejects(
          load({ ...expected, customer_id: randomUUID() }),
          /destination_changed/,
        );
        await assert.rejects(load(expected, foreign), /actor_not_manager/);
        await assert.rejects(
          load(expected, company, other),
          /actor_not_manager/,
        );
      },
    );
    await t.test(
      "reject mismatched saved lines and customer snapshot with full rollback",
      async () => {
        for (const changed of [
          { ...j, items: [{ ...j.items[0], price: "99.99" }] },
          { ...j, nombre: null },
          { ...j, subtotal: "99.99" },
          { ...j, pagos_pct: [101] },
        ]) {
          await db.exec("begin");
          await db.query(
            "update app_private.historical_estimate_sources set original=$1",
            [
              JSON.stringify({
                ...hist.original,
                estimate: {
                  ...source.estimates[0],
                  source_json: JSON.stringify(changed),
                },
              }),
            ],
          );
          await assert.rejects(load());
          await db.exec("rollback");
        }
        assert.equal(
          (await db.query("select * from public.estimates")).rows.length,
          0,
        );
      },
    );
    await t.test("app roles cannot execute private import", async () => {
      await as(owner);
      await assert.rejects(load(), /permission denied/);
      await db.exec("reset role");
    });
    const result = (await load()).rows[0].result,
      record = (
        await db.query<{ record: EstimateRecord }>(
          "select to_jsonb(e) record from public.estimates e",
        )
      ).rows[0].record;
    await t.test(
      "exact copy keeps saved customer, status, terms and sanitized detail",
      () => {
        assert.equal(record.total, 100);
        assert.equal(record.status, "ENVIADO");
        assert.equal(record.customer_snapshot.full_name, "Saved customer");
        assert.equal(record.historical_estimate_id, hist.id);
        assert.equal(record.historical_terms?.condiciones, j.condiciones);
        assert.ok(!JSON.stringify(record).includes("never-publish"));
        const html = renderToStaticMarkup(
          createElement(ImportedEstimateDetail, { record, companyId: company }),
        );
        assert.ok(html.includes("Copia de consulta"));
        assert.ok(html.includes("&lt;script&gt;"));
        assert.ok(!html.includes("Cantidad / medidas"));
        assert.ok(html.includes("$100.00"));
      },
    );
    await t.test(
      "public mutations cannot edit or reapprove the imported estimate",
      async () => {
        await as(owner);
        await assert.rejects(
          db.query("select public.save_estimate($1,$2,1,$3)", [
            company,
            result.estimate_id,
            JSON.stringify({ ...record, status: "BORRADOR" }),
          ]),
          /historical_estimate_locked/,
        );
        await assert.rejects(
          db.query(
            "select public.approve_estimate($1,$2,1,'2020-01-03','Duplicate project','Duplicate approval')",
            [company, result.estimate_id],
          ),
          /invalid_approval/,
        );
        await db.exec("reset role");
        for (const table of ["projects", "invoices", "payments"])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        assert.equal(
          (await db.query("select * from public.estimate_revisions")).rows
            .length,
          1,
        );
      },
    );
    await t.test(
      "RLS blocks other company and member without module, owner can read",
      async () => {
        for (const actor of [other, staff]) {
          await as(actor);
          assert.equal(
            (await db.query("select * from public.estimates")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("select * from public.estimate_revisions")).rows
              .length,
            0,
          );
        }
        await as(owner);
        assert.equal(
          (await db.query("select * from public.estimates")).rows.length,
          1,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "replay and changed plan protect the copy and all originals",
      async () => {
        assert.deepEqual((await load()).rows[0].result, {
          estimate_id: result.estimate_id,
          inserted: 0,
          unchanged: 1,
        });
        await assert.rejects(
          load({ ...expected, source_sha256: "1".repeat(64) }),
          /plan_changed/,
        );
        assert.deepEqual(
          (
            await db.query(
              "select * from app_private.historical_estimate_sources",
            )
          ).rows,
          originals,
        );
        assert.deepEqual(
          (await db.query("select * from public.customers")).rows,
          customers,
        );
        assert.equal(
          (await db.query("select * from public.estimate_revisions")).rows
            .length,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
