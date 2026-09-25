-- Additive map support and optional location on new public inquiries.
-- No ADT data is read/imported and no existing inquiry or financial row changes.
begin;
create table public.postal_centers (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 zip text not null check(zip ~ '^[0-9]{5}$'),
 lat double precision not null check(lat between -90 and 90 and lat<>0),
 lng double precision not null check(lng between -180 and 180 and lng<>0),
 ciudad text not null default '' check(length(ciudad)<=118),
 version integer not null default 1 check(version>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 unique(company_id,zip)
);
alter table public.postal_centers enable row level security;
revoke all on public.postal_centers from public,anon,authenticated;
grant select on public.postal_centers to authenticated;
create policy postal_centers_read on public.postal_centers for select to authenticated
 using(app_private.can_access(company_id,'mapazonas','read'));
create trigger postal_centers_audit after insert or update on public.postal_centers
 for each row execute function app_private.audit_change();

create function public.save_postal_center(p_company uuid,p_zip text,p_lat double precision,p_lng double precision,p_city text,p_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare current_row public.postal_centers;
begin
 if not app_private.can_access(p_company,'mapazonas','write') then
  raise exception 'permission_denied' using errcode='42501';end if;
 if p_zip is null or p_zip !~ '^[0-9]{5}$' or p_lat is null or not(p_lat between -90 and 90) or p_lat=0
  or p_lng is null or not(p_lng between -180 and 180) or p_lng=0
  or p_city is null or length(p_city)>118 or p_version is null or p_version<0 then
  raise exception 'invalid_postal_center' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':zip:'||p_zip,0));
 select * into current_row from public.postal_centers where company_id=p_company and zip=p_zip for update;
 if found then
  if current_row.lat=p_lat and current_row.lng=p_lng and current_row.ciudad=btrim(p_city) then return current_row.version;end if;
  if current_row.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
  update public.postal_centers set lat=p_lat,lng=p_lng,ciudad=btrim(p_city),version=version+1,updated_by=auth.uid(),updated_at=now()
   where id=current_row.id returning version into p_version;
 else
  if p_version<>0 then raise exception 'record_conflict' using errcode='PT409';end if;
  insert into public.postal_centers(company_id,zip,lat,lng,ciudad,updated_by)
   values(p_company,p_zip,p_lat,p_lng,btrim(p_city),auth.uid()) returning version into p_version;
 end if;
 return p_version;
end;$$;
revoke all on function public.save_postal_center(uuid,text,double precision,double precision,text,integer) from public,anon;
grant execute on function public.save_postal_center(uuid,text,double precision,double precision,text,integer) to authenticated;

-- A single statement snapshot; JSON arrays are not truncated by the PostgREST
-- row limit. Invoker rights keep RLS in force on every source. Fail on missing
-- permissions instead of displaying misleading partial financial aggregates.
create function public.commercial_zone_source(p_company uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare module text;
begin
 foreach module in array array['mapazonas','clientes','fin-invoices','estimadosweb','crm'] loop
  if not app_private.can_access(p_company,module,'read') then raise exception 'permission_denied' using errcode='42501';end if;
 end loop;
 return jsonb_build_object(
  'customers',coalesce((select jsonb_agg(jsonb_build_object('external_id',c.id,'full_name',c.full_name,
   'address',coalesce(c.address,''),'city',coalesce(c.city,''),'postal_code',coalesce(c.postal_code,''),
   'phone',coalesce(c.phone,''),'email',coalesce(c.email,'')) order by c.created_at,c.id)
   from public.customers c where c.company_id=p_company),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(jsonb_build_object('client_external_id',i.customer_id,
   'paid_amount',i.paid_amount::text,'balance_due',i.balance_due::text,'status',i.status) order by i.created_at,i.id)
   from public.invoices i where i.company_id=p_company),'[]'::jsonb),
  'webformLeads',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'full_name',coalesce(w.data->>'name',''),
   'address',coalesce(w.data->>'address',''),'city',coalesce(w.data->>'city',''),'postal_code',coalesce(w.data->>'postal_code',''),
   'phone',coalesce(w.data->>'phone',''),'email',coalesce(w.data->>'email','')) order by w.created_at desc,w.id)
   from public.web_requests w where w.company_id=p_company),'[]'::jsonb),
  'leadStatuses',coalesce((select jsonb_agg(jsonb_build_object('lead_id',w.id,'status',l.status) order by w.id)
   from public.web_requests w join public.leads l on l.company_id=w.company_id and l.id=w.lead_id
   where w.company_id=p_company),'[]'::jsonb),
  'postalCenters',coalesce((select jsonb_agg(jsonb_build_object('zip',z.zip,'lat',z.lat,'lng',z.lng,'ciudad',z.ciudad) order by z.zip)
   from public.postal_centers z where z.company_id=p_company),'[]'::jsonb)
 );
