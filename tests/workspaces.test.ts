import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID as id } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { emptyItem } from "../src/lib/estimates";
import { workspaces } from "../src/lib/workspaces";
test("Operational workspaces enforce tenant isolation, ledger integrity, schedule conflicts and revisions", async (t) => {
  const db = new PGlite(),
    owner = id(),
    staff = id(),
    other = id(),
    company = id(),
    foreign = id(),
    customer = id(),
    estimate = id(),
    worker = id(),
    stock = id(),
    permit = id(),
    manual = id(),
    installation = id();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`,
  );
  for (const file of [
    "001_foundation",
    "002_commercial",
    "004_estimates",
    "005_invoices_projects",
    "006_workers_expenses",
    "007_void_expense_receipts",
    "008_operations_workspaces",
    "009_time_tracking",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/202609170${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  for (const [uid, email] of [
    [owner, "owner@example.test"],
    [staff, "staff@example.test"],
    [other, "other@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,now())", [uid, email]);
  async function as(uid: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec(`set role ${role}`);
  }
  async function get(rid: string) {
    return (
      await db.query<{
        version: number;
        stock: string;
        status: string;
        data: Record<string, string>;
      }>("select * from public.work_records where id=$1", [rid])
    ).rows[0];
  }
  const save = (rid: string, version: number, kind: string, data: unknown) =>
    db.query("select public.save_work_record($1,$2,$3,$4,$5)", [
      company,
      rid,
      version,
      kind,
      JSON.stringify(data),
    ]);
  let project = "",
    invoice = "";
  try {
    await as(owner);
    await db.query("select public.create_company($1,'Empresa A')", [company]);
    await db.query(
      "select public.add_company_member($1,'staff@example.test')",
      [company],
    );
    await db.query("select public.save_customer($1,$2,0,$3)", [
      company,
      customer,
      JSON.stringify({ full_name: "Cliente sintético", status: "active" }),
    ]);
    await db.query("select public.save_estimate($1,$2,0,$3)", [
      company,
      estimate,
      JSON.stringify({
        customer_id: customer,
        estimate_date: "2026-09-17",
        valid_until: null,
        status: "BORRADOR",
        notes: "",
        discount: "0",
        taxes: "0",
        items: [{ ...emptyItem, name: "Obra", unit_price: "100" }],
      }),
    ]);
    invoice = (
      await db.query<{ id: string }>(
        "select public.approve_estimate($1,$2,1,'2026-09-17','Proyecto de prueba','Autorización de prueba') as id",
        [company, estimate],
      )
    ).rows[0].id;
    project = (
      await db.query<{ project_id: string }>(
        "select project_id from public.invoices where id=$1",
        [invoice],
      )
    ).rows[0].project_id;
    await db.query("select public.save_worker($1,$2,0,$3)", [
      company,
      worker,
      JSON.stringify({
        name: "Técnico",
        email: "",
        phone: "",
        job_title: "",
        team: "",
        hourly_rate: "20",
        weekly_target: 40,
        active: true,
        notes: "",
      }),
    ]);
    await as(other);
    await db.query("select public.create_company($1,'Empresa B')", [foreign]);
    await as(owner);
    const permitInput = {
      name: "Permiso de construcción",
      status: "PENDIENTE",
      project_id: project,
      worker_id: null,
      data: { ...workspaces.permits.defaults, submitted_date: "2026-09-17" },
    };
    await t.test(
      "permits require same-company project, valid dates and approval metadata",
      async () => {
        await assert.rejects(
          save(permit, 0, "permits", { ...permitInput, project_id: null }),
          /project_required/,
        );
        await assert.rejects(
          save(permit, 0, "permits", { ...permitInput, project_id: id() }),
          /project_unavailable/,
        );
        await save(permit, 0, "permits", permitInput);
        await assert.rejects(
          save(permit, 1, "permits", { ...permitInput, status: "APROBADO" }),
          /approval_fields_required/,
        );
        await assert.rejects(
          save(permit, 1, "permits", {
            ...permitInput,
            data: { ...permitInput.data, approved_date: "2026-09-16" },
          }),
          /invalid_dates/,
        );
        await save(permit, 1, "permits", {
          ...permitInput,
          status: "APROBADO",
          data: {
            ...permitInput.data,
            approved_date: "2026-09-18",
            permit_number: "TEST-1",
          },
        });
        await assert.rejects(
          save(permit, 1, "permits", permitInput),
          /record_conflict/,
        );
      },
    );
    const itemInput = {
      name: "Perfil aluminio",
      status: "ACTIVO",
      data: { ...workspaces.inventory.defaults, sku: "TEST-A", unit: "ft" },
    };
    const movement = (mid: string, v: number, data: unknown) =>
      db.query("select public.record_inventory_movement($1,$2,$3,$4,$5)", [
        company,
        mid,
        stock,
        v,
        JSON.stringify(data),
      ]);
    const receipt = {
      quantity: "10.125",
      movement_date: "2026-09-17",
      reason: "Entrada de prueba",
      reference: "TEST-IN",
    };
    await t.test(
      "inventory prevents duplicates, negative stock and stale edits; reversal preserves original",
      async () => {
        await save(stock, 0, "inventory", itemInput);
        await assert.rejects(
          save(id(), 0, "inventory", itemInput),
          /duplicate/,
        );
        const first = id();
        await movement(first, 1, receipt);
        await movement(first, 1, receipt);
        assert.equal((await get(stock)).stock, "10.125");
        await assert.rejects(
          movement(first, 2, { ...receipt, quantity: "9" }),
          /request_conflict/,
        );
        await assert.rejects(
          movement(id(), 2, { ...receipt, quantity: "-11", reference: "" }),
          /insufficient_stock/,
        );
        await assert.rejects(
          save(stock, 2, "inventory", {
            ...itemInput,
            data: { ...itemInput.data, unit: "unidad" },
          }),
          /unit_locked/,
        );
        const outgoing = id();
        await movement(outgoing, 2, {
          ...receipt,
          quantity: "-3.125",
          reference: "TEST-OUT",
        });
        assert.equal((await get(stock)).stock, "7.000");
        await assert.rejects(
          movement(id(), 3, { ...receipt, reversal_of: first, reference: "" }),
          /insufficient_stock/,
        );
        await movement(id(), 3, {
          movement_date: "2026-09-18",
          reason: "Corrección de salida",
          reversal_of: outgoing,
        });
        assert.equal((await get(stock)).stock, "10.125");
        await assert.rejects(
          movement(id(), 4, {
            movement_date: "2026-09-18",
            reason: "Otro reverso",
            reversal_of: outgoing,
          }),
          /duplicate/,
        );
        assert.equal(
          (await db.query("select * from public.inventory_movements")).rows
            .length,
          3,
        );
        await assert.rejects(
          db.query("update public.work_records set stock=500"),
          /permission denied/,
        );
      },
    );
    const schedule = {
      name: "Instalación",
      status: "PROGRAMADA",
      project_id: project,
      worker_id: worker,
      data: {
        ...workspaces.installations.defaults,
        starts_at: "2026-09-21T13:00:00Z",
        ends_at: "2026-09-21T17:00:00Z",
      },
    };
    await t.test(
      "schedule detects overlap by responsible worker and requires deposit to start",
      async () => {
        await save(installation, 0, "installations", schedule);
        await assert.rejects(
          save(id(), 0, "installations", {
            ...schedule,
            data: {
              ...schedule.data,
              starts_at: "2026-09-21T15:00:00Z",
              ends_at: "2026-09-21T18:00:00Z",
            },
          }),
          /schedule_overlap/,
        );
        await save(id(), 0, "installations", {
          ...schedule,
          data: {
            ...schedule.data,
            starts_at: "2026-09-21T17:00:00Z",
            ends_at: "2026-09-21T18:00:00Z",
          },
        });
        await assert.rejects(
          save(installation, 1, "installations", {
            ...schedule,
            status: "EN_CURSO",
          }),
          /deposit_required/,
        );
        await db.query("select public.record_payment($1,$2,$3,1,$4)", [
          company,
          id(),
          invoice,
          JSON.stringify({
            amount: "25",
            payment_date: "2026-09-17",
            method: "EFECTIVO",
            reference: "",
            notes: "",
          }),
        ]);
        await save(installation, 1, "installations", {
          ...schedule,
          status: "EN_CURSO",
        });
      },
    );
    const manualInput = {
      name: "Manual de fabricación",
      status: "APROBADO",
      project_id: project,
      data: {
        ...workspaces.manuals.defaults,
        steps: "Verificar las medidas y ensamblar.",
      },
    };
    await t.test(
      "manual revisions preserve content and invalidate approval after changes",
      async () => {
        await save(manual, 0, "manuals", manualInput);
        await save(manual, 1, "manuals", {
          ...manualInput,
          data: {
            ...manualInput.data,
            steps: "Verificar medida nueva y ensamblar.",
          },
        });
        assert.equal((await get(manual)).status, "EN_REVISION");
        const history = await db.query<{
          after_data: { data: { steps: string } };
        }>("select * from public.record_history($1,'work_records',$2)", [
          company,
          manual,
        ]);
        assert.equal(history.rows.length, 2);
        assert.equal(
          history.rows[1].after_data.data.steps,
          manualInput.data.steps,
        );
      },
    );
    const path = `${company}/${manual}/${id()}.pdf`,
      attachment = id();
    await t.test(
      "private attachments retain originals and cannot cross records or companies",
      async () => {
        await db.query(
          "insert into storage.objects(bucket_id,name) values('work-files',$1)",
          [path],
        );
        await assert.rejects(
          db.query(
            "select public.set_work_attachment($1,$2,2,$3,$4,'Plano.pdf',true)",
            [company, permit, attachment, path],
          ),
          /invalid_attachment/,
        );
        await db.query(
          "select public.set_work_attachment($1,$2,2,$3,$4,'Plano.pdf',true)",
          [company, manual, attachment, path],
        );
        await db.query(
          "select public.set_work_attachment($1,$2,3,$3,$4,'Plano.pdf',false)",
          [company, manual, attachment, path],
        );
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query<{ active: boolean }>(
              "select active from public.work_attachments",
            )
          ).rows[0].active,
          false,
        );
        await db.query("delete from storage.objects");
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "zone validation, module restrictions, anonymous and cross-tenant denial",
      async () => {
        const zone = {
          name: "Zona de trabajo",
          status: "ACTIVA",
          data: {
            ...workspaces.zones.defaults,
            latitude: "25.7617",
            longitude: "-80.1918",
          },
        };
        await assert.rejects(
          save(id(), 0, "zones", {
            ...zone,
            data: { ...zone.data, latitude: "91" },
          }),
          /invalid_zone/,
        );
        await save(id(), 0, "zones", zone);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [
            company,
            staff,
            JSON.stringify({
              manualfab: ["read", "write"],
              activity: ["read"],
            }),
          ],
        );
        await as(staff);
        assert.equal(
          (await db.query("select * from public.work_records")).rows.length,
          1,
        );
        await assert.rejects(
          save(manual, 4, "manuals", manualInput),
          /manager_required/,
        );
        await assert.rejects(
          db.query(
            "select * from public.record_history($1,'work_records',$2)",
            [company, permit],
          ),
          /permission_denied/,
        );
        assert.ok(
          (
            await db.query<{ entity: string }>(
              "select * from public.activity_feed($1)",
              [company],
            )
          ).rows.every((r) => r.entity === "work_records"),
        );
        await as(other);
        assert.equal(
          (await db.query("select * from public.work_records")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.work_attachments")).rows.length,
          0,
        );
        await assert.rejects(save(id(), 0, "zones", zone), /permission_denied/);
        await as("", "anon");
        await assert.rejects(
          db.query("select * from public.work_records"),
          /permission denied/,
        );
        await assert.rejects(save(id(), 0, "zones", zone), /permission denied/);
      },
    );
    await as(owner);
    await db.query(
      "select public.link_worker_login($1,$2,1,'staff@example.test')",
      [company, worker],
    );
    await db.query("select public.set_member_access($1,$2,'member',true,$3)", [
      company,
      staff,
      JSON.stringify({ horasfix: ["read", "write"] }),
    ]);
    const entry = id(),
      request = id();
    const timeInput = {
      worker_id: worker,
      project_id: project,
      starts_at: "2026-01-05T13:00:00Z",
      ends_at: "2026-01-05T21:00:00Z",
      break_minutes: 30,
      status: "PENDIENTE",
      notes: "Registro de prueba",
      reason: "Carga administrativa",
    };
    const saveTime = (v: number, input: unknown = timeInput, rid = entry) =>
      db.query("select public.save_time_entry($1,$2,$3,$4)", [
        company,
        rid,
        v,
        JSON.stringify(input),
      ]);
    const timeRow = async () =>
      (
        await db.query<{ minutes: number; version: number; status: string }>(
          "select * from public.time_entries where id=$1",
          [entry],
        )
      ).rows[0];
    await t.test(
      "hours derive net minutes and reject overlap, invalid breaks and tenant references",
      async () => {
        await saveTime(0);
        assert.equal((await timeRow()).minutes, 450);
        await assert.rejects(saveTime(0, timeInput, id()), /time_overlap/);
        await assert.rejects(
          saveTime(1, { ...timeInput, break_minutes: 500 }),
          /invalid_time/,
        );
        await assert.rejects(
          saveTime(1, { ...timeInput, worker_id: id() }),
          /worker_unavailable/,
        );
        await saveTime(1, { ...timeInput, status: "APROBADO" });
        await saveTime(2, {
          ...timeInput,
          status: "APROBADO",
          break_minutes: 45,
        });
        assert.equal((await timeRow()).status, "PENDIENTE");
        await assert.rejects(saveTime(2), /record_conflict/);
      },
    );
    const proposed = {
      starts_at: timeInput.starts_at,
      ends_at: "2026-01-05T22:00:00Z",
      break_minutes: 30,
      reason: "Salida corregida por olvido",
    };
    await t.test(
      "linked worker can request own corrections but cannot edit or approve; applying is version checked",
      async () => {
        await as(staff);
        assert.equal(
          (
            await db.query<{ id: string }>(
              "select * from public.my_time_worker($1)",
              [company],
            )
          ).rows[0].id,
          worker,
        );
        await assert.rejects(saveTime(3), /manager_required/);
        await db.query("select public.request_time_change($1,$2,$3,3,$4)", [
          company,
          request,
          entry,
          JSON.stringify(proposed),
        ]);
        await db.query("select public.request_time_change($1,$2,$3,3,$4)", [
          company,
          request,
          entry,
          JSON.stringify(proposed),
        ]);
        await assert.rejects(
          db.query(
            "select public.decide_time_request($1,$2,1,true,'Revisado')",
            [company, request],
          ),
          /manager_required/,
        );
        await as(owner);
        await assert.rejects(
          db.query(
            "select public.set_time_period($1,'2026-01-05',true,'Cierre de prueba')",
            [company],
          ),
          /unreviewed_period/,
        );
        await db.query(
          "select public.decide_time_request($1,$2,1,true,'Corrección comprobada')",
          [company, request],
        );
        assert.equal((await timeRow()).minutes, 510);
        assert.equal((await timeRow()).status, "PENDIENTE");
        await assert.rejects(
          db.query(
            "select public.decide_time_request($1,$2,1,true,'Reintento')",
            [company, request],
          ),
          /record_conflict/,
        );
      },
    );
    await t.test(
      "closed weeks block edits and requests until an audited reopening",
      async () => {
        await saveTime(4, { ...timeInput, ...proposed, status: "APROBADO" });
        await db.query(
          "select public.set_time_period($1,'2026-01-05',true,'Semana revisada')",
          [company],
        );
        await assert.rejects(saveTime(5), /period_locked/);
        await as(staff);
        await assert.rejects(
          db.query("select public.request_time_change($1,$2,$3,5,$4)", [
            company,
            id(),
            entry,
            JSON.stringify(proposed),
          ]),
          /period_locked/,
        );
        await assert.rejects(
          db.query(
            "select public.set_time_period($1,'2026-01-05',false,'Reabrir')",
            [company],
          ),
          /manager_required/,
        );
        await as(owner);
        await db.query(
          "select public.set_time_period($1,'2026-01-05',false,'Reapertura autorizada')",
          [company],
        );
        await saveTime(5, {
          ...timeInput,
          ...proposed,
          status: "APROBADO",
          notes: "Semana reabierta",
        });
        const h = await db.query(
          "select * from public.record_history($1,'time_entries',$2)",
          [company, entry],
        );
        assert.ok(h.rows.length >= 6);
      },
    );
    await t.test(
      "clock uses server time, requires worker link and does not duplicate open or repeated punches",
      async () => {
        const punch = id();
        await as(owner);
        await assert.rejects(
          db.query("select public.punch_time($1,$2,'IN')", [company, punch]),
          /worker_login_required/,
        );
        await as(staff);
        await db.query("select public.punch_time($1,$2,'IN')", [
          company,
          punch,
        ]);
        await db.query("select public.punch_time($1,$2,'IN')", [
          company,
          punch,
        ]);
        await assert.rejects(
          db.query("select public.punch_time($1,$2,'IN')", [company, id()]),
          /time_overlap/,
        );
        await db.query("select public.punch_time($1,$2,'OUT')", [
          company,
          punch,
        ]);
        await db.query("select public.punch_time($1,$2,'OUT')", [
          company,
          punch,
        ]);
        const row = (
          await db.query<{ ends_at: Date; version: number }>(
            "select ends_at,version from public.time_entries where id=$1",
            [punch],
          )
        ).rows[0];
        assert.ok(row.ends_at);
        assert.equal(row.version, 2);
        await as(other);
        assert.equal(
          (await db.query("select * from public.time_entries")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select public.request_time_change($1,$2,$3,6,$4)", [
            company,
            id(),
            entry,
            JSON.stringify(proposed),
          ]),
          /permission_denied/,
        );
        await as("", "anon");
        await assert.rejects(
          db.query("select * from public.time_requests"),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
