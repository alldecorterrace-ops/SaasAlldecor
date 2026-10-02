-- Dated Labor inputs only. No business import, payroll posting or payment.
begin;
create function app_private.can_read_labor(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.is_manager(p_company) and app_private.can_access(p_company,'gastos','read')
 and app_private.can_access(p_company,'trabajadores','read') and app_private.can_access(p_company,'horasfix','read')
 and app_private.can_access(p_company,'fin-proyectos','read');
$$;
revoke all on function app_private.can_read_labor(uuid) from public,anon,authenticated;
grant execute on function app_private.can_read_labor(uuid) to authenticated;
create table public.labor_rates(
 id uuid primary key,company_id uuid not null,worker_id uuid not null,
 starts_on date not null,ends_on date,amount numeric(12,2) not null check(amount>0),active boolean not null,
 reason text not null check(length(trim(reason)) between 5 and 1000),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,worker_id) references public.workers(company_id,id),
 check(ends_on is null or ends_on>=starts_on)
);
create index labor_rate_dates on public.labor_rates(company_id,worker_id,starts_on) where active;
create table public.labor_project_terms(
 id uuid primary key,company_id uuid not null,mode text not null check(mode in ('day','adjustment')),
 responsible_id uuid,amount numeric(12,2),cost_date date,estimate_id uuid,estimate_version integer,
 active boolean not null,reason text not null check(length(trim(reason)) between 5 and 1000),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,id) references public.projects(company_id,id),
 foreign key(company_id,responsible_id) references public.workers(company_id,id),
 foreign key(company_id,estimate_id,estimate_version) references public.estimate_revisions(company_id,estimate_id,version),
 check((mode='day' and responsible_id is null and amount is null and cost_date is null and estimate_id is null and estimate_version is null)
 or (mode='adjustment' and responsible_id is not null and amount is not null and amount>0 and cost_date is not null and estimate_id is not null and estimate_version is not null and estimate_version>0))
);
create table public.labor_settings(
 id uuid primary key,company_id uuid not null unique references public.companies(id),
 shared_day_rule text not null check(shared_day_rule in ('review','minutes')),
 reason text not null check(length(trim(reason)) between 5 and 1000),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(id=company_id)
);
create table public.labor_expense_links(
 id uuid primary key,company_id uuid not null,source_snapshot jsonb not null,allocations jsonb not null,
 active boolean not null,reason text not null check(length(trim(reason)) between 5 and 1000),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,id) references public.expenses(company_id,id),
 check(jsonb_typeof(allocations)='array' and jsonb_array_length(allocations) between 1 and 100)
);
create table app_private.labor_config_requests(
 company_id uuid not null references public.companies(id),actor_id uuid not null references auth.users(id),
 request_id uuid not null,payload jsonb not null,result uuid not null,created_at timestamptz not null default now(),
 primary key(company_id,actor_id,request_id)
);
revoke all on app_private.labor_config_requests from public,anon,authenticated;
alter table public.labor_rates enable row level security;
alter table public.labor_project_terms enable row level security;
alter table public.labor_settings enable row level security;
alter table public.labor_expense_links enable row level security;
revoke all on public.labor_rates,public.labor_project_terms,public.labor_settings,public.labor_expense_links from public,anon,authenticated;
grant select on public.labor_rates,public.labor_project_terms,public.labor_settings,public.labor_expense_links to authenticated;
create policy labor_rates_read on public.labor_rates for select to authenticated using(app_private.can_read_labor(company_id));
create policy labor_terms_read on public.labor_project_terms for select to authenticated using(app_private.can_read_labor(company_id));
create policy labor_settings_read on public.labor_settings for select to authenticated using(app_private.can_read_labor(company_id));
create policy labor_links_read on public.labor_expense_links for select to authenticated using(app_private.can_read_labor(company_id));
create trigger labor_rates_audit after insert or update on public.labor_rates for each row execute function app_private.audit_change();
create trigger labor_terms_audit after insert or update on public.labor_project_terms for each row execute function app_private.audit_change();
create trigger labor_settings_audit after insert or update on public.labor_settings for each row execute function app_private.audit_change();
create trigger labor_links_audit after insert or update on public.labor_expense_links for each row execute function app_private.audit_change();
create function app_private.labor_expense_snapshot(e public.expenses) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('project',e.project_id,'worker',e.worker_id,'amount',e.amount,'category',e.category,'status',e.status);
$$;
revoke all on function app_private.labor_expense_snapshot(public.expenses) from public,anon,authenticated;
create function public.save_labor_config(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_kind text,p_data jsonb,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior app_private.labor_config_requests;body jsonb;old jsonb;worker uuid;responsible uuid;entry jsonb;
 start_date date;end_date date;cost_date date;amount numeric;mode text;enabled boolean;rule text;estimate uuid;ev integer;e public.expenses;
 allocations jsonb;total numeric:=0;keys integer;payload jsonb;
begin
 if not app_private.can_read_labor(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_request is null or p_id is null or p_version is null or p_version<0 or p_kind is null or p_kind not in ('RATE','PROJECT','SETTINGS','HISTORICAL') or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>30000 or p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'invalid_labor_config' using errcode='22023';end if;
 payload:=jsonb_build_object('kind',p_kind,'id',p_id,'version',p_version,'data',p_data,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':labor-config',0));
 -- Permission revocation waits on the same authenticated membership while this effect commits.
 perform 1 from public.memberships where company_id=p_company and user_id=auth.uid() and active for share;
 if not found or not app_private.can_read_labor(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into prior from app_private.labor_config_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 select case p_kind when 'RATE' then (select to_jsonb(v) from public.labor_rates v where company_id=p_company and id=p_id)
 when 'PROJECT' then (select to_jsonb(v) from public.labor_project_terms v where company_id=p_company and id=p_id)
 when 'SETTINGS' then (select to_jsonb(v) from public.labor_settings v where company_id=p_company and id=p_id)
 else (select to_jsonb(v) from public.labor_expense_links v where company_id=p_company and id=p_id) end into old;
 if (p_version=0 and old is not null) or (p_version>0 and (old is null or (old->>'version')::integer<>p_version)) then raise exception 'record_conflict' using errcode='PT409';end if;
 body:=p_data;
 if p_kind='RATE' then
  if exists(select 1 from jsonb_each(body) where key not in ('worker','from','to','amount','active')) or jsonb_typeof(body->'active') is distinct from 'boolean' or coalesce(body->>'from','')!~'^\d{4}-\d{2}-\d{2}$' or (coalesce(body->>'to','')<>'' and body->>'to'!~'^\d{4}-\d{2}-\d{2}$') or coalesce(body->>'amount','')!~'^\d{1,10}(\.\d{1,2})?$' then raise exception 'invalid_labor_config';end if;
  worker:=(body->>'worker')::uuid;start_date:=(body->>'from')::date;end_date:=nullif(body->>'to','')::date;amount:=(body->>'amount')::numeric;enabled:=(body->>'active')::boolean;
  if amount<=0 or end_date<start_date or not exists(select 1 from public.workers where company_id=p_company and id=worker) or (old is not null and (old->>'worker_id')::uuid<>worker) then raise exception 'invalid_labor_config';end if;
  if enabled and exists(select 1 from public.labor_rates where company_id=p_company and worker_id=worker and id<>p_id and active and starts_on<=coalesce(end_date,'infinity'::date) and coalesce(ends_on,'infinity'::date)>=start_date) then raise exception 'labor_rate_overlap' using errcode='PT409';end if;
  insert into public.labor_rates(id,company_id,worker_id,starts_on,ends_on,amount,active,reason,created_by,updated_by) values(p_id,p_company,worker,start_date,end_date,amount,enabled,trim(p_reason),auth.uid(),auth.uid())
  on conflict(id) do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on,amount=excluded.amount,active=excluded.active,reason=excluded.reason,version=labor_rates.version+1,updated_by=auth.uid(),updated_at=now() where labor_rates.company_id=p_company;
 elsif p_kind='PROJECT' then
  if exists(select 1 from jsonb_each(body) where key not in ('mode','responsible','amount','date','estimate_version','active')) or jsonb_typeof(body->'active') is distinct from 'boolean' or body->>'mode' not in ('day','adjustment') then raise exception 'invalid_labor_config';end if;
  mode:=body->>'mode';enabled:=(body->>'active')::boolean;
  select estimate_id into estimate from public.projects where company_id=p_company and id=p_id for share;
  if not found then raise exception 'invalid_labor_config';end if;
  if mode='adjustment' then
   if not app_private.can_access(p_company,'fin-estimados','read') then raise exception 'permission_denied' using errcode='42501';end if;
   if coalesce(body->>'amount','')!~'^\d{1,10}(\.\d{1,2})?$' or coalesce(body->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(body->>'estimate_version','')!~'^\d{1,9}$' then raise exception 'invalid_labor_config';end if;
   responsible:=(body->>'responsible')::uuid;amount:=(body->>'amount')::numeric;cost_date:=(body->>'date')::date;ev:=(body->>'estimate_version')::integer;
   if amount<=0 or not exists(select 1 from public.workers where company_id=p_company and id=responsible) or not exists(select 1 from public.estimate_revisions where company_id=p_company and estimate_id=estimate and version=ev) then raise exception 'invalid_labor_config';end if;
  else estimate:=null;end if;
  insert into public.labor_project_terms(id,company_id,mode,responsible_id,amount,cost_date,estimate_id,estimate_version,active,reason,created_by,updated_by) values(p_id,p_company,mode,responsible,amount,cost_date,estimate,ev,enabled,trim(p_reason),auth.uid(),auth.uid())
  on conflict(id) do update set mode=excluded.mode,responsible_id=excluded.responsible_id,amount=excluded.amount,cost_date=excluded.cost_date,estimate_id=excluded.estimate_id,estimate_version=excluded.estimate_version,active=excluded.active,reason=excluded.reason,version=labor_project_terms.version+1,updated_by=auth.uid(),updated_at=now() where labor_project_terms.company_id=p_company;
 elsif p_kind='SETTINGS' then
  if p_id<>p_company or exists(select 1 from jsonb_each(body) where key<>'shared_day_rule') or body->>'shared_day_rule' not in ('review','minutes') then raise exception 'invalid_labor_config';end if;
  rule:=body->>'shared_day_rule';
  insert into public.labor_settings(id,company_id,shared_day_rule,reason,created_by,updated_by) values(p_company,p_company,rule,trim(p_reason),auth.uid(),auth.uid())
  on conflict(id) do update set shared_day_rule=excluded.shared_day_rule,reason=excluded.reason,version=labor_settings.version+1,updated_by=auth.uid(),updated_at=now() where labor_settings.company_id=p_company;
 else
  if exists(select 1 from jsonb_each(body) where key not in ('expense_version','allocations','active')) or jsonb_typeof(body->'active') is distinct from 'boolean' or jsonb_typeof(body->'allocations') is distinct from 'array' or jsonb_array_length(body->'allocations') not between 1 and 100 then raise exception 'invalid_labor_config';end if;
  select * into e from public.expenses where company_id=p_company and id=p_id for share;
  if not found or e.project_id is null or e.status<>'APROBADO' or e.version<>coalesce((body->>'expense_version')::integer,0) or e.category!~*'mano.*obra|labor|subcontr|n[oó]mina' then raise exception 'labor_source_changed' using errcode='PT409';end if;
  allocations:=body->'allocations';enabled:=(body->>'active')::boolean;
  for entry in select value from jsonb_array_elements(allocations) loop
   if jsonb_typeof(entry)<>'object' or exists(select 1 from jsonb_each(entry) where key not in ('worker','date','cents')) or coalesce(entry->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(entry->>'cents','')!~'^\d{1,12}$' then raise exception 'invalid_labor_config';end if;
   worker:=(entry->>'worker')::uuid;cost_date:=(entry->>'date')::date;amount:=(entry->>'cents')::numeric;
   if amount<=0 or not exists(select 1 from public.workers where company_id=p_company and id=worker) or (e.worker_id is not null and worker<>e.worker_id) then raise exception 'invalid_labor_config';end if;
   total:=total+amount;
  end loop;
  select count(distinct (value->>'worker',value->>'date')) into keys from jsonb_array_elements(allocations);
  if keys<>jsonb_array_length(allocations) or total<>e.amount*100 then raise exception 'labor_allocation_total' using errcode='PT409';end if;
  insert into public.labor_expense_links(id,company_id,source_snapshot,allocations,active,reason,created_by,updated_by) values(p_id,p_company,app_private.labor_expense_snapshot(e),allocations,enabled,trim(p_reason),auth.uid(),auth.uid())
  on conflict(id) do update set source_snapshot=excluded.source_snapshot,allocations=excluded.allocations,active=excluded.active,reason=excluded.reason,version=labor_expense_links.version+1,updated_by=auth.uid(),updated_at=now() where labor_expense_links.company_id=p_company;
 end if;
 if not found then raise exception 'record_conflict' using errcode='PT409';end if;
 insert into app_private.labor_config_requests values(p_company,auth.uid(),p_request,payload,p_id,now());
 return p_id;
end;$$;
revoke all on function public.save_labor_config(uuid,uuid,uuid,integer,text,jsonb,text) from public,anon;
grant execute on function public.save_labor_config(uuid,uuid,uuid,integer,text,jsonb,text) to authenticated;
create function public.labor_context(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not app_private.can_read_labor(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
 if (select count(*) from public.time_entries where company_id=p_company)>20000 then raise exception 'labor_pagination_required';end if;
 select jsonb_build_object('company',p_company,'timezone',c.timezone,
 'splitRule',coalesce((select shared_day_rule from public.labor_settings where company_id=p_company),'review'),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('external_id',t.id,'worker_id',t.worker_id,'project_external_id',coalesce(t.project_id::text,''),'clock_in',floor(extract(epoch from t.starts_at))::bigint,'clock_out',floor(extract(epoch from t.ends_at))::bigint,'minutes',t.minutes,
 'status',case when t.ends_at is null then 'open' else 'closed' end,
 'review_status',case when t.status<>'APROBADO' or not exists(select 1 from public.workforce_assignments a where a.company_id=t.company_id and a.worker_id=t.worker_id and a.project_id=t.project_id and (a.active or a.ends_at is not null) and a.starts_at<=t.starts_at and (a.ends_at is null or a.ends_at>=t.ends_at)) then 'NEEDS_REVIEW' else 'OK' end,
 'req_status',case when exists(select 1 from public.time_requests r where r.company_id=t.company_id and r.entry_id=t.id and r.status='PENDIENTE') then 'PENDING' else '' end) order by t.starts_at,t.id) from public.time_entries t where t.company_id=p_company and t.status<>'ANULADO'),'[]'),
 'rates',coalesce((select jsonb_object_agg(worker_id,rates) from (select worker_id,jsonb_agg(jsonb_build_object('from',starts_on,'to',ends_on,'cents',(amount*100)::bigint) order by starts_on,id) rates from public.labor_rates where company_id=p_company and active group by worker_id) r),'{}'),
 'projects',coalesce((select jsonb_object_agg(id,jsonb_build_object('mode',mode)) from public.labor_project_terms where company_id=p_company and active),'{}'),
 'adjustments',coalesce((select jsonb_object_agg(id,jsonb_build_object('id',id,'workerId',responsible_id,'amountCents',(amount*100)::bigint,'estimateId',estimate_id,'revision',estimate_version::text)) from public.labor_project_terms where company_id=p_company and active and mode='adjustment'),'{}'),
 'historical',coalesce((select jsonb_agg(jsonb_build_object('id',e.id::text||':'||(a.value->>'worker')||':'||(a.value->>'date'),'workerId',a.value->>'worker','projectId',e.project_id,'date',a.value->>'date','amountCents',(a.value->>'cents')::bigint) order by e.id,a.value->>'worker',a.value->>'date') from public.expenses e join public.labor_expense_links l on l.company_id=e.company_id and l.id=e.id and l.active cross join lateral jsonb_array_elements(l.allocations) a where e.company_id=p_company and e.status<>'ANULADO' and l.source_snapshot=app_private.labor_expense_snapshot(e)),'[]'),
 'unmapped',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'projectId',e.project_id,'date',e.expense_date,'amountCents',(e.amount*100)::bigint,'reason','EXISTING_LABOR_RECONCILIATION_REQUIRED') order by e.expense_date,e.id) from public.expenses e where e.company_id=p_company and e.status<>'ANULADO' and (e.category~*'mano.*obra|labor|subcontr|n[oó]mina' or exists(select 1 from public.labor_expense_links x where x.company_id=e.company_id and x.id=e.id and x.active)) and not exists(select 1 from public.labor_expense_links l where l.company_id=e.company_id and l.id=e.id and l.active and l.source_snapshot=app_private.labor_expense_snapshot(e))),'[]'),
 'names',jsonb_build_object('workers',coalesce((select jsonb_object_agg(id,name) from public.workers where company_id=p_company),'{}'),'projects',coalesce((select jsonb_object_agg(id,name) from public.projects where company_id=p_company),'{}')),
 'adjustmentDates',coalesce((select jsonb_object_agg(id,cost_date) from public.labor_project_terms where company_id=p_company and active and mode='adjustment'),'{}')) into result from public.companies c where c.id=p_company;
 return result;
