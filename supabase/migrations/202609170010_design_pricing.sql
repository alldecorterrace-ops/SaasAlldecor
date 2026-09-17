-- Company price books and versioned design-to-estimate workflow.
begin;
create table public.price_books(
 id uuid primary key,company_id uuid not null unique references public.companies(id),
 rates jsonb not null,version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.designs(
 id uuid primary key,company_id uuid not null references public.companies(id),
 kind text not null check(kind in ('nuevo3d','pergolamotor')),name text not null check(length(name) between 1 and 160),
 customer_id uuid not null,spec jsonb not null,rate_snapshot jsonb not null,price_version integer not null,
 items jsonb not null,total numeric(14,2) not null,version integer not null default 1,
 estimate_id uuid,estimate_design_version integer,archived boolean not null default false,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,customer_id) references public.customers(company_id,id),
 foreign key(company_id,estimate_id) references public.estimates(company_id,id)
);
create index designs_company_kind on public.designs(company_id,kind,updated_at desc,id);
alter table public.price_books enable row level security;
alter table public.designs enable row level security;
revoke all on public.price_books,public.designs from anon,authenticated;
grant select on public.price_books,public.designs to authenticated;
create policy price_books_read on public.price_books for select to authenticated using(app_private.can_access(company_id,'adm-precios','read') or app_private.can_access(company_id,'nuevo3d','read') or app_private.can_access(company_id,'pergolamotor','read'));
create policy designs_read on public.designs for select to authenticated using(app_private.can_access(company_id,kind,'read'));
create trigger prices_audit after insert or update on public.price_books for each row execute function app_private.audit_change();
create trigger designs_audit after insert or update on public.designs for each row execute function app_private.audit_change();

