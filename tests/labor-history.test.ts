import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LaborHistoryFields } from "../src/components/labor-history-fields";
import {
  laborAmountCents,
  parseLaborAllocations,
  laborHistorySchema,
} from "../src/lib/labor-history";
import { fullDatabase } from "./helpers/full-database";
import { receiptReviewFixture } from "./helpers/receipt-review-fixture";
import { laborReport, laborContextSchema } from "../src/lib/labor-report";
test("correspondence parses cents without rounding, rejects malformed or repeated rows", () => {
  assert.equal(laborAmountCents("100.01"), 10001);
  assert.equal(laborAmountCents("9999999999.99"), 999999999999);
  for (const value of [
    "",
    "0",
    "-1",
    "1.005",
    "1e2",
    "1,00",
    "10000000000",
    new Blob(["1"]),
  ])
    assert.equal(laborAmountCents(value), null);
  const worker = randomUUID(),
    form = new FormData();
  const append = (date: string, amount: string) => {
    form.append("allocation_worker", worker);
    form.append("allocation_date", date);
    form.append("allocation_amount", amount);
  };
  append("2026-10-01", "49.99");
  append("2026-10-02", "50.02");
  const parsed = parseLaborAllocations(form);
  assert.ok("allocations" in parsed);
  assert.equal(
    parsed.allocations?.reduce((s, a) => s + a.cents, 0),
    10001,
  );
  append("2026-10-01", "1.00");
  assert.match(parseLaborAllocations(form).error ?? "", /una sola vez/);
  form.delete("allocation_date");
  assert.match(parseLaborAllocations(form).error ?? "", /completas/);
  const long = new FormData();
  for (let n = 0; n < 101; n++) {
    long.append("allocation_worker", worker);
    long.append("allocation_date", "2026-10-01");
    long.append("allocation_amount", "1.00");
  }
  assert.match(parseLaborAllocations(long).error ?? "", /cien/);
});
test("new correspondence never guesses a work date or allocation from expense date", () => {
  const worker = randomUUID(),
    source = {
      id: randomUUID(),
      version: 1,
      project: randomUUID(),
      worker,
      date: "2026-10-01",
      amountCents: 10001,
      category: "Labor",
      description: "Synthetic Labor",
      status: "APROBADO",
      link: null,
    };
  const html = renderToStaticMarkup(
    createElement(LaborHistoryFields, {
      source,
      workers: [[worker, "Synthetic worker"]],
    }),
  );
  assert.match(html, /Importe original/);
  assert.match(html, /Diferencia/);
  assert.match(html, /fecha de registro no confirma/);
  assert.match(html, /name="allocation_date"[^>]*value=""/);
  assert.match(html, /name="allocation_amount"[^>]*value=""/);
  assert.match(html, /name="allocation_worker" value="/);
});
test("historical read context is tenant scoped, invalidates changed dates and preserves original costs", async (t) => {
  const { db } = await fullDatabase();
  try {
    const f = await receiptReviewFixture(db);
    await db.exec("reset role");
    const source = randomUUID(),
      foreign = randomUUID();
    await db.query(
      `insert into expenses(id,company_id,project_id,worker_id,expense_date,category,description,amount,method,status,created_by,updated_by)
   values($1,$2,$3,$4,$5,'Nómina','Synthetic historical cost',100.01,'OTRO','APROBADO',$6,$6),
   ($7,$8,null,null,$5,'Labor','Foreign synthetic cost',1,'OTRO','APROBADO',$9,$9)`,
      [
        source,
        f.a,
        f.project,
        f.worker.id,
        f.day,
        f.owner,
        foreign,
        f.b,
        f.otherOwner,
      ],
    );
    const hashes = async () =>
      (
        await db.query<{ hash: string }>(
          "select md5(to_jsonb(e)::text) hash from expenses e where id=$1",
          [source],
        )
      ).rows[0].hash;
    const initial = await hashes();
    await f.as(f.owner);
    const context = async (company = f.a) =>
      laborHistorySchema.parse(
        (
          await db.query<{ data: unknown }>(
            "select labor_history_context($1) data",
            [company],
          )
        ).rows[0].data,
      );
    const save = async (
      version: number,
      expenseVersion: number,
      active = true,
      request = randomUUID(),
    ) =>
      db.query(
        "select save_labor_config($1,$2,$3,$4,'HISTORICAL',$5,'Synthetic historical mapping')",
        [
          f.a,
          request,
          source,
          version,
          JSON.stringify({
            expense_version: expenseVersion,
            allocations: [{ worker: f.worker.id, date: f.day, cents: 10001 }],
            active,
          }),
        ],
      );
    await t.test(
      "originals are visible without a mapping and foreign companies are denied",
      async () => {
        const view = await context();
        assert.equal(view.company, f.a);
        assert.equal(view.sources.length, 1);
        assert.equal(view.sources[0].link, null);
        assert.equal(view.sources[0].amountCents, 10001);
        assert.ok(!JSON.stringify(view).includes(foreign));
        await f.as(f.otherOwner);
        await assert.rejects(context(f.b), /permission_denied/);
        await f.as(f.owner);
      },
    );
    await t.test(
      "same request has one mapping/audit, preserving original row and exact cents",
      async () => {
        const request = randomUUID();
        await save(0, 1, true, request);
        await save(0, 1, true, request);
        const view = await context(),
          link = view.sources[0].link;
        assert.ok(link);
        assert.equal(link.version, 1);
        assert.equal(link.matches, true);
        assert.equal(link.updatedBy, f.owner);
        assert.equal(link.allocations[0].cents, 10001);
        assert.equal(await hashes(), initial);
        await assert.rejects(save(0, 1), /record_conflict/);
      },
    );
    await t.test(
      "changed source date withholds supplements until reviewed; disabling retains allocations",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update expenses set expense_date=expense_date+1,version=version+1 where id=$1",
          [source],
        );
        await f.as(f.owner);
        assert.equal((await context()).sources[0].link?.matches, false);
        const raw = laborContextSchema.parse(
          (
            await db.query<{ data: unknown }>("select labor_context($1) data", [
              f.a,
            ])
          ).rows[0].data,
        );
        assert.equal(raw.historical.length, 0);
        assert.equal(raw.unmapped[0].id, source);
        assert.equal(laborReport(raw).complete, false);
        await assert.rejects(save(1, 1), /labor_source_changed/);
        await save(1, 2);
        assert.equal((await context()).sources[0].link?.matches, true);
        await save(2, 2, false);
        const link = (await context()).sources[0].link;
        assert.equal(link?.active, false);
        assert.equal(link?.version, 3);
        assert.equal(link?.allocations[0].cents, 10001);
      },
    );
    await t.test(
      "workers, office and revoked owner cannot inspect wages or correspondences",
      async () => {
        for (const user of [f.worker.user, f.office.user]) {
          await f.as(user);
          await assert.rejects(context(), /permission_denied/);
        }
        await f.as(f.owner);
        await db.query("select set_member_access($1,$2,'member',true,'{}')", [
          f.a,
          f.otherOwner,
        ]);
        await f.as(f.otherOwner);
        await assert.rejects(context(), /permission_denied/);
        await db.exec("reset role;set role anon");
        await assert.rejects(context(), /permission denied/);
      },
    );
  } finally {
    await db.close();
  }
});
