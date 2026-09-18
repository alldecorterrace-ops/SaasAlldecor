-- Read-only business history. Current customers and financial ledgers are untouched.
begin;
create function app_private.valid_historical_business(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(p))<>7 or not(p ?& array['title','original_date','original_status','customer_name','amount_cents','details','review_reasons']) then return false; end if;
 foreach k in array array['title','original_date','original_status','customer_name'] loop
  if jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>500 then return false; end if;
 end loop;
 v:=p->'amount_cents';
 if v is null or (v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or (p->>'amount_cents')!~'^-?[0-9]{1,16}$')) then return false; end if;
 if jsonb_typeof(p->'details') is distinct from 'object' or jsonb_typeof(p->'review_reasons') is distinct from 'array' then return false; end if;
 for k,v in select key,value from jsonb_each(p->'details') loop
  if k not in ('email','phone','address','city','postal_code','service','paid_cents','balance_cents','payment_status','method','reference','void_reason','applied_cents','paid_difference_cents','balance_difference_cents') then return false; end if;
  if right(k,6)='_cents' then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^-?[0-9]{1,16}$') then return false; end if;
  elsif jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then return false;
  end if;
 end loop;
 if jsonb_array_length(p->'review_reasons')>100 then return false; end if;
 for v in select value from jsonb_array_elements(p->'review_reasons') loop
  if jsonb_typeof(v)<>'string' or length(v#>>'{}')>100 then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function app_private.valid_historical_business(jsonb) from public,anon,authenticated;

create table public.historical_business(
 company_id uuid not null references public.companies(id),kind text not null check(kind in ('clients','projects','invoices','payments')),id uuid not null,source_id text not null,
 presentation jsonb not null check(app_private.valid_historical_business(presentation)),
 title text generated always as (presentation->>'title') stored,
 original_date text generated always as (presentation->>'original_date') stored,
 original_status text generated always as (presentation->>'original_status') stored,
 customer_name text generated always as (presentation->>'customer_name') stored,
 amount_cents text generated always as (presentation->>'amount_cents') stored,
 client_id uuid,project_id uuid,invoice_id uuid,estimate_id uuid,
 client_kind text generated always as ('clients'::text) stored,
 project_kind text generated always as ('projects'::text) stored,
 invoice_kind text generated always as ('invoices'::text) stored,
 imported_at timestamptz not null default now(),
 primary key(company_id,kind,id),unique(company_id,kind,source_id),
 foreign key(company_id,client_kind,client_id) references public.historical_business(company_id,kind,id) deferrable initially deferred,
 foreign key(company_id,project_kind,project_id) references public.historical_business(company_id,kind,id) deferrable initially deferred,
 foreign key(company_id,invoice_kind,invoice_id) references public.historical_business(company_id,kind,id) deferrable initially deferred,
 foreign key(company_id,estimate_id) references public.historical_estimates(company_id,id) deferrable initially deferred,
 check((kind='clients')=(client_id is null)),check((kind='payments')=(invoice_id is not null)),
 check(project_id is null or kind in ('invoices','payments')),check(estimate_id is null or kind='projects')
);
create index historical_business_list on public.historical_business(company_id,kind,original_date desc,id);
create index historical_business_client on public.historical_business(company_id,client_id);
create index historical_business_project on public.historical_business(company_id,project_id);
create index historical_business_invoice on public.historical_business(company_id,invoice_id);
alter table public.historical_business enable row level security;
revoke all on public.historical_business from public,anon,authenticated;
grant select on public.historical_business to authenticated;
create policy historical_business_read on public.historical_business for select to authenticated using(
 app_private.can_access(company_id,case kind when 'clients' then 'clientes' when 'projects' then 'fin-proyectos' else 'fin-invoices' end,'read')
);
create table app_private.historical_business_sources(
 company_id uuid not null,kind text not null,id uuid not null,source_sha256 text not null,projection_sha256 text not null,original jsonb not null,
 primary key(company_id,kind,id),foreign key(company_id,kind,id) references public.historical_business(company_id,kind,id)
);
create table app_private.historical_business_imports(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),snapshot_sha256 text not null,
 inserted integer not null,unchanged integer not null,imported_at timestamptz not null default now()
);
alter table app_private.historical_business_sources enable row level security;
alter table app_private.historical_business_imports enable row level security;
revoke all on app_private.historical_business_sources,app_private.historical_business_imports from public,anon,authenticated;