create function public.save_price_book(p_company uuid,p_version integer,p_rates jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare k text;r jsonb:='{}';oldrow public.price_books;
begin
 if not app_private.can_access(p_company,'adm-precios','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_version is null or p_version<0 or p_rates is null or jsonb_typeof(p_rates)<>'object' or octet_length(p_rates::text)>10000 then raise exception 'invalid_rates';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':prices',0));
 select * into oldrow from public.price_books where company_id=p_company for update;
 if coalesce(oldrow.version,0)<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 foreach k in array array['roof_white','roof_certified','roof_composite','wall_panel','wall_composite','kitchen','permit_fixed','permit_threshold','permit_area','heavy_piece'] loop
  if coalesce(p_rates->>k,'') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then raise exception 'invalid_rate_%',k;end if;
  r:=r||jsonb_build_object(k,(p_rates->>k)::numeric::text);
 end loop;
 if (r->>'roof_white')::numeric<=0 or (r->>'roof_certified')::numeric<=0 or (r->>'roof_composite')::numeric<=0 then raise exception 'positive_roof_rate_required';end if;
 if p_version=0 then
  insert into public.price_books(id,company_id,rates,created_by,updated_by) values(gen_random_uuid(),p_company,r,auth.uid(),auth.uid());
 else update public.price_books set rates=r,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company;end if;
end;$$;

create function public.save_design(p_company uuid,p_id uuid,p_version integer,p_kind text,p_data jsonb,p_refresh boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare oldrow public.designs;book public.price_books;r jsonb;s jsonb;cid uuid;k text;v numeric;total numeric:=0;items jsonb:='[]';line jsonb;roof text;wall text;rate numeric;qty numeric;label text;basis text;l numeric;w numeric;h numeric;pv integer;
begin
 if p_kind not in ('nuevo3d','pergolamotor') or p_kind is null or not app_private.can_access(p_company,p_kind,'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_refresh is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'invalid_design';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into oldrow from public.designs where company_id=p_company and id=p_id for update;
 if coalesce(oldrow.version,0)<>p_version or (oldrow.id is not null and oldrow.kind<>p_kind) then raise exception 'record_conflict' using errcode='40001';end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 1 and 160 then raise exception 'invalid_name';end if;
 cid:=(p_data->>'customer_id')::uuid;
 if oldrow.id is null or oldrow.customer_id<>cid then
  if not app_private.can_access(p_company,'clientes','read') or not exists(select 1 from public.customers where company_id=p_company and id=cid and status='active') then raise exception 'customer_unavailable';end if;
 end if;
 s:=p_data->'spec';if s is null or jsonb_typeof(s)<>'object' then raise exception 'invalid_spec';end if;
 foreach k in array array['length','width','height','wall_length','wall_height','kitchen_length','heavy_count'] loop
  if coalesce(s->>k,'') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' then raise exception 'invalid_dimension';end if;
  v:=(s->>k)::numeric;if v>200 or (k in ('length','width','height') and v<=0) or (k='heavy_count' and v<>trunc(v)) then raise exception 'invalid_dimension';end if;
 end loop;
 roof:=s->>'roof';wall:=s->>'wall';
 if roof is null or roof not in ('white','certified','composite') or wall is null or wall not in ('none','panel','composite') or coalesce(s->>'color','') not in ('white','bronze','black') or jsonb_typeof(s->'permit') is distinct from 'boolean' then raise exception 'invalid_options';end if;
 if wall<>'none' and ((s->>'wall_length')::numeric<=0 or (s->>'wall_height')::numeric<=0 or (s->>'wall_height')::numeric>(s->>'height')::numeric) then raise exception 'invalid_wall';end if;
 if oldrow.id is null or p_refresh then
  select * into book from public.price_books where company_id=p_company;
  if not found then raise exception 'prices_required';end if;r:=book.rates;pv:=book.version;
 else r:=oldrow.rate_snapshot;pv:=oldrow.price_version;end if;
 -- Normalize the snapshot: supplied totals and unknown fields are discarded.
 s:=jsonb_build_object('length',s->>'length','width',s->>'width','height',s->>'height','roof',roof,'wall',wall,'color',s->>'color','wall_length',s->>'wall_length','wall_height',s->>'wall_height','kitchen_length',s->>'kitchen_length','heavy_count',s->>'heavy_count','permit',(s->>'permit')::boolean);
 for k in select unnest(array['roof','wall','kitchen','heavy','permit']) loop
  l:=0;w:=0;h:=0;qty:=1;basis:='fixed';rate:=0;label:='';
  if k='roof' then basis:='area_ft2';l:=(s->>'length')::numeric;w:=(s->>'width')::numeric;rate:=(r->>('roof_'||roof))::numeric;label:='Pérgola '||roof;
  elsif k='wall' and wall<>'none' then basis:='area_ft2';l:=(s->>'wall_length')::numeric;w:=(s->>'wall_height')::numeric;rate:=(r->>('wall_'||wall))::numeric;label:='Pared '||wall;
  elsif k='kitchen' and (s->>'kitchen_length')::numeric>0 then basis:='linear_ft';l:=(s->>'kitchen_length')::numeric;rate:=(r->>'kitchen')::numeric;label:='Cocina exterior';
  elsif k='heavy' and (s->>'heavy_count')::numeric>0 then basis:='unit';qty:=(s->>'heavy_count')::numeric;rate:=(r->>'heavy_piece')::numeric;label:='Refuerzo por pieza';
  elsif k='permit' and (s->>'permit')::boolean then
   label:='Permiso';rate:=(r->>'permit_fixed')::numeric;
   if (s->>'length')::numeric*(s->>'width')::numeric>(r->>'permit_threshold')::numeric then basis:='area_ft2';l:=(s->>'length')::numeric;w:=(s->>'width')::numeric;rate:=(r->>'permit_area')::numeric;end if;
  end if;
  if label<>'' then
   v:=round(rate*qty*case when basis='area_ft2' then l*w when basis='linear_ft' then l else 1 end,2);total:=total+v;
   line:=jsonb_build_object('product_id',null,'name',label,'description','Tarifa versión '||pv,'base',basis,'unit_price',rate::text,'qty',qty::text,'length',l::text,'width',w::text,'height',h::text,'manual_total','0','line_total',v::text);items:=items||jsonb_build_array(line);
  end if;
 end loop;
 if oldrow.id is null then
  insert into public.designs(id,company_id,kind,name,customer_id,spec,rate_snapshot,price_version,items,total,created_by,updated_by) values(p_id,p_company,p_kind,trim(p_data->>'name'),cid,s,r,pv,items,total,auth.uid(),auth.uid());
 else update public.designs set name=trim(p_data->>'name'),customer_id=cid,spec=s,rate_snapshot=r,price_version=pv,items=items,total=total,archived=coalesce((p_data->>'archived')::boolean,false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$$;

create function public.design_to_estimate(p_company uuid,p_id uuid,p_version integer,p_estimate uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.designs;
begin
 select * into d from public.designs where company_id=p_company and id=p_id for update;
 if not found or not app_private.can_access(p_company,d.kind,'write') or not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if d.estimate_id is not null and d.estimate_design_version=d.version then return d.estimate_id;end if;
 if d.version is distinct from p_version or d.archived or p_estimate is null then raise exception 'record_conflict' using errcode='40001';end if;
 perform public.save_estimate(p_company,p_estimate,0,jsonb_build_object('customer_id',d.customer_id,'estimate_date',current_date,'status','BORRADOR','notes',d.name||' · Diseño '||d.id||' revisión '||d.version,'discount','0','taxes','0','items',d.items));
 update public.designs set estimate_id=p_estimate,estimate_design_version=d.version,updated_by=auth.uid(),updated_at=now() where id=d.id;
 return p_estimate;
end;$$;
revoke all on function public.save_price_book(uuid,integer,jsonb),public.save_design(uuid,uuid,integer,text,jsonb,boolean),public.design_to_estimate(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.save_price_book(uuid,integer,jsonb),public.save_design(uuid,uuid,integer,text,jsonb,boolean),public.design_to_estimate(uuid,uuid,integer,uuid) to authenticated;
commit;
