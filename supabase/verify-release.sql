-- Read-only checks against the composed production schema. No business rows.
select
  (select count(*) from public.module_catalog) as modules,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) as public_tables_without_rls,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and has_table_privilege('anon',c.oid,'SELECT')) as anonymous_readable_tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')) as directly_writable_tables,
  (select count(*) from storage.buckets where public) as public_buckets;
