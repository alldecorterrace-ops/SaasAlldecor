-- Read-only verification. No personal or document content returned.
select relname,relrowsecurity as rls,
 has_table_privilege('anon',oid,'SELECT') as anonymous_read,
 has_table_privilege('authenticated',oid,'INSERT') as direct_insert,
 has_table_privilege('authenticated',oid,'UPDATE') as direct_update,
 has_table_privilege('authenticated',oid,'DELETE') as direct_delete
from pg_class where oid in ('public.invoices'::regclass,'public.projects'::regclass,'public.payments'::regclass,'public.workers'::regclass,'public.expenses'::regclass);
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='expense-receipts';
