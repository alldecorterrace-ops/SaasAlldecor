-- Read-only verification; no business records or credentials returned.
select c.relname,c.relrowsecurity as rls,
 has_table_privilege('anon',c.oid,'SELECT') as anonymous_table_read,
 has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as direct_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('price_books','designs','client_shares','assistant_settings','assistant_usage','web_forms','web_requests')
order by c.relname;
select proname,has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('save_price_book','save_design','design_to_estimate','create_client_share','revoke_client_share','read_client_share','respond_client_share','configure_assistant','reserve_assistant_request','assistant_context','manage_web_form','web_form_info','submit_web_request','review_web_request')
order by proname;
