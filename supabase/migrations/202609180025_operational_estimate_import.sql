-- Reviewed historical estimates in the main module, without new approvals.
begin;
alter table public.estimates add column historical_estimate_id uuid;
alter table public.estimates add column historical_terms jsonb;
alter table public.estimates add foreign key(company_id,historical_estimate_id) references public.historical_estimates(company_id,id);
alter table public.estimates add unique(company_id,historical_estimate_id);
alter table public.estimates drop constraint estimates_status_check;
alter table public.estimates add constraint estimates_status_check check(
 status in ('BORRADOR','PENDIENTE','RECHAZADO','ANULADA','APROBADO') or
 (status='ENVIADO' and historical_estimate_id is not null));
create table app_private.operational_estimate_imports(
 company_id uuid not null,historical_id uuid not null,estimate_id uuid not null,
 expected jsonb not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(company_id,historical_id),
 foreign key(company_id,historical_id) references public.historical_estimates(company_id,id),
 foreign key(company_id,estimate_id) references public.estimates(company_id,id)
);
alter table app_private.operational_estimate_imports enable row level security;
revoke all on app_private.operational_estimate_imports from public,anon,authenticated;

-- Also protects against direct RPC calls, including attempts to reapprove a copy.
create function app_private.lock_imported_estimate() returns trigger language plpgsql set search_path='' as $$
begin
 if OLD.historical_estimate_id is not null then raise exception 'historical_estimate_locked';end if;
 return NEW;
end;$$;
revoke all on function app_private.lock_imported_estimate() from public,anon,authenticated;
create trigger historical_estimate_lock before update on public.estimates for each row execute function app_private.lock_imported_estimate();

create function app_private.import_operational_estimate(p_company uuid,p_actor uuid,p_historical uuid,p_expected jsonb) returns jsonb
language plpgsql set search_path='' set timezone='UTC' as $$
declare h public.historical_estimates;original jsonb;o jsonb;j jsonb;source_hash text;
 prior app_private.operational_estimate_imports;cid uuid;eid uuid:=gen_random_uuid();
 subtotal numeric;discount numeric;taxes numeric;total numeric;amount numeric;line_sum numeric:=0;
 line jsonb;items jsonb:='[]';projection jsonb:='[]';terms jsonb:='{}';k text;v jsonb;
