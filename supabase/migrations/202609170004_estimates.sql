-- Versioned estimates. No legacy records imported; no email or payment side effects.
begin;
create table app_private.document_counters(company_id uuid not null references public.companies(id),kind text not null,year integer not null,value integer not null,primary key(company_id,kind,year));
revoke all on app_private.document_counters from public,anon,authenticated;
create table public.estimates(
 id uuid primary key,company_id uuid not null references public.companies(id),
 number text not null,customer_id uuid not null,customer_snapshot jsonb not null,
 estimate_date date not null,valid_until date,
 status text not null default 'BORRADOR' check(status in ('BORRADOR','PENDIENTE','RECHAZADO','ANULADA')),
 notes text not null default '' check(length(notes)<=10000),
 items jsonb not null,subtotal numeric(14,2) not null,discount numeric(14,2) not null,taxes numeric(14,2) not null,total numeric(14,2) not null,
 currency text not null default 'USD' check(currency='USD'),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),unique(company_id,number),foreign key(company_id,customer_id) references public.customers(company_id,id),
 check(total>=0 and discount>=0 and taxes>=0 and subtotal>=discount),check(valid_until is null or valid_until>=estimate_date)
);
create table public.estimate_revisions(
 company_id uuid not null,estimate_id uuid not null,version integer not null,snapshot jsonb not null,
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 primary key(company_id,estimate_id,version),foreign key(company_id,estimate_id) references public.estimates(company_id,id)
);
create index estimates_company_date on public.estimates(company_id,estimate_date desc,id);
create index estimates_company_customer on public.estimates(company_id,customer_id);
alter table public.estimates enable row level security;
alter table public.estimate_revisions enable row level security;
revoke all on public.estimates,public.estimate_revisions from anon,authenticated;
grant select on public.estimates,public.estimate_revisions to authenticated;
create policy estimates_read on public.estimates for select to authenticated using(app_private.can_access(company_id,'fin-estimados','read'));
create policy revisions_read on public.estimate_revisions for select to authenticated using(app_private.can_access(company_id,'fin-estimados','read'));

create function app_private.capture_estimate_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.estimate_revisions(company_id,estimate_id,version,snapshot,created_by) values(NEW.company_id,NEW.id,NEW.version,to_jsonb(NEW),auth.uid());return NEW;
end; $$;
revoke all on function app_private.capture_estimate_revision() from public;
create trigger estimate_revision after insert or update on public.estimates for each row execute function app_private.capture_estimate_revision();
create trigger estimates_audit after insert or update on public.estimates for each row execute function app_private.audit_change();

