begin;
-- The rows, pending count and confirmation stamp on the same screen describe one database snapshot.
create function public.inventory_opening_page(p_company uuid,p_pending boolean,p_page integer) returns jsonb
language sql stable security definer set search_path='' as $$
 with all_rows as materialized(select * from public.inventory_opening_review(p_company)),
 shown as materialized(select * from all_rows where not p_pending or review_status not in ('LISTO','SIN_SALDO')),
 page as (select * from shown order by item_name,item_id limit 20 offset (greatest(1,least(p_page,100000))-1)*20)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p) order by p.item_name,p.item_id),'[]') from page p),
   'count',(select count(*) from shown),'pending',(select count(*) from all_rows where review_status not in ('LISTO','SIN_SALDO')),
   'stamp',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.item_id),'[]')::text) from all_rows r));
$$;
create function public.inventory_count_sheet(p_company uuid,p_query text,p_location uuid,p_empty boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('asOf',statement_timestamp(),'rows',coalesce(jsonb_agg(jsonb_build_object('sku',r.sku,'product',r.variant_name,'location',r.location_name,'qty',r.quantity,'unit',r.unit)
       order by r.family_name,r.family_id,r.sku,r.variant_id,r.location_name,r.location_id),'[]'))
 from public.inventory_count_rows(p_company,p_query,p_location,p_empty) r;
$$;
revoke all on function public.inventory_opening_page(uuid,boolean,integer),public.inventory_count_sheet(uuid,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.inventory_opening_page(uuid,boolean,integer),public.inventory_count_sheet(uuid,text,uuid,boolean) to authenticated;
commit;
