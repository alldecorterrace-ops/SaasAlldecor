-- Historical read model only. No current estimates, invoices or counters change.
begin;
create function app_private.valid_historical_estimate(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; item jsonb; v jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(p))<>11 then return false; end if;
 for k in select jsonb_object_keys(p) loop
  if k not in ('number','original_date','original_status','customer_name','total_cents','discount_cents','taxes_cents','difference_cents','detail_state','review_reasons','lines') then return false; end if;
 end loop;
 -- Required properties are checked explicitly; unknown fields are never published.
 foreach k in array array['number','original_date','original_status','customer_name'] loop
  if jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>500 then return false; end if;
 end loop;
 foreach k in array array['total_cents','discount_cents','taxes_cents','difference_cents'] loop
  v:=p->k;
  if v is null or (v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or (p->>k)!~'^-?[0-9]{1,16}$')) then return false; end if;
 end loop;
 if p->>'detail_state' is null or p->>'detail_state' not in ('saved_lines','unavailable_in_reviewed_sources') then return false; end if;
 if jsonb_typeof(p->'review_reasons') is distinct from 'array' or jsonb_typeof(p->'lines') is distinct from 'array' then return false; end if;
 if jsonb_array_length(p->'review_reasons')>100 or jsonb_array_length(p->'lines')>10000 then return false; end if;
 for v in select value from jsonb_array_elements(p->'review_reasons') loop
  if jsonb_typeof(v)<>'string' or length(v#>>'{}')>100 then return false; end if;
 end loop;
 if (p->>'detail_state'='saved_lines')<>(jsonb_array_length(p->'lines')>0) then return false; end if;
 for item in select value from jsonb_array_elements(p->'lines') loop
  if jsonb_typeof(item)<>'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(item))<>3 or not (item ?& array['description','specification','amount_cents']) then return false; end if;
  if jsonb_typeof(item->'description') is distinct from 'string' or length(item->>'description')>2000 or jsonb_typeof(item->'specification') is distinct from 'string' or length(item->>'specification')>4000 then return false; end if;
  v:=item->'amount_cents';
  if v is null or (v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or (item->>'amount_cents')!~'^-?[0-9]{1,16}$')) then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function app_private.valid_historical_estimate(jsonb) from public,anon,authenticated;

create table public.historical_estimates(
 id uuid not null,company_id uuid not null references public.companies(id),source_id text not null,
 presentation jsonb not null check(app_private.valid_historical_estimate(presentation)),
 number text generated always as (presentation->>'number') stored,
 original_date text generated always as (presentation->>'original_date') stored,
 original_status text generated always as (presentation->>'original_status') stored,
 customer_name text generated always as (presentation->>'customer_name') stored,
 total_cents text generated always as (presentation->>'total_cents') stored,
 imported_at timestamptz not null default now(),
 primary key(company_id,id),unique(company_id,source_id)
);
create index historical_estimates_company_date on public.historical_estimates(company_id,original_date desc,id);
alter table public.historical_estimates enable row level security;
revoke all on public.historical_estimates from public,anon,authenticated;
grant select on public.historical_estimates to authenticated;
create policy historical_estimates_read on public.historical_estimates for select to authenticated
 using(app_private.can_access(company_id,'fin-estimados','read'));

create table app_private.historical_estimate_sources(
 company_id uuid not null,id uuid not null,source_sha256 text not null,projection_sha256 text not null,
 original jsonb not null,primary key(company_id,id),
 foreign key(company_id,id) references public.historical_estimates(company_id,id)
);
create table app_private.historical_estimate_imports(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 snapshot_sha256 text not null,inserted integer not null,unchanged integer not null,
 imported_at timestamptz not null default now()
);
revoke all on app_private.historical_estimate_sources,app_private.historical_estimate_imports from public,anon,authenticated;
alter table app_private.historical_estimate_sources enable row level security;
alter table app_private.historical_estimate_imports enable row level security;

-- Administrative SQL only, outside the PostgREST public schema; no app role can execute.
create function app_private.import_historical_estimates(p_company uuid,p_snapshot text,p_records jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare r jsonb; oldrow record; rid uuid; inserted_count integer:=0; unchanged_count integer:=0; seen text[]:='{}'; sid text;
begin
 if p_snapshot is null or p_snapshot!~'^[0-9a-f]{64}$' or jsonb_typeof(p_records) is distinct from 'array' then raise exception 'invalid_historical_batch'; end if;
 if jsonb_array_length(p_records)>10000 then raise exception 'historical_batch_too_large'; end if;
 perform id from public.companies where id=p_company for update;
 if not found then raise exception 'historical_company_not_found'; end if;
 for r in select value from jsonb_array_elements(p_records) loop
  if jsonb_typeof(r)<>'object' then raise exception 'invalid_historical_record'; end if;
  rid:=(r->>'id')::uuid; sid:=r->>'source_id';
  if rid is null or sid is null or length(sid) not between 1 and 64 or sid<>btrim(sid) or sid=any(seen)
   or coalesce(r->>'source_sha256','')!~'^[0-9a-f]{64}$' or coalesce(r->>'projection_sha256','')!~'^[0-9a-f]{64}$'
   or jsonb_typeof(r->'original') is distinct from 'object' or jsonb_typeof(r#>'{original,estimate}') is distinct from 'object'
   or jsonb_typeof(r#>'{original,items}') is distinct from 'array' or r#>>'{original,estimate,external_id}' is distinct from sid
   or not app_private.valid_historical_estimate(r->'presentation') then raise exception 'invalid_historical_record'; end if;
  seen:=array_append(seen,sid);
  select h.id,h.presentation,s.original,s.source_sha256,s.projection_sha256 into oldrow
   from public.historical_estimates h join app_private.historical_estimate_sources s using(company_id,id)
   where h.company_id=p_company and h.source_id=sid for update of h,s;
  if found then
   if oldrow.id<>rid or oldrow.presentation is distinct from r->'presentation' or oldrow.original is distinct from r->'original'
    or oldrow.source_sha256<>r->>'source_sha256' or oldrow.projection_sha256<>r->>'projection_sha256' then raise exception 'historical_source_conflict'; end if;
   unchanged_count:=unchanged_count+1;
  else
   insert into public.historical_estimates(company_id,id,source_id,presentation) values(p_company,rid,sid,r->'presentation');
   insert into app_private.historical_estimate_sources(company_id,id,source_sha256,projection_sha256,original)
    values(p_company,rid,r->>'source_sha256',r->>'projection_sha256',r->'original');
   inserted_count:=inserted_count+1;
  end if;
 end loop;
 insert into app_private.historical_estimate_imports(company_id,snapshot_sha256,inserted,unchanged) values(p_company,p_snapshot,inserted_count,unchanged_count);
 return jsonb_build_object('inserted',inserted_count,'unchanged',unchanged_count);
end $$;
revoke all on function app_private.import_historical_estimates(uuid,text,jsonb) from public,anon,authenticated;
commit;
