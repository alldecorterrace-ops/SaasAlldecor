-- Read-only checks. No personal records or document content returned.
select
 (select count(*) from public.companies) as companies,
 (select count(*) from public.customers) as customers,
 (select count(*) from public.leads) as leads,
 (select count(*) from public.products) as products,
 (select count(*) from public.estimates) as estimates,
 (select count(*) from public.estimate_revisions) as revisions,
 (select bool_and(relrowsecurity) from pg_class where oid in ('public.estimates'::regclass,'public.estimate_revisions'::regclass)) as estimates_rls,
 has_table_privilege('anon','public.estimates','SELECT') as anonymous_read,
 has_table_privilege('authenticated','public.estimates','UPDATE') as direct_update,
 has_table_privilege('authenticated','public.estimate_revisions','DELETE') as history_delete,
 has_table_privilege('authenticated','app_private.document_counters','SELECT') as private_counter_read,
 has_function_privilege('anon','public.save_estimate(uuid,uuid,integer,jsonb)','EXECUTE') as anonymous_save,
 has_function_privilege('authenticated','public.save_estimate(uuid,uuid,integer,jsonb)','EXECUTE') as authenticated_save;
