import { createHash } from "node:crypto";

/** Produce a single atomic bootstrap for a confirmed NEW staging project.
 * Version history is installed in the same transaction as the actual schema.
 * Existing applications, users, objects or migration history are never reset. */
export function stagingBootstrap(files: { name: string; sql: string }[]) {
  if (!files.length) throw new Error("Faltan migraciones");
  const seen = new Set<string>();
  const entries = files
    .map(({ name, sql }) => {
      const match = /^(\d{12,14})_([a-z0-9_]+)\.sql$/.exec(name);
      if (!match || seen.has(match[1]))
        throw new Error("Identificador de migración inválido o repetido");
      seen.add(match[1]);
      const normalized = sql.replace(/\r\n/g, "\n");
      // The reviewed repository migrations have exactly one top-level wrapper.
      // Refuse unfamiliar transaction syntax instead of modifying a function body.
      if (
        (normalized.match(/^begin;\s*$/gm) ?? []).length !== 1 ||
        (normalized.match(/^commit;\s*$/gm) ?? []).length !== 1 ||
        !/^(?:\s*--[^\n]*\n)*\s*begin;/i.test(normalized) ||
        !/commit;\s*$/.test(normalized)
      )
        throw new Error("Migración sin envoltura transaccional reconocida");
      const body = normalized
        .replace(/^begin;\s*$/m, "")
        .replace(/^commit;\s*$/m, "");
      const sha = createHash("sha256").update(normalized).digest("hex");
      const tag = `$migration_${sha}$`;
      if (normalized.includes(tag)) throw new Error("Delimitador ambiguo");
      return {
        version: match[1],
        name: match[2],
        body,
        sql: normalized,
        tag,
        sha,
      };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
  return `-- NEW STAGING ONLY. Connection must be checked separately against the intended project.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
do $guard$
begin
  if exists(select 1 from information_schema.tables where table_schema='public' and table_type='BASE TABLE')
     or exists(select 1 from pg_namespace where nspname='app_private')
     or exists(select 1 from auth.users) or exists(select 1 from storage.objects)
     or exists(select 1 from storage.buckets) then
    raise exception 'staging_must_be_empty';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if exists(select 1 from supabase_migrations.schema_migrations) then
      raise exception 'migration_history_must_be_empty';
    end if;
  end if;
end;
$guard$;
create schema if not exists supabase_migrations;
revoke all on schema supabase_migrations from public,anon,authenticated;
create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text);
revoke all on supabase_migrations.schema_migrations from public,anon,authenticated;
${entries.map((entry) => `-- Migration ${entry.version}: ${entry.name}; SHA256 ${entry.sha}\n${entry.body}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${entry.version}','${entry.name}',array[${entry.tag}${entry.sql}${entry.tag}]);`).join("\n")}
commit;
select count(*) as applied_migrations from supabase_migrations.schema_migrations;
`;
}
