-- Preserve historical provenance without creating new approvals or invoices.
begin;
alter table public.projects alter column estimate_id drop not null;
alter table public.projects add column historical_project_id uuid;
alter table public.projects add column historical_project_kind text generated always as ('projects'::text) stored;
alter table public.projects add constraint projects_source_required check(estimate_id is not null or historical_project_id is not null);
alter table public.projects add constraint projects_historical_source foreign key(company_id,historical_project_kind,historical_project_id) references public.historical_business(company_id,kind,id);
alter table public.projects add unique(company_id,historical_project_id);
alter table public.projects add unique(company_id,id,historical_project_id);
create table public.historical_project_migrations(
 company_id uuid not null references public.companies(id),historical_id uuid not null,
 historical_kind text generated always as ('projects'::text) stored,
 project_id uuid,state text not null check(state in ('imported','review')),
 review_reasons jsonb not null check(jsonb_typeof(review_reasons)='array'),migrated_at timestamptz not null default now(),
 primary key(company_id,historical_id),unique(company_id,project_id),
 foreign key(company_id,historical_kind,historical_id) references public.historical_business(company_id,kind,id),
 foreign key(company_id,project_id,historical_id) references public.projects(company_id,id,historical_project_id),
 check((state='imported' and project_id is not null and review_reasons='[]'::jsonb) or (state='review' and project_id is null and jsonb_array_length(review_reasons)>0))
);
alter table public.historical_project_migrations enable row level security;
revoke all on public.historical_project_migrations from public,anon,authenticated;
grant select on public.historical_project_migrations to authenticated;
create policy historical_project_migration_read on public.historical_project_migrations for select to authenticated using(app_private.can_access(company_id,'fin-proyectos','read'));
create table app_private.operational_project_imports(
 company_id uuid primary key references public.companies(id),snapshot_sha256 text not null,plan jsonb not null,
 expected_destination jsonb not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table app_private.operational_project_imports enable row level security;
revoke all on app_private.operational_project_imports from public,anon,authenticated;
create function app_private.import_operational_projects(p_company uuid,p_actor uuid,p_snapshot text,p_destination jsonb,p_records jsonb) returns jsonb
language plpgsql set search_path='' set timezone='UTC' as $$
declare r jsonb; v_original jsonb; h uuid; cid uuid; pid uuid; d jsonb; expected_data jsonb; current_destination jsonb; previous record; source_hash text; hist public.historical_business; reason jsonb; inserted_count integer:=0; review_count integer:=0; seen uuid[]:='{}';
begin
 if p_snapshot is null or p_snapshot!~'^[0-9a-f]{64}$' or jsonb_typeof(p_records) is distinct from 'array' or jsonb_typeof(p_destination) is distinct from 'object' or jsonb_array_length(p_records)>10000 then raise exception 'invalid_project_import';end if;
 if not exists(select 1 from public.memberships where company_id=p_company and user_id=p_actor and active and role in ('owner','admin')) then raise exception 'project_import_actor_not_manager';end if;
 lock table public.projects,public.historical_customer_migrations in share row exclusive mode;
 perform id from public.companies where id=p_company for update;
 select * into previous from app_private.operational_project_imports where company_id=p_company;
 if found then
  if previous.snapshot_sha256<>p_snapshot or previous.plan is distinct from p_records or previous.expected_destination is distinct from p_destination then raise exception 'project_import_plan_changed';end if;
  return jsonb_build_object('inserted',0,'review',0,'unchanged',jsonb_array_length(p_records));
 end if;
 select jsonb_build_object('projects',(select coalesce(jsonb_agg(to_jsonb(p)-'historical_project_id'-'historical_project_kind' order by id),'[]'::jsonb) from public.projects p where company_id=p_company),
  'customer_mappings',(select coalesce(jsonb_agg(to_jsonb(m) order by historical_id),'[]'::jsonb) from public.historical_customer_migrations m where company_id=p_company),
  'customer_ids',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.customers where company_id=p_company)) into current_destination;
 if current_destination is distinct from p_destination then raise exception 'project_destination_changed';end if;
 if jsonb_array_length(p_records)<>(select count(*) from public.historical_business where company_id=p_company and kind='projects') then raise exception 'project_source_set_incomplete';end if;
 for r in select value from jsonb_array_elements(p_records) loop
  h:=(r->>'historical_id')::uuid;
  if h is null or h=any(seen) or coalesce(r->>'state','') not in ('imported','review') or jsonb_typeof(r->'review_reasons') is distinct from 'array' then raise exception 'invalid_project_import_record';end if;
  seen:=array_append(seen,h);
  select s.original,s.source_sha256 into v_original,source_hash from app_private.historical_business_sources s where s.company_id=p_company and s.kind='projects' and s.id=h;
  if not found or source_hash is distinct from r->>'source_sha256' then raise exception 'project_source_changed';end if;
  if r->>'state'='review' then
   if r->'data' is distinct from 'null'::jsonb or r->'customer_id' is distinct from 'null'::jsonb or jsonb_array_length(r->'review_reasons') not between 1 and 20 then raise exception 'invalid_project_review';end if;
   for reason in select value from jsonb_array_elements(r->'review_reasons') loop
    if jsonb_typeof(reason)<>'string' or (reason#>>'{}')!~'^(customer_pending|estimate_reference|source_status|invalid_project_fields|invalid_project_date|source_relationship|source_duplicate|current_duplicate)$' then raise exception 'invalid_project_review_reason';end if;
   end loop;
   insert into public.historical_project_migrations(company_id,historical_id,state,review_reasons) values(p_company,h,'review',r->'review_reasons');review_count:=review_count+1;continue;
  end if;
  select * into strict hist from public.historical_business where company_id=p_company and kind='projects' and id=h;
  select customer_id into cid from public.historical_customer_migrations where company_id=p_company and historical_id=hist.client_id and state='imported';
  if cid is null or cid::text is distinct from r->>'customer_id' or hist.estimate_id is null then raise exception 'project_relationship_requires_review';end if;
  if v_original->>'status' is distinct from 'Nuevo' or r->'review_reasons' is distinct from '[]'::jsonb or jsonb_typeof(v_original->'name') is distinct from 'string' or jsonb_typeof(v_original->'project_date') is distinct from 'string' then raise exception 'project_source_requires_review';end if;
  d:=r->'data';expected_data:=jsonb_build_object('name',btrim(v_original->>'name'),'status','NUEVO','project_date',v_original->>'project_date','start_date',null,'end_date',null,'notes','');
  if d is distinct from expected_data or (d->>'project_date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_project_copy';end if;
  if exists(select 1 from app_private.historical_business_sources s where s.company_id=p_company and s.kind='projects' and s.id<>h and
   (coalesce(v_original->>'estimate_external_id','')<>'' and s.original->>'estimate_external_id'=v_original->>'estimate_external_id'))
   or exists(select 1 from public.projects p where p.company_id=p_company and p.customer_id=cid and p.id in(select (value->>'id')::uuid from jsonb_array_elements(p_destination->'projects')) and app_private.customer_match_key('full_name',p.name)=app_private.customer_match_key('full_name',v_original->>'name')) then raise exception 'project_duplicate_requires_review';end if;
  pid:=gen_random_uuid();
  insert into public.projects(id,company_id,estimate_id,historical_project_id,customer_id,name,status,project_date,notes,created_by,updated_by)
   values(pid,p_company,null,h,cid,d->>'name','NUEVO',(d->>'project_date')::date,'',p_actor,p_actor);
  insert into public.historical_project_migrations(company_id,historical_id,project_id,state,review_reasons) values(p_company,h,pid,'imported','[]');inserted_count:=inserted_count+1;
 end loop;
 insert into app_private.operational_project_imports(company_id,snapshot_sha256,plan,expected_destination,actor_id) values(p_company,p_snapshot,p_records,p_destination,p_actor);
 insert into public.audit_events(company_id,actor_id,entity,entity_id,operation,after_data) values(p_company,p_actor,'project_migration',p_company::text,'IMPORT',jsonb_build_object('inserted',inserted_count,'review',review_count));
 return jsonb_build_object('inserted',inserted_count,'review',review_count,'unchanged',0);
end $$;
revoke all on function app_private.import_operational_projects(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
commit;

