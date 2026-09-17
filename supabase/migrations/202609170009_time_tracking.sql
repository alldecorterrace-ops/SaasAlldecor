begin;
alter table public.workers add column user_id uuid references auth.users(id);
create unique index worker_login_unique on public.workers(company_id,user_id) where user_id is not null;
create table public.time_entries(
 id uuid primary key,company_id uuid not null,worker_id uuid not null,project_id uuid,
 starts_at timestamptz not null,ends_at timestamptz,break_minutes integer not null default 0 check(break_minutes between 0 and 10080),
 minutes integer generated always as (case when ends_at is null then null else greatest(0,floor(extract(epoch from (ends_at-starts_at))/60)::integer-break_minutes) end) stored,
 status text not null default 'PENDIENTE' check(status in ('PENDIENTE','APROBADO','ANULADO')),notes text not null default '' check(length(notes)<=2000),
 source text not null check(source in ('RELOJ','MANUAL','SOLICITUD')),reason text not null default '' check(length(reason)<=2000),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,worker_id) references public.workers(company_id,id),foreign key(company_id,project_id) references public.projects(company_id,id),
 check(ends_at is null or (ends_at>starts_at and ends_at-starts_at<=interval '7 days' and break_minutes<=floor(extract(epoch from (ends_at-starts_at))/60))),check(status<>'APROBADO' or ends_at is not null)
);
create unique index time_one_open on public.time_entries(company_id,worker_id) where ends_at is null and status<>'ANULADO';
create index time_entries_list on public.time_entries(company_id,starts_at desc,id);
create table public.time_requests(
 id uuid primary key,company_id uuid not null,entry_id uuid not null,entry_version integer not null,
 starts_at timestamptz not null,ends_at timestamptz not null,break_minutes integer not null check(break_minutes between 0 and 10080),
 reason text not null check(length(trim(reason)) between 3 and 2000),status text not null default 'PENDIENTE' check(status in ('PENDIENTE','APROBADA','RECHAZADA')),
 decision_note text not null default '' check(length(decision_note)<=2000),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,entry_id) references public.time_entries(company_id,id),check(ends_at>starts_at and ends_at-starts_at<=interval '7 days' and break_minutes<=floor(extract(epoch from (ends_at-starts_at))/60))
);
create unique index one_pending_time_request on public.time_requests(company_id,entry_id) where status='PENDIENTE';
create table public.time_periods(
 id uuid primary key,company_id uuid not null references public.companies(id),week_start date not null check(extract(isodow from week_start)=1),locked boolean not null,
 reason text not null check(length(trim(reason)) between 3 and 2000),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(company_id,week_start)
);
alter table public.time_entries enable row level security;alter table public.time_requests enable row level security;alter table public.time_periods enable row level security;
revoke all on public.time_entries,public.time_requests,public.time_periods from public,anon,authenticated;
grant select on public.time_entries,public.time_requests,public.time_periods to authenticated;
create policy time_entries_read on public.time_entries for select to authenticated using(app_private.can_access(company_id,'horasfix','read'));
create policy time_requests_read on public.time_requests for select to authenticated using(app_private.can_access(company_id,'horasfix','read'));
create policy time_periods_read on public.time_periods for select to authenticated using(app_private.can_access(company_id,'horasfix','read'));
create trigger time_entries_audit after insert or update on public.time_entries for each row execute function app_private.audit_change();
create trigger time_requests_audit after insert or update on public.time_requests for each row execute function app_private.audit_change();
create trigger time_periods_audit after insert or update on public.time_periods for each row execute function app_private.audit_change();

