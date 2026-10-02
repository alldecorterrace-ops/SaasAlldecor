import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { workspaces } from "../src/lib/workspaces";
import {
  workDocument,
  type WorkDocumentClient,
} from "../src/lib/work-document";

const company = randomUUID(),
  record = randomUUID(),
  attachment = randomUUID();
const path = `${company}/${record}/${attachment}.pdf`;
const bytes = Buffer.from("%PDF-1.7\nSYNTHETIC PRIVATE DOCUMENT\n%%EOF");
function fixture(
  options: {
    user?: boolean;
    record?: unknown;
    file?: unknown;
    error?: boolean;
    blob?: Blob;
  } = {},
) {
  let downloads = 0,
    queries = 0;
  const client: WorkDocumentClient = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === false ? null : { id: "synthetic" } },
        error: null,
      }),
    },
    from(table) {
      return {
        select() {
          const filters: Record<string, string> = {};
          const query = {
            eq(key: string, value: string) {
              filters[key] = value;
              return query;
            },
            async maybeSingle() {
              queries++;
              assert.equal(filters.company_id, company);
              if (table === "work_records") {
                assert.equal(filters.id, record);
                assert.equal(filters.kind, "inventory");
                return {
                  data:
                    "record" in options
                      ? options.record
                      : { id: record, company_id: company, kind: "inventory" },
                  error: options.error ? { code: "unavailable" } : null,
                };
              }
              assert.equal(filters.id, attachment);
              assert.equal(filters.record_id, record);
              return {
                data:
                  "file" in options
                    ? options.file
                    : {
                        id: attachment,
                        company_id: company,
                        record_id: record,
                        path,
                        name: "QA Peña 'documento'.pdf",
                      },
                error: null,
              };
            },
          };
          return query;
        },
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "work-files");
        return {
          download: async (requested) => {
            assert.equal(requested, path);
            downloads++;
            return {
              data:
                options.blob ?? new Blob([bytes], { type: "application/pdf" }),
              error: null,
            };
          },
        };
      },
    },
  };
  return { client, counts: () => ({ downloads, queries }) };
}
test("authenticated work download returns original bytes without a reusable token or cache", async () => {
  const f = fixture();
  const response = await workDocument(
    company,
    "inventory",
    record,
    attachment,
    async () => f.client,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
  assert.match(
    response.headers.get("content-disposition")!,
    /Pe%C3%B1a%20%27documento%27/,
  );
  assert.match(response.headers.get("content-security-policy")!, /sandbox/);
  assert.deepEqual(f.counts(), { downloads: 1, queries: 2 });
});
test("unavailable session, record, wrong kind or mismatched file never reaches Storage", async () => {
  for (const [options, status] of [
    [{ user: false }, 401],
    [{ record: null }, 404],
    [{ file: null }, 404],
    [{ error: true }, 503],
    [
      { record: { id: record, company_id: randomUUID(), kind: "inventory" } },
      503,
    ],
    [{ record: { id: record, company_id: company, kind: "manuals" } }, 503],
    [
      {
        file: {
          id: attachment,
          company_id: company,
          record_id: randomUUID(),
          path,
          name: "a.pdf",
        },
      },
      503,
    ],
    [
      {
        file: {
          id: randomUUID(),
          company_id: company,
          record_id: record,
          path,
          name: "a.pdf",
        },
      },
      503,
    ],
    [
      {
        file: {
          id: attachment,
          company_id: company,
          record_id: record,
          path: `${company}/${record}/../secret.pdf`,
          name: "a.pdf",
        },
      },
      503,
    ],
  ] as const) {
    const f = fixture(options);
    assert.equal(
      (
        await workDocument(
          company,
          "inventory",
          record,
          attachment,
          async () => f.client,
        )
      ).status,
      status,
    );
    assert.equal(f.counts().downloads, 0);
  }
});
test("bad identifiers and module fail before connection; binary failures never return content", async () => {
  const never = async (): Promise<WorkDocumentClient> => {
    throw new Error("must not connect");
  };
  assert.equal(
    (await workDocument("bad", "inventory", record, attachment, never)).status,
    404,
  );
  assert.equal(
    (await workDocument(company, "unknown", record, attachment, never)).status,
    404,
  );
  for (const blob of [
    new Blob([bytes], { type: "text/html" }),
    new Blob(["<script>"], { type: "application/pdf" }),
    new Blob([], { type: "application/pdf" }),
    new Blob([new Uint8Array(5000001)], { type: "application/pdf" }),
  ]) {
    const f = fixture({ blob });
    assert.equal(
      (
        await workDocument(
          company,
          "inventory",
          record,
          attachment,
          async () => f.client,
        )
      ).status,
      503,
    );
  }
});

test("the same private link obeys real SQL RLS after revocation, including a race before download", async () => {
  const { db } = await fullDatabase();
  const owner = randomUUID(),
    tenant = randomUUID(),
    item = randomUUID(),
    file = randomUUID();
  const objectPath = `${tenant}/${item}/${file}.pdf`;
  const asCaller = async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
  };
  let revokeBeforeStorage = false,
    reads = 0;
  const connect = async (): Promise<WorkDocumentClient> => ({
    auth: {
      getUser: async () => ({ data: { user: { id: owner } }, error: null }),
    },
    from(table) {
      return {
        select() {
          const filters: Record<string, string> = {};
          const query = {
            eq(column: string, value: string) {
              filters[column] = value;
              return query;
            },
            async maybeSingle() {
              assert.deepEqual(
                Object.keys(filters).sort(),
                table === "work_records"
                  ? ["company_id", "id", "kind"]
                  : ["company_id", "id", "record_id"],
              );
              const result = await db.query(
                `select * from public.${table} where company_id=$1 and id=$2 and ${table === "work_records" ? "kind" : "record_id"}=$3`,
                [
                  filters.company_id,
                  filters.id,
                  filters[table === "work_records" ? "kind" : "record_id"],
                ],
              );
              return { data: result.rows[0] ?? null, error: null };
            },
          };
          return query;
        },
      };
    },
    storage: {
      from() {
        return {
          download: async (path) => {
            if (revokeBeforeStorage) {
              await db.exec("reset role");
              await db.query(
                "update memberships set active=false where company_id=$1 and user_id=$2",
                [tenant, owner],
              );
              await asCaller();
            }
            const result = await db.query(
              "select name from storage.objects where bucket_id='work-files' and name=$1",
              [path],
            );
            if (!result.rows.length)
              return { data: null, error: { code: "denied" } };
            reads++;
            return {
              data: new Blob([bytes], { type: "application/pdf" }),
              error: null,
            };
          },
        };
      },
    },
  });
  try {
    await db.query(
      "insert into auth.users values($1,'doc-owner@example.test',now())",
      [owner],
    );
    await asCaller();
    await db.query("select create_company($1,'Private documents synthetic')", [
      tenant,
    ]);
    await db.query("select save_work_record($1,$2,0,'inventory',$3)", [
      tenant,
      item,
      JSON.stringify({
        name: "Synthetic private item",
        status: "ACTIVO",
        data: workspaces.inventory.defaults,
      }),
    ]);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('work-files',$1)",
      [objectPath],
    );
    await db.query(
      "select set_work_attachment($1,$2,1,$3,$4,'Synthetic.pdf',true)",
      [tenant, item, file, objectPath],
    );
    const original = (
      await db.query(
        "select to_jsonb(w) data from work_attachments w where id=$1",
        [file],
      )
    ).rows[0];
    assert.equal(
      (await workDocument(tenant, "inventory", item, file, connect)).status,
      200,
    );
    assert.equal(reads, 1);
    assert.equal(
      (await workDocument(randomUUID(), "inventory", item, file, connect))
        .status,
      404,
    );
    assert.equal(
      (await workDocument(tenant, "manuals", item, file, connect)).status,
      404,
    );
    assert.equal(reads, 1);
    revokeBeforeStorage = true;
    assert.equal(
      (await workDocument(tenant, "inventory", item, file, connect)).status,
      503,
    );
    assert.equal(reads, 1);
    revokeBeforeStorage = false;
    assert.equal(
      (await workDocument(tenant, "inventory", item, file, connect)).status,
      404,
    );
    assert.equal(reads, 1);
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select to_jsonb(w) data from work_attachments w where id=$1",
          [file],
        )
      ).rows[0],
      original,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from invoices union all select count(*)::int n from payments union all select count(*)::int n from expenses",
        )
      ).rows.every((r) => r.n === 0),
      true,
    );
  } finally {
    await db.close();
  }
});
