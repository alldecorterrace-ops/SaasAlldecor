-- Read-only post-install verification. Contains no credentials or business records.
select
 (select count(*) from public.module_catalog) as catalog_modules,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('companies','memberships','customers','audit_events','module_catalog') and c.relkind='r') as foundation_tables,
 (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('companies','memberships','customers','audit_events','module_catalog')) as all_rls_enabled,
 has_table_privilege('anon','public.customers','SELECT') as anonymous_customer_read,
 has_table_privilege('authenticated','public.customers','UPDATE') as direct_customer_update,
 has_function_privilege('anon','public.create_company(uuid,text)','EXECUTE') as anonymous_company_create,
 (select count(*) from public.companies) as companies,
 (select count(*) from public.customers) as customers;