create function public.link_worker_login(p_company uuid,p_worker uuid,p_version integer,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
 if nullif(trim(p_email),'') is not null then
  select m.user_id into uid from public.memberships m join auth.users u on u.id=m.user_id where m.company_id=p_company and m.active and lower(u.email)=lower(trim(p_email));
  if uid is null then raise exception 'member_not_found';end if;
 end if;
 update public.workers set user_id=uid,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_worker and version=p_version;
 if not found then raise exception 'record_conflict' using errcode='40001';end if;
end;$$;
create function app_private.assert_time_open(p_company uuid,p_start timestamptz,p_end timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare tz text;
begin
 select timezone into tz from public.companies where id=p_company;
 if exists(select 1 from public.time_periods p where p.company_id=p_company and p.locked and p_start<((p.week_start+7)::timestamp at time zone tz) and coalesce(p_end,p_start+interval '1 microsecond')>(p.week_start::timestamp at time zone tz)) then raise exception 'period_locked';end if;
end;$$;
revoke all on function app_private.assert_time_open(uuid,timestamptz,timestamptz) from public;
create function public.save_time_entry(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.time_entries;worker uuid;proj uuid;ts timestamptz;te timestamptz;br integer;st text;nt text;why text;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or octet_length(p_data::text)>6000 then raise exception 'invalid_time';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 if p_version>0 then select * into e from public.time_entries where company_id=p_company and id=p_id for update;if not found or e.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);end if;
 worker:=(p_data->>'worker_id')::uuid;proj:=nullif(p_data->>'project_id','')::uuid;ts:=(p_data->>'starts_at')::timestamptz;te:=nullif(p_data->>'ends_at','')::timestamptz;br:=(p_data->>'break_minutes')::integer;st:=p_data->>'status';nt:=coalesce(p_data->>'notes','');why:=trim(p_data->>'reason');
 if worker is null or ts is null or te is null or te<=ts or te-ts>interval '7 days' or br is null or br<0 or br>floor(extract(epoch from (te-ts))/60) or st is null or st not in ('PENDIENTE','APROBADO','ANULADO') or length(nt)>2000 or why is null or length(why) not between 3 and 2000 then raise exception 'invalid_time';end if;
 if not exists(select 1 from public.workers where company_id=p_company and id=worker and (active or (p_version>0 and worker=e.worker_id))) then raise exception 'worker_unavailable';end if;
 if proj is not null and not exists(select 1 from public.projects where company_id=p_company and id=proj) then raise exception 'project_unavailable';end if;
 perform app_private.assert_time_open(p_company,ts,te);
 if st<>'ANULADO' and exists(select 1 from public.time_entries t where t.company_id=p_company and t.worker_id=worker and t.id<>p_id and t.status<>'ANULADO' and t.starts_at<te and coalesce(t.ends_at,'infinity')>ts) then raise exception 'time_overlap';end if;
 if p_version>0 and e.status='APROBADO' and (worker,proj,ts,te,br) is distinct from (e.worker_id,e.project_id,e.starts_at,e.ends_at,e.break_minutes) and st<>'ANULADO' then st:='PENDIENTE';end if;
 if p_version=0 then insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,break_minutes,status,notes,source,reason,created_by,updated_by) values(p_id,p_company,worker,proj,ts,te,br,st,nt,'MANUAL',why,auth.uid(),auth.uid());
 else update public.time_entries set worker_id=worker,project_id=proj,starts_at=ts,ends_at=te,break_minutes=br,status=st,notes=nt,reason=why,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$$;
create function public.punch_time(p_company uuid,p_id uuid,p_action text,p_project uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare w public.workers;e public.time_entries;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select * into w from public.workers where company_id=p_company and user_id=auth.uid() and active;
 if not found then raise exception 'worker_login_required';end if;
 if p_id is null or p_action is null or p_action not in ('IN','OUT') then raise exception 'invalid_punch';end if;
 select * into e from public.time_entries where company_id=p_company and id=p_id and worker_id=w.id;
 if p_action='IN' then
  if found then if e.source='RELOJ' and e.created_by=auth.uid() then return e.id;end if;raise exception 'request_conflict';end if;
  if p_project is not null and (not app_private.can_access(p_company,'fin-proyectos','read') or not exists(select 1 from public.projects where company_id=p_company and id=p_project)) then raise exception 'project_unavailable';end if;
  perform app_private.assert_time_open(p_company,now(),null);
  if exists(select 1 from public.time_entries where company_id=p_company and worker_id=w.id and status<>'ANULADO' and coalesce(ends_at,'infinity')>now()) then raise exception 'time_overlap';end if;
  insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,source,created_by,updated_by) values(p_id,p_company,w.id,p_project,now(),'RELOJ',auth.uid(),auth.uid());
 else
  if not found or e.status='ANULADO' then raise exception 'entry_unavailable';end if;
  if e.ends_at is not null then return e.id;end if;
  perform app_private.assert_time_open(p_company,e.starts_at,now());
  update public.time_entries set ends_at=now(),version=version+1,updated_by=auth.uid(),updated_at=now() where id=e.id;
 end if;
 return p_id;
end;$$;
create function public.request_time_change(p_company uuid,p_id uuid,p_entry uuid,p_version integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.time_entries;ts timestamptz;te timestamptz;br integer;why text;existing public.time_requests;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select * into e from public.time_entries where company_id=p_company and id=p_entry for update;
 if not found or (not app_private.is_manager(p_company) and not exists(select 1 from public.workers where company_id=p_company and id=e.worker_id and user_id=auth.uid() and active)) then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_data is null or octet_length(p_data::text)>5000 then raise exception 'invalid_request';end if;
 ts:=(p_data->>'starts_at')::timestamptz;te:=(p_data->>'ends_at')::timestamptz;br:=(p_data->>'break_minutes')::integer;why:=trim(p_data->>'reason');
 select * into existing from public.time_requests where company_id=p_company and id=p_id;
 if found then if (existing.entry_id,existing.starts_at,existing.ends_at,existing.break_minutes,existing.reason,existing.created_by) is not distinct from (p_entry,ts,te,br,why,auth.uid()) then return p_id;end if;raise exception 'request_conflict';end if;
 if p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);perform app_private.assert_time_open(p_company,ts,te);
 if e.status='ANULADO' or ts is null or te is null or br is null or why is null then raise exception 'invalid_request';end if;
 insert into public.time_requests(id,company_id,entry_id,entry_version,starts_at,ends_at,break_minutes,reason,created_by,updated_by) values(p_id,p_company,p_entry,p_version,ts,te,br,why,auth.uid(),auth.uid());
 return p_id;
end;$$;
create function public.decide_time_request(p_company uuid,p_id uuid,p_version integer,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare req public.time_requests;e public.time_entries;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select * into req from public.time_requests where company_id=p_company and id=p_id for update;
 if not found or p_version is null or req.version<>p_version or req.status<>'PENDIENTE' then raise exception 'record_conflict' using errcode='40001';end if;
 if p_approve is null or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'reason_required';end if;
 if p_approve then
  select * into e from public.time_entries where company_id=p_company and id=req.entry_id;
  perform public.save_time_entry(p_company,e.id,req.entry_version,jsonb_build_object('worker_id',e.worker_id,'project_id',e.project_id,'starts_at',req.starts_at,'ends_at',req.ends_at,'break_minutes',req.break_minutes,'status','PENDIENTE','notes',e.notes,'reason',req.reason||' / '||p_note));
 end if;
 update public.time_requests set status=case when p_approve then 'APROBADA' else 'RECHAZADA' end,decision_note=p_note,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$$;
create function public.set_time_period(p_company uuid,p_week date,p_locked boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare tz text;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_week is null or extract(isodow from p_week)<>1 or p_locked is null or p_reason is null or length(trim(p_reason)) not between 3 and 2000 then raise exception 'invalid_period';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select timezone into tz from public.companies where id=p_company;
 if p_locked and (exists(select 1 from public.time_entries where company_id=p_company and status<>'ANULADO' and starts_at<((p_week+7)::timestamp at time zone tz) and coalesce(ends_at,'infinity')>(p_week::timestamp at time zone tz) and (ends_at is null or status<>'APROBADO')) or exists(select 1 from public.time_requests r join public.time_entries e on e.id=r.entry_id where r.company_id=p_company and r.status='PENDIENTE' and e.starts_at<((p_week+7)::timestamp at time zone tz) and coalesce(e.ends_at,'infinity')>(p_week::timestamp at time zone tz))) then raise exception 'unreviewed_period';end if;
 insert into public.time_periods(id,company_id,week_start,locked,reason,created_by,updated_by) values(gen_random_uuid(),p_company,p_week,p_locked,trim(p_reason),auth.uid(),auth.uid()) on conflict(company_id,week_start) do update set locked=excluded.locked,reason=excluded.reason,version=time_periods.version+1,updated_by=auth.uid(),updated_at=now();
end;$$;
revoke all on function public.link_worker_login(uuid,uuid,integer,text),public.save_time_entry(uuid,uuid,integer,jsonb),public.punch_time(uuid,uuid,text,uuid),public.request_time_change(uuid,uuid,uuid,integer,jsonb),public.decide_time_request(uuid,uuid,integer,boolean,text),public.set_time_period(uuid,date,boolean,text) from public,anon;
grant execute on function public.link_worker_login(uuid,uuid,integer,text),public.save_time_entry(uuid,uuid,integer,jsonb),public.punch_time(uuid,uuid,text,uuid),public.request_time_change(uuid,uuid,uuid,integer,jsonb),public.decide_time_request(uuid,uuid,integer,boolean,text),public.set_time_period(uuid,date,boolean,text) to authenticated;
-- Keep one audited module resolver for history and activity.
create or replace function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'time_entries' then 'horasfix' when 'time_requests' then 'horasfix' when 'time_periods' then 'horasfix' when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;
create function public.my_time_worker(p_company uuid) returns table(id uuid,name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select w.id,w.name from public.workers w where w.company_id=p_company and w.user_id=auth.uid() and w.active;
end;$$;
revoke all on function public.my_time_worker(uuid) from public,anon;
grant execute on function public.my_time_worker(uuid) to authenticated;
commit;