end;$$;
revoke all on function public.commercial_zone_source(uuid) from public,anon;
grant execute on function public.commercial_zone_source(uuid) to authenticated;

create or replace function public.submit_web_request(p_form uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;k text;clean jsonb:='{}';oldrow public.web_requests;
begin
 if public.web_form_info(p_form) is null then raise exception 'form_unavailable';end if;
 if p_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'invalid_request';end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 2 and 160 or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_data->>'email')>254 or length(coalesce(p_data->>'phone',''))>64 or length(coalesce(p_data->>'message',''))>2000 or coalesce(p_data->>'service','') not in ('Pérgola','Cocina exterior','Pared','Otro') then raise exception 'invalid_contact';end if;
 foreach k in array array['length','width','height'] loop
  if coalesce(p_data->>k,'') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' or (p_data->>k)::numeric>200 then raise exception 'invalid_dimension';end if;
 end loop;
 foreach k in array array['name','email','phone','message','service','length','width','height'] loop clean:=clean||jsonb_build_object(k,trim(coalesce(p_data->>k,'')));end loop;
 -- Optional fields are absent when blank, preserving old idempotent requests.
 foreach k in array array['address','city','postal_code'] loop
  if p_data ? k and jsonb_typeof(p_data->k) not in ('string','null') then raise exception 'invalid_location';end if;
  if length(coalesce(p_data->>k,'')) > (case k when 'address' then 255 when 'city' then 128 else 24 end) then raise exception 'invalid_location';end if;
  if btrim(coalesce(p_data->>k,''))<>'' then clean:=clean||jsonb_build_object(k,btrim(p_data->>k));end if;
 end loop;
 select company_id into cid from public.web_forms where id=p_form;
 perform pg_advisory_xact_lock(hashtextextended(cid::text||':web-requests',0));
 select * into oldrow from public.web_requests where id=p_id;
 if found then if oldrow.form_id=p_form and oldrow.data=clean then return p_id;end if;raise exception 'request_conflict';end if;
 if (select count(*) from public.web_requests where company_id=cid and created_at>now()-interval '24 hours')>=50 then raise exception 'form_daily_limit';end if;
 insert into public.web_requests(id,company_id,form_id,data) values(p_id,cid,p_form,clean);return p_id;
end;$$;
create or replace function public.review_web_request(p_company uuid,p_id uuid,p_convert boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.web_requests;lid uuid;
begin
 if not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into r from public.web_requests where company_id=p_company and id=p_id for update;if not found then raise exception 'request_unavailable';end if;
 if r.lead_id is not null then return r.lead_id;end if;
 if p_convert then
  lid:=gen_random_uuid();perform public.save_lead(p_company,lid,0,jsonb_build_object('full_name',r.data->>'name','email',r.data->>'email','phone',r.data->>'phone','address',coalesce(r.data->>'address',''),'city',coalesce(r.data->>'city',''),'postal_code',coalesce(r.data->>'postal_code',''),'service',r.data->>'service','message',(r.data->>'message')||E'\nMedidas aproximadas (ft): '||(r.data->>'length')||' × '||(r.data->>'width')||' × '||(r.data->>'height'),'contact_preference','','appointment_date',null,'lead_date',(r.created_at at time zone (select timezone from public.companies where id=p_company))::date,'source','Formulario web','status','NUEVO','archived',false));
  update public.web_requests set lead_id=lid,status='CONVERTIDO',updated_at=now() where id=p_id;
 else update public.web_requests set status='ARCHIVADO',updated_at=now() where id=p_id;end if;
 return lid;
end;$$;
commit;
