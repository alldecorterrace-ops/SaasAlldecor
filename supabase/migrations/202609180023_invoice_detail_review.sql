-- Read-only aggregates from saved invoice details; originals and ledgers stay intact.
begin;
create function app_private.review_money_cents(v jsonb) returns numeric
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v) in ('string','number') and (v#>>'{}') ~ '^\d{1,12}(\.\d{1,2})?$'
 then trunc((v#>>'{}')::numeric * 100) else null end
$$;
revoke all on function app_private.review_money_cents(jsonb) from public,anon,authenticated;

create function public.review_invoice_details(p_company uuid)
returns table(company_id uuid,historical_id uuid,detail_state text,item_count integer,line_sum_cents text,subtotal_cents text,line_difference_cents text,summary_difference_cents text,saved_total_matches boolean)
language plpgsql stable security definer set search_path='' as $$
declare r record;j jsonb;item jsonb;line_sum numeric;amount numeric;subtotal numeric;discount numeric;taxes numeric;total numeric;saved_total numeric;valid boolean;
begin
 if not exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active and m.role in ('owner','admin'))
 or not app_private.can_access(p_company,'fin-invoices','read') then raise exception 'invoice_review_not_allowed' using errcode='42501';end if;
 for r in select s.id,s.original from app_private.historical_business_sources s where s.company_id=p_company and s.kind='invoices' order by s.id loop
  company_id:=p_company;historical_id:=r.id;detail_state:='invalid';item_count:=0;line_sum_cents:=null;subtotal_cents:=null;line_difference_cents:=null;summary_difference_cents:=null;saved_total_matches:=null;
  begin j:=(r.original->>'source_json')::jsonb;exception when invalid_text_representation then j:=null;end;
  if jsonb_typeof(j)='object' and (not(j ? 'items') or j->'items'='[]'::jsonb) then
   detail_state:='missing';return next;continue;
  end if;
  if jsonb_typeof(j) is distinct from 'object' or jsonb_typeof(j->'items') is distinct from 'array' then return next;continue;end if;
  item_count:=jsonb_array_length(j->'items');
  if item_count not between 1 and 100 then return next;continue;end if;
  subtotal:=app_private.review_money_cents(j->'subtotal');discount:=app_private.review_money_cents(j->'discount');taxes:=app_private.review_money_cents(j->'taxes');
  total:=app_private.review_money_cents(r.original->'total');saved_total:=app_private.review_money_cents(j->'total');
  line_sum:=0;valid:=true;
  for item in select value from jsonb_array_elements(j->'items') loop
   amount:=app_private.review_money_cents(item->'price');
   if jsonb_typeof(item) is distinct from 'object' or amount is null or jsonb_typeof(item->'label') is distinct from 'string' or length(btrim(item->>'label')) not between 1 and 255 or jsonb_typeof(item->'spec') is distinct from 'string' or length(item->>'spec')>2000 then valid:=false;end if;
   line_sum:=line_sum+amount;
  end loop;
  if valid then line_sum_cents:=line_sum::text;end if;
  subtotal_cents:=subtotal::text;
  if valid and subtotal is not null then line_difference_cents:=(line_sum-subtotal)::text;end if;
  if subtotal is not null and discount is not null and taxes is not null and total is not null then summary_difference_cents:=(subtotal-discount+taxes-total)::text;end if;
  if total is not null and saved_total is not null then saved_total_matches:=total=saved_total;end if;
  if valid and subtotal is not null and discount is not null and taxes is not null and total is not null and saved_total is not null and discount<=subtotal then detail_state:='saved_lines';end if;
  return next;
 end loop;
end;$$;
revoke all on function public.review_invoice_details(uuid) from public,anon;
grant execute on function public.review_invoice_details(uuid) to authenticated;
commit;