create function public.save_estimate(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oldrow public.estimates;customer public.customers;item jsonb;normalized jsonb:='[]';
 price numeric;qty numeric;l numeric;w numeric;h numeric;amount numeric;sub numeric:=0;disc numeric;tax numeric;
 pid uuid;basis text;docnumber text;seq integer;yr integer;cid uuid;ed date;vd date;st text;notetext text;snapshot jsonb;key text;
begin
 if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>200000 then raise exception 'invalid_estimate'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then
   select * into oldrow from public.estimates where company_id=p_company and id=p_id for update;
   if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='40001'; end if;
   if oldrow.status='ANULADA' then raise exception 'estimate_voided'; end if;
 end if;
 cid:=(p_data->>'customer_id')::uuid;ed:=(p_data->>'estimate_date')::date;vd:=nullif(p_data->>'valid_until','')::date;st:=p_data->>'status';notetext:=p_data->>'notes';
 if cid is null or ed is null or st is null or st not in ('BORRADOR','PENDIENTE','RECHAZADO','ANULADA') or notetext is null or length(notetext)>10000 or (vd is not null and vd<ed) then raise exception 'invalid_estimate'; end if;
 if p_version=0 or oldrow.customer_id<>cid then
   if not app_private.can_access(p_company,'clientes','read') then raise exception 'customer_access_required' using errcode='42501'; end if;
   select * into customer from public.customers where company_id=p_company and id=cid and status='active';
   if not found then raise exception 'customer_unavailable'; end if;
   snapshot:=jsonb_build_object('full_name',customer.full_name,'email',customer.email,'phone',customer.phone,'address',customer.address,'city',customer.city,'postal_code',customer.postal_code);
 else snapshot:=oldrow.customer_snapshot;end if;
 if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'invalid_items';end if;
 if jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'invalid_items';end if;
 for item in select value from jsonb_array_elements(p_data->'items') loop
   if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'name',''))) not between 1 and 255 or length(coalesce(item->>'description',''))>2000 then raise exception 'invalid_item';end if;
   basis:=item->>'base';if basis is null or basis not in ('area_ft2','linear_ft','volume_ft3','unit','fixed','manual') then raise exception 'invalid_basis';end if;
   foreach key in array array['unit_price','manual_total'] loop
     if coalesce(item->>key,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_money';end if;
   end loop;
   foreach key in array array['qty','length','width','height'] loop
     if coalesce(item->>key,'') !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception 'invalid_dimension';end if;
   end loop;
   price:=(item->>'unit_price')::numeric;qty:=(item->>'qty')::numeric;l:=(item->>'length')::numeric;w:=(item->>'width')::numeric;h:=(item->>'height')::numeric;
   if qty<=0 or (basis in ('area_ft2','linear_ft','volume_ft3') and l<=0) or (basis in ('area_ft2','volume_ft3') and w<=0) or (basis='volume_ft3' and h<=0) then raise exception 'invalid_dimension';end if;
   pid:=nullif(item->>'product_id','')::uuid;
   if pid is not null then
     if not exists(select 1 from public.products where company_id=p_company and id=pid) then raise exception 'product_unavailable';end if;
     -- An existing line retains its historic reference after catalog access is revoked.
     if not exists(select 1 from jsonb_array_elements(coalesce(oldrow.items,'[]')) x where x->>'product_id'=pid::text)
       and (not app_private.can_access(p_company,'productos','read') or not exists(select 1 from public.products where company_id=p_company and id=pid and active)) then raise exception 'product_access_required' using errcode='42501';end if;
   end if;
   amount:=round(case basis when 'area_ft2' then price*qty*l*w when 'linear_ft' then price*qty*l when 'volume_ft3' then price*qty*l*w*h when 'manual' then (item->>'manual_total')::numeric else price*qty end,2);
   sub:=sub+amount;if sub>999999999999.99 then raise exception 'amount_too_large';end if;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('product_id',pid,'name',trim(item->>'name'),'description',coalesce(item->>'description',''),'base',basis,'unit_price',price::text,'qty',qty::text,'length',l::text,'width',w::text,'height',h::text,'manual_total',(item->>'manual_total')::numeric::text,'line_total',amount::text));
 end loop;
 foreach key in array array['discount','taxes'] loop
   if coalesce(p_data->>key,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_money';end if;
 end loop;
 disc:=(p_data->>'discount')::numeric;tax:=(p_data->>'taxes')::numeric;
 if disc>sub or sub-disc+tax>999999999999.99 then raise exception 'invalid_total';end if;
 if p_version=0 then
   yr:=extract(year from ed)::integer;
   insert into app_private.document_counters as counters(company_id,kind,year,value) values(p_company,'EST',yr,1)
   on conflict(company_id,kind,year) do update set value=counters.value+1 returning value into seq;
   docnumber:='EST-'||yr::text||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0');
   insert into public.estimates(id,company_id,number,customer_id,customer_snapshot,estimate_date,valid_until,status,notes,items,subtotal,discount,taxes,total,created_by,updated_by)
   values(p_id,p_company,docnumber,cid,snapshot,ed,vd,st,notetext,normalized,sub,disc,tax,sub-disc+tax,auth.uid(),auth.uid());
 else
   update public.estimates set customer_id=cid,customer_snapshot=snapshot,estimate_date=ed,valid_until=vd,status=st,notes=notetext,items=normalized,subtotal=sub,discount=disc,taxes=tax,total=sub-disc+tax,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
 return p_id;
end; $$;
revoke all on function public.save_estimate(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_estimate(uuid,uuid,integer,jsonb) to authenticated;

create or replace function public.activity_feed(p_company uuid,p_before bigint default null) returns table(id bigint,entity text,entity_id text,operation text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'activity','read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.entity,a.entity_id,a.operation,a.created_at from public.audit_events a where a.company_id=p_company and (p_before is null or a.id<p_before)
 and (app_private.is_manager(p_company) or case a.entity when 'customers' then app_private.can_access(p_company,'clientes','read') when 'leads' then app_private.can_access(p_company,'crm','read') when 'products' then app_private.can_access(p_company,'productos','read') when 'estimates' then app_private.can_access(p_company,'fin-estimados','read') else false end)
 order by a.id desc limit 50;
end; $$;
commit;