begin
 if p_expected is null or jsonb_typeof(p_expected)<>'object' or not(p_expected ?& array['source_sha256','customer_id']) or (select count(*) from jsonb_object_keys(p_expected))<>2 then raise exception 'invalid_estimate_import_expectation';end if;
 if p_actor is distinct from auth.uid() or not exists(select 1 from public.memberships where company_id=p_company and user_id=p_actor and active and role in ('owner','admin')) then raise exception 'estimate_import_actor_not_manager';end if;
 lock table public.estimates,public.customers,public.historical_customer_migrations in share row exclusive mode;
 perform id from public.companies where id=p_company for update;
 select * into prior from app_private.operational_estimate_imports where company_id=p_company and historical_id=p_historical;
 if found then
  if prior.expected is distinct from p_expected then raise exception 'estimate_import_plan_changed';end if;
  return jsonb_build_object('estimate_id',prior.estimate_id,'inserted',0,'unchanged',1);
 end if;
 select * into strict h from public.historical_estimates where company_id=p_company and id=p_historical;
 select s.original,s.source_sha256 into strict original,source_hash from app_private.historical_estimate_sources s where company_id=p_company and id=p_historical;
 if source_hash is distinct from p_expected->>'source_sha256' then raise exception 'estimate_source_changed';end if;
 o:=original->'estimate';j:=(o->>'source_json')::jsonb;
 if h.presentation->'review_reasons' is distinct from '[]'::jsonb or h.presentation->>'difference_cents' is distinct from '0' or o->>'status' is null or o->>'status' not in ('APROBADO','ENVIADO') then raise exception 'estimate_source_requires_review';end if;
 select m.customer_id into strict cid from public.historical_business b join public.historical_customer_migrations m on m.company_id=b.company_id and m.historical_id=b.id
 where b.company_id=p_company and b.kind='clients' and b.source_id=o->>'client_external_id' and m.state='imported';
 if cid::text is distinct from p_expected->>'customer_id' or not exists(select 1 from public.customers where company_id=p_company and id=cid) then raise exception 'estimate_destination_changed';end if;
 if jsonb_typeof(o->'consecutive') is distinct from 'string' or length(btrim(o->>'consecutive')) not between 1 and 100 or o->>'consecutive'<>btrim(o->>'consecutive') or exists(select 1 from public.estimates where company_id=p_company and number=o->>'consecutive') or exists(select 1 from public.historical_estimates where company_id=p_company and id<>p_historical and number=o->>'consecutive') then raise exception 'estimate_number_requires_review';end if;
 if coalesce(o->>'estimate_date','')!~'^\d{4}-\d{2}-\d{2}$' or to_char((o->>'estimate_date')::date,'YYYY-MM-DD')<>o->>'estimate_date' then raise exception 'invalid_estimate_import_date';end if;
 if jsonb_typeof(o->'notes') is distinct from 'string' or length(o->>'notes')>10000 then raise exception 'invalid_estimate_import_notes';end if;
 if jsonb_typeof(j) is distinct from 'object' or jsonb_typeof(j->'items') is distinct from 'array' or jsonb_array_length(j->'items') not between 1 and 100 then raise exception 'estimate_saved_items_required';end if;
 total:=app_private.invoice_import_money(o->'total');discount:=app_private.invoice_import_money(o->'discount');taxes:=app_private.invoice_import_money(o->'taxes');subtotal:=app_private.invoice_import_money(j->'subtotal');
 if app_private.invoice_import_money(j->'total')<>total or app_private.invoice_import_money(j->'discount')<>discount or app_private.invoice_import_money(j->'taxes')<>taxes or subtotal-discount+taxes<>total or discount>subtotal then raise exception 'estimate_amounts_require_review';end if;
 foreach k in array array['nombre','email','telefono','direccion'] loop
  if jsonb_typeof(j->k) is distinct from 'string' or length(j->>k)>2000 then raise exception 'estimate_customer_snapshot_required';end if;
 end loop;
 if length(btrim(j->>'nombre'))=0 then raise exception 'estimate_customer_snapshot_required';end if;
 for line in select value from jsonb_array_elements(j->'items') loop
  if jsonb_typeof(line) is distinct from 'object' or jsonb_typeof(line->'label') is distinct from 'string' or length(btrim(line->>'label')) not between 1 and 255 or jsonb_typeof(line->'spec') is distinct from 'string' or length(line->>'spec')>2000 then raise exception 'invalid_estimate_import_line';end if;
  amount:=app_private.invoice_import_money(line->'price');line_sum:=line_sum+amount;
  projection:=projection||jsonb_build_array(jsonb_build_object('description',line->>'label','specification',line->>'spec','amount_cents',(amount*100)::bigint::text));
  -- Fixed saved amount; the imported-document UI displays only the original detail.
  items:=items||jsonb_build_array(jsonb_build_object('product_id',null,'name',line->>'label','description',line->>'spec','base','fixed','qty','1','length','0','width','0','height','0','manual_total','0.00','unit_price',amount::text,'line_total',amount::text));
 end loop;
 if line_sum<>subtotal or projection is distinct from h.presentation->'lines' then raise exception 'estimate_effective_lines_require_review';end if;
 -- Business terms only: never publish source JSON, motor data or arbitrary keys.
 foreach k in array array['condiciones','fecha_entrega','deposit_pct','deposit','tax_pct','pagado','pagos_pct'] loop
  if not(j ? k) then continue;end if;v:=j->k;
  if k in ('condiciones','fecha_entrega') then
   if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>10000 then raise exception 'invalid_estimate_terms';end if;
  elsif k='pagos_pct' then
   if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>20 then raise exception 'invalid_estimate_terms';end if;
   for v in select value from jsonb_array_elements(j->k) loop
    if app_private.invoice_import_money(v)>100 then raise exception 'invalid_estimate_terms';end if;
   end loop;
  else
   perform app_private.invoice_import_money(v);
  end if;
  terms:=terms||jsonb_build_object(k,j->k);
 end loop;
 insert into public.estimates(id,company_id,number,customer_id,customer_snapshot,estimate_date,status,notes,items,subtotal,discount,taxes,total,historical_estimate_id,historical_terms,created_by,updated_by)
 values(eid,p_company,o->>'consecutive',cid,jsonb_build_object('full_name',j->>'nombre','email',j->>'email','phone',j->>'telefono','address',j->>'direccion','city','','postal_code',''),(o->>'estimate_date')::date,o->>'status',o->>'notes',items,subtotal,discount,taxes,total,p_historical,terms,p_actor,p_actor);
 insert into app_private.operational_estimate_imports(company_id,historical_id,estimate_id,expected,actor_id) values(p_company,p_historical,eid,p_expected,p_actor);
 return jsonb_build_object('estimate_id',eid,'inserted',1,'unchanged',0);
end;$$;
revoke all on function app_private.import_operational_estimate(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
commit;
