import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { historicalDocumentPayload } from "../src/lib/migration/historical-document-payload";
import { historicalBusinessPayload } from "../src/lib/migration/historical-business-payload";
import { historicalEstimatePayload } from "../src/lib/migration/historical-estimate-payload";
import { HistoricalDocumentDetail } from "../src/components/historical-document-detail";
import { readHistoricalPdf } from "../src/lib/historical-pdf";
import { fullDatabase } from "./helpers/full-database";
function fixture() {
  return {
    format: "adt-history-snapshot-v1",
    origin: "restored_snapshot",
    clients: [
      { external_id: "c", full_name: "Synthetic" },
      { external_id: "other", full_name: "Other" },
    ],
    estimates: [
      {
        external_id: "e",
        client_external_id: "c",
        total: "10.00",
        discount: "0.00",
        taxes: "0.00",
        source_json: '{"items":[]}',
      },
    ],
    projects: [
      { external_id: "p", client_external_id: "other", total: "0.00" },
    ],
    items: [],
    invoices: [],
    payments: [],
    documents: [
      {
        id: "1",
        kind: "estimado",
        file_name: "Original.pdf",
        estimate_external_id: "e",
        client_external_id: "c",
        url: "PRIVATE_URL",
        created: "100",
      },
      {
        id: "2",
        file_name: "Missing.pdf",
        estimate_external_id: "missing",
        client_external_id: "c",
      },
      {
        id: "3",
        file_name: "Conflicting.pdf",
        estimate_external_id: "e",
        project_external_id: "p",
      },
    ],
    contracts: [
      {
        external_id: "contract",
        estimate_external_id: "e",
        client_external_id: "c",
        estimate_no: "OLD-1",
        status: "signed",
        total: "10.00",
        signed_at: "200",
        token: "PRIVATE_TOKEN",
        signed_html: "<script>PRIVATE_HTML</script>",
        signature_b64: "PRIVATE_SIGNATURE",
      },
    ],
  };
}
function manifest() {
  return {
    records: [
      ...["1", "2", "3"].map((id) => ({
        kind: "documents",
        source_id: id,
        file_state: "available",
        file_sha256: "a".repeat(64),
        file_bytes: 100,
      })),
      {
        kind: "contracts",
        source_id: "contract",
        file_state: "no_source",
        file_sha256: null,
        file_bytes: null,
      },
    ],
  };
}
test("document projection keeps originals private and detaches all ambiguous links", () => {
  const source = fixture(),
    p = historicalDocumentPayload(source, manifest(), randomUUID());
  assert.equal(
    p.records.filter((r) => r.presentation.relation_state === "review").length,
    2,
  );
  for (const r of p.records.filter(
    (r) => r.presentation.relation_state === "review",
  ))
    assert.deepEqual(
      [r.client_id, r.project_id, r.estimate_id],
      [null, null, null],
    );
  const conflict = p.records.find((r) => r.source_id === "3")!;
  assert.ok(
    conflict.presentation.review_reasons.includes("related_client_conflict"),
  );
  const c = p.records.find((r) => r.kind === "contracts")!;
  assert.deepEqual(c.original, source.contracts[0]);
  assert.equal(c.presentation.amount_cents, "1000");
  assert.equal(c.presentation.signed_date, "1970-01-01T00:03:20.000Z");
  assert.ok(c.presentation.has_signature);
  assert.ok(
    !JSON.stringify(p.records.map((r) => r.presentation)).includes("PRIVATE"),
  );
  const files = manifest();
  files.records[0].file_sha256 = null;
  assert.throws(
    () => historicalDocumentPayload(source, files, randomUUID()),
    /invalid_archive_file_manifest/,
  );
});
test("document presentation escapes markup and offers no signing or mutation flow", () => {
  const p = historicalDocumentPayload(fixture(), manifest(), randomUUID())
    .records[0].presentation;
  p.title = '<img src=x onerror="alert(1)">';
  const html = renderToStaticMarkup(
    createElement(HistoricalDocumentDetail, {
      record: p,
      fileState: "no_source",
    }),
  );
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("Sin PDF indicado"));
});
test("PDF reader validates private content address, byte count, PDF header and corruption", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "saas-history-pdf-"));
  try {
    const data = Buffer.from("%PDF-1.4\nsynthetic fixture\n%%EOF"),
      hash = createHash("sha256").update(data).digest("hex"),
      file = path.join(dir, hash + ".pdf");
    await writeFile(file, data);
    assert.deepEqual(await readHistoricalPdf(dir, hash, data.length), data);
    await assert.rejects(readHistoricalPdf(dir, "../outside", data.length));
    await assert.rejects(readHistoricalPdf(dir, hash, data.length + 1));
    await assert.rejects(readHistoricalPdf(dir, hash, 21 * 1024 * 1024));
    const changed = Buffer.from(data);
    changed[12] = 42;
    await writeFile(file, changed);
    await assert.rejects(readHistoricalPdf(dir, hash, data.length));
    const html = Buffer.from("<html>not a PDF</html>"),
      htmlHash = createHash("sha256").update(html).digest("hex");
    await writeFile(path.join(dir, htmlHash + ".pdf"), html);
    await assert.rejects(readHistoricalPdf(dir, htmlHash, html.length));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("document archive enforces quarantine, tenant boundaries, read-only roles and atomic repeatable import", async (t) => {
  const { db } = await fullDatabase(),
    company = randomUUID(),
    foreign = randomUUID(),
    owner = randomUUID(),
    staff = randomUUID(),
    other = randomUUID(),
    source = fixture();
  const payload = historicalDocumentPayload(source, manifest(), company),
    business = historicalBusinessPayload(source, company),
    estimates = historicalEstimatePayload(source, company);
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
  };
  const load = (records = payload.records) =>
    db.query<{ result: unknown }>(
      "select app_private.import_historical_documents($1,$2,$3) result",
      [company, payload.snapshotSha256, JSON.stringify(records)],
    );
  try {
    for (const [id, email] of [
      [owner, "document-owner@example.test"],
      [staff, "document-staff@example.test"],
      [other, "document-other@example.test"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await as(owner);
    await db.query("select public.create_company($1,'Documents A')", [company]);
    await db.query(
      "select public.add_company_member($1,'document-staff@example.test')",
      [company],
    );
    await as(other);
    await db.query("select public.create_company($1,'Documents B')", [foreign]);
    await db.exec("reset role");
    await db.query("select app_private.import_historical_estimates($1,$2,$3)", [
      company,
      estimates.snapshotSha256,
      JSON.stringify(estimates.records),
    ]);
    await db.query("select app_private.import_historical_business($1,$2,$3)", [
      company,
      business.snapshotSha256,
      JSON.stringify(business.records),
    ]);
    await t.test(
      "preserves signed sources and repeats without changing active tables",
      async () => {
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 4,
          unchanged: 0,
        });
        assert.deepEqual((await load()).rows[0].result, {
          inserted: 0,
          unchanged: 4,
        });
        const raw = await db.query<{ original: unknown }>(
          "select original from app_private.historical_document_sources where kind='contracts'",
        );
        assert.deepEqual(raw.rows[0].original, source.contracts[0]);
        for (const table of ["customers", "projects", "invoices", "payments"])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
      },
    );
    await t.test(
      "rejects cross-tenant links, quarantine attachments and changed source rollback",
      async () => {
        const held = payload.records.find(
            (r) => r.presentation.relation_state === "review",
          )!,
          client = business.records.find((r) => r.kind === "clients")!;
        await assert.rejects(
          db.query(
            "update public.historical_documents set client_id=$1 where id=$2",
            [client.id, held.id],
          ),
          /check constraint/,
        );
        const wrong = structuredClone(
          payload.records.find((r) => r.kind === "contracts")!,
        );
        wrong.client_id = randomUUID();
        wrong.id = randomUUID();
        wrong.source_id = "wrong";
        wrong.original.external_id = "wrong";
        await assert.rejects(load([wrong]), /foreign key/);
        const added = structuredClone(held);
        added.id = randomUUID();
        added.source_id = "added";
        added.original.id = "added";
        const changed = structuredClone(payload.records[0]);
        changed.original.token = "CHANGED";
        await assert.rejects(
          load([added, changed]),
          /historical_document_conflict/,
        );
        assert.equal(
          (await db.query("select * from public.historical_documents")).rows
            .length,
          4,
        );
        Object.assign(added.presentation, { token: "PRIVATE" });
        await assert.rejects(load([added]), /invalid_document_record/);
        const fp = historicalDocumentPayload(source, manifest(), foreign);
        await assert.rejects(
          db.query("select app_private.import_historical_documents($1,$2,$3)", [
            foreign,
            fp.snapshotSha256,
            JSON.stringify([
              {
                ...fp.records.find((r) => r.kind === "contracts")!,
                client_id: client.id,
              },
            ]),
          ]),
          /foreign key/,
        );
      },
    );
    await t.test(
      "staff sees consistent records only; owner sees review; revocation removes access",
      async () => {
        await as(owner);
        assert.equal(
          (await db.query("select * from public.historical_documents")).rows
            .length,
          4,
        );
        await db.query(
          "select public.set_member_access($1,$2,'member',true,$3)",
          [company, staff, JSON.stringify({ "fin-estimados": ["read"] })],
        );
        await as(staff);
        const visible = await db.query<{ relation_state: string }>(
          "select relation_state from public.historical_documents",
        );
        assert.equal(visible.rows.length, 2);
        assert.ok(visible.rows.every((r) => r.relation_state === "linked"));
        await assert.rejects(
          db.query("select * from app_private.historical_document_sources"),
          /permission denied/,
        );
        await assert.rejects(load(), /permission denied/);
        await assert.rejects(
          db.query("delete from public.historical_documents"),
          /permission denied/,
        );
        await as(owner);
        await db.query(
          "select public.set_member_access($1,$2,'member',true,'{}')",
          [company, staff],
        );
        await as(staff);
        assert.equal(
          (await db.query("select * from public.historical_documents")).rows
            .length,
          0,
        );
        await as(other);
        assert.equal(
          (await db.query("select * from public.historical_documents")).rows
            .length,
          0,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(
          db.query("select * from public.historical_documents"),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
