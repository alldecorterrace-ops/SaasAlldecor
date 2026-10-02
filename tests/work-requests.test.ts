import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { workspaces } from "../src/lib/workspaces";
import {
  parseWorkIdentity,
  confirmedWorkResult,
} from "../src/lib/work-requests";

test("work response must match the submitted identity and operation", () => {
  const request = id(),
    record = id(),
    effect = id(),
    form = new FormData();
  assert.equal(parseWorkIdentity(form), null);
  form.set("request", request);
  assert.equal(parseWorkIdentity(form), request);
  const receipt = {
    id: effect,
    recordId: record,
    version: 2,
    operation: "attachment",
    kind: "manuals",
    status: "EN_REVISION",
  };
  assert.equal(
    confirmedWorkResult(receipt, "manuals", "attachment", record, effect),
    true,
  );
  for (const bad of [
    { ...receipt, id: id() },
    { ...receipt, recordId: id() },
    { ...receipt, version: 0 },
    { ...receipt, operation: "movement" },
    { ...receipt, kind: "inventory" },
  ])
    assert.equal(
      confirmedWorkResult(bad, "manuals", "attachment", record, effect),
      false,
    );
});

test("operational receipts bind effect, identity, version and audit without changing finance", async (t) => {
  const { db } = await fullDatabase();
  const owner = id(),
    staff = id(),
    outsider = id(),
    a = id(),
    b = id(),
    customer = id(),
    estimate = id(),
    worker = id();
  const as = async (user: string = owner, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec(`set role ${role}`);
  };
  const exec = async (
    operation: string,
    kind: string,
    record: string,
    version: number,
    data: object,
    request = id(),
    company = a,
  ) =>
    (
      await db.query<{
        data: { id: string; recordId: string; version: number; status: string };
      }>("select execute_work_action($1,$2,$3,$4,$5,$6,$7) data", [
        company,
        request,
        operation,
        kind,
        record,
        version,
        JSON.stringify(data),
      ])
    ).rows[0].data;
  const snapshot = async () => {
    await db.exec("reset role");
    const row = (
      await db.query(
        "select (select jsonb_agg(to_jsonb(r) order by id) from work_records r) records,(select jsonb_agg(to_jsonb(r) order by id) from inventory_movements r) movements,(select jsonb_agg(to_jsonb(r) order by id) from work_attachments r) files,(select count(*)::int from app_private.work_requests) receipts,(select count(*)::int from audit_events) audits",
      )
    ).rows[0];
    await as();
    return row;
  };
  const finance = async () => {
    await db.exec("reset role");
    const row = (
      await db.query(
        "select (select jsonb_agg(to_jsonb(v) order by id) from invoices v) invoices,(select jsonb_agg(to_jsonb(v) order by id) from payments v) payments,(select jsonb_agg(to_jsonb(v) order by id) from expenses v) expenses",
      )
    ).rows[0];
    await as();
    return row;
  };
  try {
    await db.query(
      "insert into auth.users values($1,'ops-owner@example.test',now()),($2,'ops-staff@example.test',now()),($3,'ops-other@example.test',now())",
      [owner, staff, outsider],
    );
    await as();
    await db.query("select create_company($1,'Operations A')", [a]);
    await db.query("select add_company_member($1,'ops-staff@example.test')", [
      a,
    ]);
    await db.query("select save_customer($1,$2,0,$3)", [
      a,
      customer,
      JSON.stringify({ full_name: "Synthetic operations", status: "active" }),
    ]);
    await db.query("select save_estimate($1,$2,0,$3)", [
      a,
      estimate,
      JSON.stringify({
        customer_id: customer,
        estimate_date: "2026-10-01",
        valid_until: null,
        status: "PENDIENTE",
        notes: "",
        discount: "0",
        taxes: "0",
        items: [{ ...emptyItem, name: "Synthetic", unit_price: "100" }],
      }),
    ]);
    const invoice = (
      await db.query<{ id: string }>(
        "select approve_estimate($1,$2,1,'2026-10-01','Synthetic project','Synthetic approval') id",
        [a, estimate],
      )
    ).rows[0].id;
    const project = (
      await db.query<{ id: string }>(
        "select project_id id from invoices where id=$1",
        [invoice],
      )
    ).rows[0].id;
    await db.query("select save_worker($1,$2,0,$3)", [
      a,
      worker,
      JSON.stringify({
        name: "Synthetic operator",
        email: "",
        phone: "",
        job_title: "",
        team: "",
        hourly_rate: "0",
        weekly_target: 40,
        active: true,
        notes: "",
      }),
    ]);
    await as(outsider);
    await db.query("select create_company($1,'Operations B')", [b]);
    await as();
    const protectedFinance = await finance();
    const stock = id(),
      manual = id(),
      permit = id(),
      installation = id(),
      zone = id();
    const bodies = {
      inventory: {
        name: "Synthetic aluminum",
        status: "ACTIVO",
        project_id: null,
        worker_id: null,
        data: { ...workspaces.inventory.defaults, sku: "OPS-065", unit: "ft" },
      },
      manuals: {
        name: "Synthetic stored manual",
        status: "APROBADO",
        project_id: project,
        worker_id: null,
        data: {
          ...workspaces.manuals.defaults,
          steps: "Verify measurements and attach materials.",
        },
      },
      permits: {
        name: "Synthetic city permit",
        status: "PENDIENTE",
        project_id: project,
        worker_id: null,
        data: {
          ...workspaces.permits.defaults,
          authority: "Synthetic city",
          submitted_date: "2026-10-01",
        },
      },
      installations: {
        name: "Synthetic installation",
        status: "PROGRAMADA",
        project_id: project,
        worker_id: worker,
        data: {
          ...workspaces.installations.defaults,
          starts_at: "2026-10-05T13:00:00Z",
          ends_at: "2026-10-05T17:00:00Z",
        },
      },
      zones: {
        name: "Synthetic zone Ñ",
        status: "ACTIVA",
        project_id: project,
        worker_id: null,
        data: {
          ...workspaces.zones.defaults,
          latitude: "25.7617",
          longitude: "-80.1918",
        },
      },
    };
    await t.test(
      "all five workspaces recover repeated saves without a second revision or audit",
      async () => {
        for (const [kind, record] of [
          ["inventory", stock],
          ["manuals", manual],
          ["permits", permit],
          ["installations", installation],
          ["zones", zone],
        ] as const) {
          const request = id(),
            body = bodies[kind],
            result = await exec("save", kind, record, 0, body, request),
            before = await snapshot();
          assert.equal(result.id, record);
          assert.equal(result.version, 1);
          for (let n = 0; n < 3; n++)
            assert.deepEqual(
              await exec("save", kind, record, 0, body, request),
              result,
            );
          await assert.rejects(
            exec(
              "save",
              kind,
              record,
              0,
              { ...body, name: "Changed intent" },
              request,
            ),
            /request_conflict/,
          );
          assert.deepEqual(await snapshot(), before);
          assert.deepEqual(
            (
              await db.query<{ data: unknown }>(
                "select work_request_result($1,$2) data",
                [a, request],
              )
            ).rows[0].data,
            result,
          );
        }
      },
    );
    await t.test(
      "failed gates roll back receipts and preserve all prior records",
      async () => {
        const before = await snapshot();
        await assert.rejects(
          exec("save", "installations", installation, 1, {
            ...bodies.installations,
            status: "EN_CURSO",
          }),
          /deposit_required/,
        );
        await assert.rejects(
          exec("save", "permits", permit, 1, {
            ...bodies.permits,
            status: "APROBADO",
          }),
          /approval_fields_required/,
        );
        await assert.rejects(
          exec("save", "manuals", manual, 1, bodies.manuals, id(), b),
          /permission_denied/,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "movements and reversals apply once; original quantities and units remain",
      async () => {
        const first = id(),
          request = id(),
          input = {
            movement_id: first,
            quantity: "10.125",
            movement_date: "2026-10-01",
            reason: "Synthetic input",
            reference: "OPS-IN",
            project_id: project,
            reversal_of: "",
          };
        const receipt = await exec(
            "movement",
            "inventory",
            stock,
            1,
            input,
            request,
          ),
          before = await snapshot();
        assert.deepEqual(
          await exec("movement", "inventory", stock, 1, input, request),
          receipt,
        );
        assert.deepEqual(await snapshot(), before);
        const outgoing = id();
        await exec("movement", "inventory", stock, 2, {
          ...input,
          movement_id: outgoing,
          quantity: "-3.125",
          reference: "OPS-OUT",
        });
        const reverse = id(),
          reverseRequest = id(),
          reverseBody = {
            movement_id: reverse,
            movement_date: "2026-10-01",
            reason: "Synthetic reversal",
            reference: "",
            project_id: "",
            reversal_of: outgoing,
            quantity: "",
          };
        const result = await exec(
            "movement",
            "inventory",
            stock,
            3,
            reverseBody,
            reverseRequest,
          ),
          after = await snapshot();
        assert.deepEqual(
          await exec(
            "movement",
            "inventory",
            stock,
            3,
            reverseBody,
            reverseRequest,
          ),
          result,
        );
        assert.deepEqual(await snapshot(), after);
        assert.equal(
          (
            await db.query<{ stock: string }>(
              "select stock from work_records where id=$1",
              [stock],
            )
          ).rows[0].stock,
          "10.125",
        );
        assert.equal(
          (
            await db.query(
              "select id from inventory_movements where item_id=$1",
              [stock],
            )
          ).rows.length,
          3,
        );
        await assert.rejects(
          exec("save", "inventory", stock, 4, {
            ...bodies.inventory,
            data: { ...bodies.inventory.data, unit: "unidad" },
          }),
          /unit_locked/,
        );
        await assert.rejects(
          exec("movement", "inventory", stock, 4, {
            ...input,
            movement_id: id(),
            quantity: "-10.126",
            reference: "",
          }),
          /insufficient_stock/,
        );
      },
    );
    await t.test(
      "private attachment retries and archive preserve the object without flipping state",
      async () => {
        const attachment = id(),
          path = `${a}/${manual}/${attachment}.pdf`,
          req = id(),
          body = {
            attachment_id: attachment,
            path,
            name: "Synthetic.pdf",
            active: true,
            content_sha256: "synthetic-fixture",
          };
        await db.query(
          "insert into storage.objects(bucket_id,name) values('work-files',$1)",
          [path],
        );
        const result = await exec(
            "attachment",
            "manuals",
            manual,
            1,
            body,
            req,
          ),
          before = await snapshot();
        assert.equal(result.status, "EN_REVISION");
        assert.deepEqual(
          await exec("attachment", "manuals", manual, 1, body, req),
          result,
        );
        assert.deepEqual(await snapshot(), before);
        const archive = id(),
          archiveBody = { ...body, active: false, content_sha256: null };
        const archived = await exec(
            "attachment",
            "manuals",
            manual,
            2,
            archiveBody,
            archive,
          ),
          after = await snapshot();
        assert.deepEqual(
          await exec("attachment", "manuals", manual, 2, archiveBody, archive),
          archived,
        );
        assert.deepEqual(await snapshot(), after);
        assert.equal(
          (
            await db.query<{ active: boolean }>(
              "select active from work_attachments where id=$1",
              [attachment],
            )
          ).rows[0].active,
          false,
        );
        assert.equal(
          (
            await db.query("select name from storage.objects where name=$1", [
              path,
            ])
          ).rows.length,
          1,
        );
        await assert.rejects(
          exec("attachment", "manuals", manual, 3, {
            ...body,
            name: "Changed.pdf",
          }),
          /immutable_attachment/,
        );
        await exec("attachment", "manuals", manual, 3, {
          ...body,
          content_sha256: null,
        });
      },
    );
    await t.test(
      "legacy code uses the same receipt boundary and keeps signatures",
      async () => {
        const oldZone = id(),
          input = JSON.stringify(bodies.zones);
        await db.query("select save_work_record($1,$2,0,'zones',$3)", [
          a,
          oldZone,
          input,
        ]);
        const before = await snapshot();
        await db.query("select save_work_record($1,$2,0,'zones',$3)", [
          a,
          oldZone,
          input,
        ]);
        assert.deepEqual(await snapshot(), before);
        await assert.rejects(
          db.query("select app_private.apply_work_record($1,$2,1,'zones',$3)", [
            a,
            oldZone,
            input,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from app_private.work_requests"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "cancellation is an administrator decision; revoked users cannot replay receipts",
      async () => {
        await db.query("select set_member_access($1,$2,'member',true,$3)", [
          a,
          staff,
          JSON.stringify({
            permisos: ["write"],
            inventario: ["write"],
            "fin-proyectos": ["read"],
          }),
        ]);
        await as(staff);
        await assert.rejects(
          exec("save", "permits", permit, 1, {
            ...bodies.permits,
            status: "ANULADO",
            data: { ...bodies.permits.data, notes: "Synthetic cancellation" },
          }),
          /manager_required/,
        );
        const request = id(),
          body = { ...bodies.inventory, name: "Synthetic staff edit" };
        const result = await exec("save", "inventory", stock, 4, body, request);
        assert.equal(result.version, 5);
        await as();
        assert.equal(
          (
            await db.query<{ data: unknown }>(
              "select work_request_result($1,$2) data",
              [a, request],
            )
          ).rows[0].data,
          null,
        );
        await db.query("select set_member_access($1,$2,'member',false,'{}')", [
          a,
          staff,
        ]);
        await as(staff);
        await assert.rejects(
          exec("save", "inventory", stock, 4, body, request),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select work_request_result($1,$2)", [a, request]),
          /permission_denied/,
        );
        await as(outsider);
        await assert.rejects(
          exec("save", "inventory", stock, 5, body),
          /permission_denied/,
        );
        await as("", "anon");
        await assert.rejects(
          exec("save", "zones", zone, 1, bodies.zones),
          /permission denied/,
        );
        await as();
      },
    );
    assert.deepEqual(await finance(), protectedFinance);
  } finally {
    await db.close();
  }
});
