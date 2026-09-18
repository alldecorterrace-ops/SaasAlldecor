-- Historical document metadata; source HTML, tokens and signatures stay private.
begin;
create function app_private.valid_historical_document(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text;v jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' then return false;end if;
 if (select count(*) from jsonb_object_keys(p))<>11 or not(p ?& array['title','original_type','original_status','original_date','signed_date','customer_name','amount_cents','has_signed_content','has_signature','relation_state','review_reasons']) then return false;end if;
 foreach k in array array['title','original_type','original_status','original_date','signed_date','customer_name'] loop
  if jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>(case when k in ('title','customer_name') then 500 else 100 end) then return false;end if;
 end loop;
 if jsonb_typeof(p->'has_signed_content') is distinct from 'boolean' or jsonb_typeof(p->'has_signature') is distinct from 'boolean' then return false;end if;
 if coalesce(p->>'relation_state','') not in ('linked','review') then return false;end if;
 v:=p->'amount_cents';if v is null or (v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^-?[0-9]{1,16}$')) then return false;end if;
 if jsonb_typeof(p->'review_reasons') is distinct from 'array' then return false;end if;
 if jsonb_array_length(p->'review_reasons')>100 then return false;end if;
 for v in select value from jsonb_array_elements(p->'review_reasons') loop
  if jsonb_typeof(v)<>'string' or length(v#>>'{}')>100 then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function app_private.valid_historical_document(jsonb) from public,anon,authenticated;
create table public.historical_documents(
 company_id uuid not null references public.companies(id),kind text not null check(kind in ('documents','contracts')),id uuid not null,source_id text not null,
 presentation jsonb not null check(app_private.valid_historical_document(presentation)),
 title text generated always as(presentation->>'title') stored,
 original_date text generated always as(presentation->>'original_date') stored,
 original_status text generated always as(presentation->>'original_status') stored,
 relation_state text generated always as(presentation->>'relation_state') stored,
 client_id uuid,project_id uuid,estimate_id uuid,
 client_kind text generated always as('clients'::text) stored,project_kind text generated always as('projects'::text) stored,
 file_state text not null check(file_state in ('available','missing','invalid','no_source')),
 file_sha256 text,file_bytes integer,
 imported_at timestamptz not null default now(),
 primary key(company_id,kind,id),unique(company_id,kind,source_id),
 foreign key(company_id,client_kind,client_id) references public.historical_business(company_id,kind,id),
 foreign key(company_id,project_kind,project_id) references public.historical_business(company_id,kind,id),
 foreign key(company_id,estimate_id) references public.historical_estimates(company_id,id),
 check(relation_state<>'review' or (client_id is null and project_id is null and estimate_id is null)),
 check(kind<>'contracts' or relation_state='review' or (client_id is not null and estimate_id is not null)),
 check((file_state='available' and file_sha256 is not null and file_sha256~'^[0-9a-f]{64}$' and file_bytes is not null and file_bytes between 1 and 20971520)
   or (file_state<>'available' and file_sha256 is null and file_bytes is null))
);
create index historical_documents_list on public.historical_documents(company_id,kind,relation_state,original_date desc,id);
alter table public.historical_documents enable row level security;
revoke all on public.historical_documents from public,anon,authenticated;
grant select on public.historical_documents to authenticated;
create policy historical_documents_read on public.historical_documents for select to authenticated using(
 app_private.can_access(company_id,'fin-estimados','read') and (relation_state='linked' or app_private.is_manager(company_id))
);
create table app_private.historical_document_sources(
 company_id uuid not null,kind text not null,id uuid not null,source_sha256 text not null,projection_sha256 text not null,original jsonb not null,
 primary key(company_id,kind,id),foreign key(company_id,kind,id) references public.historical_documents(company_id,kind,id)
);
create table app_private.historical_document_imports(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),snapshot_sha256 text not null,
 inserted integer not null,unchanged integer not null,imported_at timestamptz not null default now()
);
alter table app_private.historical_document_sources enable row level security;
alter table app_private.historical_document_imports enable row level security;
revoke all on app_private.historical_document_sources,app_private.historical_document_imports from public,anon,authenticated;
create function app_private.import_historical_documents(p_company uuid,p_snapshot text,p_records jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare r jsonb;oldrow record;rid uuid;rk text;sid text;seen text[]:='{}';inserted_count integer:=0;unchanged_count integer:=0;cid uuid;pid uuid;eid uuid;
begin
 if p_snapshot is null or p_snapshot!~'^[0-9a-f]{64}$' or jsonb_typeof(p_records) is distinct from 'array' then raise exception 'invalid_document_batch';end if;
 if jsonb_array_length(p_records)>10000 then raise exception 'document_batch_too_large';end if;
 perform id from public.companies where id=p_company for update;
 if not found then raise exception 'historical_company_not_found';end if;
 for r in select value from jsonb_array_elements(p_records) loop
  rid:=(r->>'id')::uuid;rk:=r->>'kind';sid:=r->>'source_id';cid:=(r->>'client_id')::uuid;pid:=(r->>'project_id')::uuid;eid:=(r->>'estimate_id')::uuid;
  if jsonb_typeof(r)<>'object' or rid is null or rk is null or rk not in ('documents','contracts') or sid is null or length(sid) not between 1 and 128 or sid<>btrim(sid)
   or (rk||':'||sid)=any(seen) or coalesce(r->>'source_sha256','')!~'^[0-9a-f]{64}$' or coalesce(r->>'projection_sha256','')!~'^[0-9a-f]{64}$'
   or jsonb_typeof(r->'original') is distinct from 'object'
   or (r->'original'->>(case when rk='documents' then 'id' else 'external_id' end)) is distinct from sid
   or not app_private.valid_historical_document(r->'presentation') then raise exception 'invalid_document_record';end if;
  seen:=array_append(seen,rk||':'||sid);
  select h.*,s.original,s.source_sha256,s.projection_sha256 into oldrow from public.historical_documents h join app_private.historical_document_sources s using(company_id,kind,id)
   where h.company_id=p_company and h.kind=rk and h.source_id=sid for update of h,s;
  if found then
   if oldrow.id<>rid or oldrow.original is distinct from r->'original' or oldrow.presentation is distinct from r->'presentation'
    or oldrow.source_sha256<>r->>'source_sha256' or oldrow.projection_sha256<>r->>'projection_sha256'
    or oldrow.client_id is distinct from cid or oldrow.project_id is distinct from pid or oldrow.estimate_id is distinct from eid
    or oldrow.file_state is distinct from r->>'file_state' or oldrow.file_sha256 is distinct from r->>'file_sha256' or oldrow.file_bytes is distinct from (r->>'file_bytes')::integer then raise exception 'historical_document_conflict';end if;
   unchanged_count:=unchanged_count+1;
  else
   insert into public.historical_documents(company_id,kind,id,source_id,presentation,client_id,project_id,estimate_id,file_state,file_sha256,file_bytes)
    values(p_company,rk,rid,sid,r->'presentation',cid,pid,eid,r->>'file_state',r->>'file_sha256',(r->>'file_bytes')::integer);
   insert into app_private.historical_document_sources(company_id,kind,id,source_sha256,projection_sha256,original)
    values(p_company,rk,rid,r->>'source_sha256',r->>'projection_sha256',r->'original');
   inserted_count:=inserted_count+1;
  end if;
 end loop;
 insert into app_private.historical_document_imports(company_id,snapshot_sha256,inserted,unchanged) values(p_company,p_snapshot,inserted_count,unchanged_count);
 return jsonb_build_object('inserted',inserted_count,'unchanged',unchanged_count);
end $$;
revoke all on function app_private.import_historical_documents(uuid,text,jsonb) from public,anon,authenticated;
commit;
