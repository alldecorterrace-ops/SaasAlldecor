-- Read-only post-migration checks; no personal records returned.
select
 (select count(*) from public.companies) as companies,
 (select count(*) from public.customers) as customers,
 (select count(*) from public.leads) as leads,
 (select count(*) from public.products) as products,
 (select bool_and(relrowsecurity) from pg_class where oid in ('public.leads'::regclass,'public.products'::regclass)) as commercial_rls,
 has_table_privilege('anon','public.leads','SELECT') as anonymous_lead_read,
 has_table_privilege('authenticated','public.products','UPDATE') as direct_product_update,
 has_function_privilege('anon','public.convert_lead(uuid,uuid,integer)','EXECUTE') as anonymous_conversion,
 (select not public and file_size_limit=1500000 from storage.buckets where id='product-images') as private_image_bucket,
 (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('product_image_read','product_image_insert')) as image_policies;