end;$$;
revoke all on function public.labor_context(uuid) from public,anon;
grant execute on function public.labor_context(uuid) to authenticated;
create or replace function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'labor_rates' then 'gastos' when 'labor_project_terms' then 'gastos' when 'labor_settings' then 'gastos' when 'labor_expense_links' then 'gastos' when 'workforce_expenses' then 'horasfix' when 'workforce_profiles' then 'trabajadores' when 'workforce_assignments' then 'trabajadores' when 'web_forms' then 'estimadosweb' when 'web_requests' then 'estimadosweb' when 'designs' then p_data->>'kind' when 'price_books' then 'adm-precios' when 'client_shares' then case p_data->>'kind' when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end when 'assistant_settings' then 'ia' when 'time_entries' then 'horasfix' when 'time_requests' then 'horasfix' when 'time_periods' then 'horasfix' when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;
create or replace function app_private.can_read_time_audit(p_company uuid,p_entity text,p_before jsonb,p_after jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_entity in ('labor_rates','labor_project_terms','labor_settings','labor_expense_links') then app_private.can_read_labor(p_company) when p_entity='workforce_expenses' then app_private.can_read_workforce_expense_record(p_company,(coalesce(p_after,p_before)->>'id')::uuid) when p_entity in ('workforce_profiles','workforce_assignments') then app_private.is_manager(p_company) when p_entity not in ('time_entries','time_requests','time_periods') then true
 when app_private.is_manager(p_company) then true
 else app_private.can_read_time_record(p_company,p_entity,(coalesce(p_after,p_before)->>'id')::uuid)
 and (p_entity<>'time_entries' or (
  (p_before is null or app_private.can_read_time_worker(p_company,(p_before->>'worker_id')::uuid))
  and (p_after is null or app_private.can_read_time_worker(p_company,(p_after->>'worker_id')::uuid))
 )) end;
$$;
notify pgrst,'reload schema';
commit;
