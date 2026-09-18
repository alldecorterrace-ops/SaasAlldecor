-- Additive customer copies with immutable source mapping. No financial imports.
begin;
create function app_private.customer_match_key(p_field text,p_value text) returns text
language plpgsql immutable set search_path='' as $$
declare v text:=lower(btrim(coalesce(p_value,'')));
begin
 if p_field='full_name' then return regexp_replace(v,'\s+',' ','g');end if;
 if p_field='email' then return v;end if;
 if p_field<>'phone' then raise exception 'invalid_match_field';end if;
 v:=regexp_replace(v,'[^0-9]','','g');if length(v)=11 and left(v,1)='1' then v:=substr(v,2);end if;
 return case when length(v)>=7 then v else '' end;
end $$;
revoke all on function app_private.customer_match_key(text,text) from public,anon,authenticated;
create table public.historical_customer_migrations(
 company_id uuid not null references public.companies(id),historical_id uuid not null,
 historical_kind text generated always as('clients'::text) stored,
 customer_id uuid, state text not null check(state in ('imported','review')),
 review_reasons jsonb not null check(jsonb_typeof(review_reasons)='array'),
 migrated_at timestamptz not null default now(),
 primary key(company_id,historical_id),unique(company_id,customer_id),
 foreign key(company_id,historical_kind,historical_id) references public.historical_business(company_id,kind,id),
 foreign key(company_id,customer_id) references public.customers(company_id,id),
 check((state='imported' and customer_id is not null and review_reasons='[]'::jsonb) or (state='review' and customer_id is null and jsonb_array_length(review_reasons)>0))
);
alter table public.historical_customer_migrations enable row level security;
revoke all on public.historical_customer_migrations from public,anon,authenticated;
grant select on public.historical_customer_migrations to authenticated;
create policy historical_customer_migration_read on public.historical_customer_migrations for select to authenticated using(app_private.can_access(company_id,'clientes','read'));
create table app_private.operational_customer_imports(
 company_id uuid primary key references public.companies(id),snapshot_sha256 text not null,plan jsonb not null,
 expected_customers jsonb not null, actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table app_private.operational_customer_imports enable row level security;
revoke all on app_private.operational_customer_imports from public,anon,authenticated;
create function app_private.import_operational_customers(p_company uuid,p_actor uuid,p_snapshot text,p_expected_customers jsonb,p_records jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare r jsonb; d jsonb; original jsonb; expected_data jsonb; h uuid; cid uuid; fld text; match_key text; reason jsonb; source_hash text; previous record; inserted_count integer:=0; review_count integer:=0; seen uuid[]:='{}';
begin
 if p_snapshot is null or p_snapshot!~'^[0-9a-f]{64}$' or jsonb_typeof(p_records) is distinct from 'array' or jsonb_typeof(p_expected_customers) is distinct from 'array' or jsonb_array_length(p_records)>10000 then raise exception 'invalid_customer_import';end if;
 if not exists(select 1 from public.memberships where company_id=p_company and user_id=p_actor and active and role in ('owner','admin')) then raise exception 'customer_import_actor_not_manager';end if;
 -- Existing customer actions do not acquire a company lock. This short table lock
 -- makes the snapshot/duplicate checks and insert one consistent transaction.
 lock table public.customers in share row exclusive mode;
 perform id from public.companies where id=p_company for update;
 select * into previous from app_private.operational_customer_imports where company_id=p_company;
 if found then
  if previous.snapshot_sha256<>p_snapshot or previous.plan is distinct from p_records or previous.expected_customers is distinct from p_expected_customers then raise exception 'customer_import_plan_changed';end if;
  return jsonb_build_object('inserted',0,'review',0,'unchanged',jsonb_array_length(p_records));
 end if;
 if (select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) from public.customers c where company_id=p_company) is distinct from p_expected_customers then raise exception 'customer_destination_changed';end if;
 if jsonb_array_length(p_records)<>(select count(*) from public.historical_business where company_id=p_company and kind='clients') then raise exception 'customer_source_set_incomplete';end if;
 for r in select value from jsonb_array_elements(p_records) loop
  h:=(r->>'historical_id')::uuid;
  if h is null or h=any(seen) or coalesce(r->>'state','') not in ('imported','review') or jsonb_typeof(r->'review_reasons') is distinct from 'array' then raise exception 'invalid_customer_import_record';end if;
  seen:=array_append(seen,h);
  select s.original,s.source_sha256 into original,source_hash from app_private.historical_business_sources s where s.company_id=p_company and s.kind='clients' and s.id=h;
  if not found or source_hash is distinct from r->>'source_sha256' then raise exception 'customer_source_changed';end if;
  if r->>'state'='review' then
   if r->'data' is distinct from 'null'::jsonb or jsonb_array_length(r->'review_reasons') not between 1 and 30 then raise exception 'invalid_customer_review';end if;
   for reason in select value from jsonb_array_elements(r->'review_reasons') loop
    if jsonb_typeof(reason)<>'string' or (reason#>>'{}')!~'^(source_status|invalid:(full_name|email|phone|address|city|postal_code|service|client_date|notes|status)|source_duplicate:(full_name|email|phone)|current_duplicate:(full_name|email|phone))$' then raise exception 'invalid_customer_review_reason';end if;
   end loop;
   insert into public.historical_customer_migrations(company_id,historical_id,state,review_reasons) values(p_company,h,'review',r->'review_reasons');review_count:=review_count+1;
   continue;
  end if;
  if original->>'status' is distinct from 'ACTIVO' or r->'review_reasons' is distinct from '[]'::jsonb then raise exception 'customer_source_requires_review';end if;
  d:=r->'data';expected_data:=jsonb_build_object('status','active');
  foreach fld in array array['full_name','email','phone','address','city','postal_code','service','client_date','notes'] loop
   if original->fld is not null and original->fld<>'null'::jsonb and jsonb_typeof(original->fld)<>'string' then raise exception 'invalid_customer_source_field';end if;
   expected_data:=expected_data||jsonb_build_object(fld,btrim(coalesce(original->>fld,'')));
  end loop;
  if d is distinct from expected_data or coalesce(d->>'client_date','')!~'^\d{4}-\d{2}-\d{2}$'
    or (d->>'email'<>'' and (length(d->>'email')>254 or (d->>'email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'invalid_customer_copy';end if;
  foreach fld in array array['full_name','email','phone'] loop
   match_key:=app_private.customer_match_key(fld,original->>fld);
   if match_key<>'' and (exists(select 1 from app_private.historical_business_sources s where s.company_id=p_company and s.kind='clients' and s.id<>h and app_private.customer_match_key(fld,s.original->>fld)=match_key)
    or exists(select 1 from public.customers c where c.company_id=p_company and app_private.customer_match_key(fld,to_jsonb(c)->>fld)=match_key)) then raise exception 'customer_duplicate_requires_review';end if;
  end loop;
  cid:=gen_random_uuid();
  insert into public.customers(id,company_id,full_name,email,phone,address,city,postal_code,service,client_date,notes,status,created_by,updated_by)
   values(cid,p_company,d->>'full_name',nullif(d->>'email',''),nullif(d->>'phone',''),nullif(d->>'address',''),nullif(d->>'city',''),nullif(d->>'postal_code',''),nullif(d->>'service',''),(d->>'client_date')::date,nullif(d->>'notes',''),'active',p_actor,p_actor);
  insert into public.historical_customer_migrations(company_id,historical_id,customer_id,state,review_reasons) values(p_company,h,cid,'imported','[]');
  inserted_count:=inserted_count+1;
 end loop;
 insert into app_private.operational_customer_imports(company_id,snapshot_sha256,plan,expected_customers,actor_id) values(p_company,p_snapshot,p_records,p_expected_customers,p_actor);
 insert into public.audit_events(company_id,actor_id,entity,entity_id,operation,after_data) values(p_company,p_actor,'customer_migration',p_company::text,'IMPORT',jsonb_build_object('inserted',inserted_count,'review',review_count));
 return jsonb_build_object('inserted',inserted_count,'review',review_count,'unchanged',0);
end $$;
revoke all on function app_private.import_operational_customers(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
commit;
