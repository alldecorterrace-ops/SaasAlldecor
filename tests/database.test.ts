import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL foundation: isolation, authorization, persistence and conflicts", async (t) => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222",
    staff = "33333333-3333-4333-8333-333333333333",
    unverified = "44444444-4444-4444-8444-444444444444";
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    customer = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609170001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const [id, email, confirmed] of [
    [alice, "owner-a@example.test", true],
    [bob, "owner-b@example.test", true],
    [staff, "staff@example.test", true],
    [unverified, "pending@example.test", false],
  ] as const) {
    await db.query("insert into auth.users values($1,$2,$3)", [
      id,
      email,
      confirmed ? "2026-09-17T12:00:00Z" : null,
    ]);
  }
  async function as(id: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  }
  const save = (company = a, version = 0, name = "Cliente de prueba") =>
    db.query("select public.save_customer($1,$2,$3,$4)", [
      company,
      customer,
      version,
      JSON.stringify({
        full_name: name,
        status: "active",
        client_date: "2026-09-01",
        notes: "Nota conservada",
      }),
    ]);
  try {
    await t.test(
      "anonymous cannot read customers or create companies",
      async () => {
        await as("", "anon");
        await assert.rejects(
          db.query("select * from public.customers"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select public.create_company($1,$2)", [a, "Empresa A"]),
          /permission denied/,
        );
      },
    );
    await t.test("unverified identity cannot create a company", async () => {
      await as(unverified);
      await assert.rejects(
        db.query("select public.create_company($1,$2)", [a, "Empresa A"]),
        /authentication_required/,
      );
    });
    await t.test(
      "company bootstrap creates owner and is retry-safe",
      async () => {
        await as(alice);
        await db.query("select public.create_company($1,$2)", [a, "Empresa A"]);
        await db.query("select public.create_company($1,$2)", [a, "Empresa A"]);
        assert.equal(
          (await db.query("select * from public.companies")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query<{ role: string }>(
              "select role from public.memberships",
            )
          ).rows[0].role,
          "owner",
        );
      },
    );
    await t.test(
      "second company is isolated and cannot claim an existing company id",
      async () => {
        await as(bob);
        await assert.rejects(
          db.query("select public.create_company($1,$2)", [a, "Empresa A"]),
          /request_conflict/,
        );
        await db.query("select public.create_company($1,$2)", [b, "Empresa B"]);
        assert.deepEqual(
          (
            await db.query<{ id: string }>("select id from public.companies")
          ).rows.map((x) => x.id),
          [b],
        );
      },
    );
    await t.test(
      "owner persists customer fields and server-owned author",
      async () => {
        await as(alice);
        await save();
        const row = (
          await db.query<{ created_by: string; notes: string }>(
            "select * from public.customers",
          )
        ).rows[0];
        assert.equal(row.created_by, alice);
        assert.equal(row.notes, "Nota conservada");
      },
    );
    await t.test(
      "duplicate creation cannot create duplicate records",
      async () => {
        await assert.rejects(save(), /duplicate key/);
        assert.equal(
          (await db.query("select * from public.customers")).rows.length,
          1,
        );
      },
    );
    await t.test(
      "direct writes cannot bypass validation or spoof company/actor",
      async () => {
        await assert.rejects(
          db.query(
            "update public.customers set company_id=$1,updated_by=$2 where id=$3",
            [b, bob, customer],
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "insert into public.memberships(company_id,user_id,email,role) values($1,$2,'x','owner')",
            [b, alice],
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "other company cannot read, edit, or enumerate audit of A",
      async () => {
        await as(bob);
        assert.equal(
          (await db.query("select * from public.customers")).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.audit_events where company_id=$1",
              [a],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(save(a, 1, "Ataque"), /permission_denied/);
        await assert.rejects(save(b, 1, "Ataque"), /customer_conflict/);
      },
    );
    await t.test(
      "optimistic version prevents overwriting a newer change",
      async () => {
        await as(alice);
        await save(a, 1, "Nombre nuevo");
        await assert.rejects(save(a, 1, "Cambio viejo"), /customer_conflict/);
        const row = (
          await db.query<{ full_name: string; version: number }>(
            "select full_name,version from public.customers",
          )
        ).rows[0];
        assert.equal(row.full_name, "Nombre nuevo");
        assert.equal(row.version, 2);
      },
    );
    await t.test(
      "membership is added only to the authorized company",
      async () => {
        await db.query("select public.add_company_member($1,$2)", [
          a,
          "staff@example.test",
        ]);
        await assert.rejects(
          db.query("select public.add_company_member($1,$2)", [
            b,
            "staff@example.test",
          ]),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select public.add_company_member($1,$2)", [
            a,
            "pending@example.test",
          ]),
          /account_not_available/,
        );
      },
    );
    await t.test(
      "read-only member cannot edit or elevate permissions",
      async () => {
        await as(staff);
        assert.equal(
          (await db.query("select * from public.customers")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from public.memberships")).rows.length,
          1,
        );
        await assert.rejects(save(a, 2), /permission_denied/);
        await assert.rejects(
          db.query("select public.set_member_access($1,$2,$3,$4,$5)", [
            a,
            staff,
            "admin",
            true,
            "{}",
          ]),
          /permission_denied/,
        );
        assert.equal(
          (await db.query("select * from public.audit_events")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "all 23 catalog modules remain selectable, invalid grants fail",
      async () => {
        await as(alice);
        assert.equal(
          (await db.query("select * from public.module_catalog")).rows.length,
          23,
        );
        for (const permissions of [
          '{"invented":["read"]}',
          '{"clientes":["delete"]}',
          "null",
          '{"clientes":"write"}',
        ]) {
          await assert.rejects(
            db.query("select public.set_member_access($1,$2,$3,$4,$5)", [
              a,
              staff,
              "member",
              true,
              permissions,
            ]),
            /invalid_permissions/,
          );
        }
      },
    );
    await t.test(
      "explicit write permission grants customer editing but not company administration",
      async () => {
        await db.query("select public.set_member_access($1,$2,$3,$4,$5)", [
          a,
          staff,
          "member",
          true,
          '{"clientes":["write"]}',
        ]);
        await as(staff);
        await save(a, 2, "Edición autorizada");
        await assert.rejects(
          db.query("select public.update_company($1,$2,$3)", [
            a,
            "Alterada",
            "UTC",
          ]),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select public.add_company_member($1,$2)", [
            a,
            "owner-b@example.test",
          ]),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "revocation immediately removes existing session data access",
      async () => {
        await as(alice);
        await db.query("select public.set_member_access($1,$2,$3,$4,$5)", [
          a,
          staff,
          "member",
          false,
          '{"clientes":["write"]}',
        ]);
        await as(staff);
        assert.equal(
          (await db.query("select * from public.customers")).rows.length,
          0,
        );
        await assert.rejects(save(a, 3), /permission_denied/);
      },
    );
    await t.test(
      "company owners cannot accidentally remove themselves",
      async () => {
        await as(alice);
        await assert.rejects(
          db.query("select public.set_member_access($1,$2,$3,$4,$5)", [
            a,
            alice,
            "member",
            false,
            "{}",
          ]),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "admin cannot alter owner or create another admin",
      async () => {
        await db.query("select public.set_member_access($1,$2,$3,$4,$5)", [
          a,
          staff,
          "admin",
          true,
          "{}",
        ]);
        await db.query("select public.add_company_member($1,$2)", [
          a,
          "owner-b@example.test",
        ]);
        await as(staff);
        await assert.rejects(
          db.query("select public.set_member_access($1,$2,$3,$4,$5)", [
            a,
            alice,
            "member",
            false,
            "{}",
          ]),
          /permission_denied/,
        );
        await assert.rejects(
          db.query("select public.set_member_access($1,$2,$3,$4,$5)", [
            a,
            bob,
            "admin",
            true,
            "{}",
          ]),
          /permission_denied/,
        );
      },
    );
    await t.test(
      "archive/restore preserves rows and immutable audit",
      async () => {
        await as(alice);
        for (const [version, status] of [
          [3, "archived"],
          [4, "active"],
        ] as const) {
          await db.query("select public.save_customer($1,$2,$3,$4)", [
            a,
            customer,
            version,
            JSON.stringify({ full_name: "Conservado", status }),
          ]);
        }
        assert.equal(
          (await db.query("select * from public.customers")).rows.length,
          1,
        );
        const events = await db.query(
          "select * from public.audit_events where entity=$1",
          ["customers"],
        );
        assert.equal(events.rows.length, 5);
        await assert.rejects(
          db.query("delete from public.audit_events"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("delete from public.customers"),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
