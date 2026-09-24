-- Read-only evidence after the fresh staging bootstrap. Check the connection first.
-- Compare history_sha256 with the same digest of reviewed LF-normalized source.
select count(*) as versions,
  encode(sha256(convert_to(string_agg(version || ':' ||
    encode(sha256(convert_to(statements[1], 'UTF8')), 'hex'),
    '|' order by version), 'UTF8')), 'hex') as history_sha256
from supabase_migrations.schema_migrations;

select
  (select count(*) from public.module_catalog) as modules,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) as no_rls,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and has_table_privilege('anon',c.oid,'SELECT')) as anon_read,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')) as direct_write,
  (select count(*) from storage.buckets where public) as public_buckets;

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.companies) as companies,
  (select count(*) from storage.objects) as objects,
  (select count(*) from app_private.transition_controls where phase<>'disabled') as active_queues,
  (select count(*) from app_private.operation_requests) as requests,
  (select count(*) from app_private.operation_adapters where verified) as verified_adapters;

select count(*) as private_tables,
  count(*) filter (where not c.relrowsecurity) as no_rls,
  count(*) filter (where has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) as client_grants
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='app_private' and c.relkind='r';

-- document_counters currently has owner-only privileges and no RLS. Enumerate
-- exceptions explicitly; do not confuse private schema access with public RLS.
select c.relname,c.relrowsecurity,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='app_private' and c.relkind='r' and not c.relrowsecurity;

select id,public from storage.buckets order by id;