create function app_private.import_historical_business(p_company uuid,p_snapshot text,p_records jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare r jsonb; oldrow record; rid uuid; rk text; sid text; seen text[]:='{}'; inserted_count integer:=0; unchanged_count integer:=0; cid uuid; pid uuid; iid uuid; eid uuid;
begin
 if p_snapshot is null or p_snapshot!~'^[0-9a-f]{64}$' or jsonb_typeof(p_records) is distinct from 'array' then raise exception 'invalid_business_batch'; end if;
 if jsonb_array_length(p_records)>10000 then raise exception 'business_batch_too_large'; end if;
 perform id from public.companies where id=p_company for update;
 if not found then raise exception 'historical_company_not_found'; end if;
 for r in select value from jsonb_array_elements(p_records) loop
  rid:=(r->>'id')::uuid;rk:=r->>'kind';sid:=r->>'source_id';
  cid:=(r->>'client_id')::uuid;pid:=(r->>'project_id')::uuid;iid:=(r->>'invoice_id')::uuid;eid:=(r->>'estimate_id')::uuid;
  if jsonb_typeof(r)<>'object' or rid is null or rk is null or rk not in ('clients','projects','invoices','payments') or sid is null or length(sid) not between 1 and 128 or sid<>btrim(sid)
   or (rk||':'||sid)=any(seen) or coalesce(r->>'source_sha256','')!~'^[0-9a-f]{64}$' or coalesce(r->>'projection_sha256','')!~'^[0-9a-f]{64}$'
   or jsonb_typeof(r->'original') is distinct from 'object' or r#>>'{original,external_id}' is distinct from sid
   or not app_private.valid_historical_business(r->'presentation') then raise exception 'invalid_business_record'; end if;
  seen:=array_append(seen,rk||':'||sid);
  select h.*,s.original,s.source_sha256,s.projection_sha256 into oldrow from public.historical_business h join app_private.historical_business_sources s using(company_id,kind,id)
   where h.company_id=p_company and h.kind=rk and h.source_id=sid for update of h,s;
  if found then
   if oldrow.id<>rid or oldrow.original is distinct from r->'original' or oldrow.presentation is distinct from r->'presentation'
    or oldrow.source_sha256<>r->>'source_sha256' or oldrow.projection_sha256<>r->>'projection_sha256'
    or oldrow.client_id is distinct from cid or oldrow.project_id is distinct from pid or oldrow.invoice_id is distinct from iid or oldrow.estimate_id is distinct from eid then raise exception 'historical_business_conflict'; end if;
   unchanged_count:=unchanged_count+1;
  else
   insert into public.historical_business(company_id,kind,id,source_id,presentation,client_id,project_id,invoice_id,estimate_id) values(p_company,rk,rid,sid,r->'presentation',cid,pid,iid,eid);
   insert into app_private.historical_business_sources(company_id,kind,id,source_sha256,projection_sha256,original) values(p_company,rk,rid,r->>'source_sha256',r->>'projection_sha256',r->'original');
   inserted_count:=inserted_count+1;
  end if;
 end loop;
 insert into app_private.historical_business_imports(company_id,snapshot_sha256,inserted,unchanged) values(p_company,p_snapshot,inserted_count,unchanged_count);
 return jsonb_build_object('inserted',inserted_count,'unchanged',unchanged_count);
end $$;
revoke all on function app_private.import_historical_business(uuid,text,jsonb) from public,anon,authenticated;
commit;
