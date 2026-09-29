-- Explicit Workforce identity and time-bounded project scope. No business imports.
begin;
create table public.workforce_profiles (
 id uuid primary key, company_id uuid not null, role text not null check(role in ('WORKER','FOREMAN','OFFICE')),
 supervisor_id uuid, enabled boolean not null default true, version integer not null default 1,
 reason text not null check(length(trim(reason)) between 5 and 1000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id), foreign key(company_id,id) references public.workers(company_id,id),
 foreign key(company_id,supervisor_id) references public.workers(company_id,id), check(supervisor_id is distinct from id)
);
create table public.workforce_assignments (
 id uuid primary key, company_id uuid not null, worker_id uuid not null, project_id uuid not null,
 starts_at timestamptz not null, ends_at timestamptz, active boolean not null default true,
 version integer not null default 1, reason text not null check(length(trim(reason)) between 5 and 1000),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id), foreign key(company_id,worker_id) references public.workers(company_id,id),
 foreign key(company_id,project_id) references public.projects(company_id,id), check(ends_at is null or ends_at>starts_at)
);
create index workforce_assignment_scope on public.workforce_assignments(company_id,worker_id,project_id,starts_at) where active;
-- Receipts of administration commands stay private; response loss never creates a second effect.
create table app_private.workforce_admin_requests (
 company_id uuid not null references public.companies(id), actor_id uuid not null references auth.users(id),
 request_id uuid not null, payload jsonb not null, result uuid not null, created_at timestamptz not null default now(),
 primary key(company_id,actor_id,request_id)
);
revoke all on app_private.workforce_admin_requests from public,anon,authenticated;
alter table public.workforce_profiles enable row level security;
alter table public.workforce_assignments enable row level security;
revoke all on public.workforce_profiles,public.workforce_assignments from public,anon,authenticated;
grant select on public.workforce_profiles,public.workforce_assignments to authenticated;
create policy workforce_profiles_admin_read on public.workforce_profiles for select to authenticated using(app_private.is_manager(company_id));
create policy workforce_assignments_admin_read on public.workforce_assignments for select to authenticated using(app_private.is_manager(company_id));
create trigger workforce_profiles_audit after insert or update on public.workforce_profiles for each row execute function app_private.audit_change();
create trigger workforce_assignments_audit after insert or update on public.workforce_assignments for each row execute function app_private.audit_change();

create function app_private.workforce_actor(p_company uuid) returns public.workforce_profiles
language sql stable security definer set search_path='' as $$
 select f from public.workforce_profiles f join public.workers w on w.company_id=f.company_id and w.id=f.id
 where f.company_id=p_company and f.enabled and w.active and w.user_id=auth.uid()
 and app_private.can_access(p_company,'horasfix','read');
$$;
create function app_private.can_view_workforce_worker(p_company uuid,p_worker uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;
begin
 if app_private.is_manager(p_company) then return exists(select 1 from public.workers where company_id=p_company and id=p_worker);end if;
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null then return false;end if;
 return exists(select 1 from public.workers w join public.workforce_profiles f on f.company_id=w.company_id and f.id=w.id
 where w.company_id=p_company and w.id=p_worker and w.active and f.enabled
 and (w.id=actor.id or actor.role='OFFICE' or (actor.role='FOREMAN' and f.supervisor_id=actor.id)));
end;$$;
create function app_private.can_use_workforce_project(p_company uuid,p_project uuid,p_at timestamptz) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;
begin
 if p_at is null or not isfinite(p_at) or not exists(select 1 from public.projects where company_id=p_company and id=p_project and status not in ('COMPLETADO','CANCELADO')) then return false;end if;
 if app_private.is_manager(p_company) then return true;end if;
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null then return false;end if;
 return actor.role='OFFICE' or exists(select 1 from public.workforce_assignments a where a.company_id=p_company
 and a.worker_id=actor.id and a.project_id=p_project and a.active and a.starts_at<=p_at and (a.ends_at is null or a.ends_at>p_at));
end;$$;
revoke all on function app_private.workforce_actor(uuid),app_private.can_view_workforce_worker(uuid,uuid),app_private.can_use_workforce_project(uuid,uuid,timestamptz) from public,anon,authenticated;

create function public.configure_workforce(p_company uuid,p_request uuid,p_worker uuid,p_version integer,p_role text,p_supervisor uuid,p_enabled boolean,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.workforce_profiles;receipt app_private.workforce_admin_requests;payload jsonb;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_request is null or p_worker is null or p_version is null or p_version<0 or p_role is null or p_role not in ('WORKER','FOREMAN','OFFICE') or p_enabled is null or p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'invalid_workforce_profile';end if;
 payload:=jsonb_build_object('operation','profile','worker',p_worker,'version',p_version,'role',p_role,'supervisor',p_supervisor,'enabled',p_enabled,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':workforce-admin',0));
 select * into receipt from app_private.workforce_admin_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if receipt.payload=payload then return receipt.result;end if;raise exception 'request_conflict';end if;
 select * into old from public.workforce_profiles where company_id=p_company and id=p_worker for update;
 if (p_version=0 and found) or (p_version>0 and (not found or old.version<>p_version)) then raise exception 'record_conflict' using errcode='PT409';end if;
 if not exists(select 1 from public.workers where company_id=p_company and id=p_worker and (active or not p_enabled)) then raise exception 'worker_unavailable';end if;
 if p_supervisor is not null and (p_supervisor=p_worker or not exists(select 1 from public.workforce_profiles f join public.workers w on w.company_id=f.company_id and w.id=f.id where f.company_id=p_company and f.id=p_supervisor and f.role='FOREMAN' and f.enabled and w.active)) then raise exception 'supervisor_unavailable';end if;
 if p_version=0 then
  insert into public.workforce_profiles(id,company_id,role,supervisor_id,enabled,reason,created_by,updated_by) values(p_worker,p_company,p_role,p_supervisor,p_enabled,trim(p_reason),auth.uid(),auth.uid());
 else
  update public.workforce_profiles set role=p_role,supervisor_id=p_supervisor,enabled=p_enabled,reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_worker;
 end if;
 insert into app_private.workforce_admin_requests values(p_company,auth.uid(),p_request,payload,p_worker,now());
 return p_worker;
end;$$;
create function public.save_workforce_assignment(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_worker uuid,p_project uuid,p_start timestamptz,p_end timestamptz,p_active boolean,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.workforce_assignments;receipt app_private.workforce_admin_requests;payload jsonb;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_request is null or p_id is null or p_version is null or p_version<0 or p_worker is null or p_project is null or p_start is null or not isfinite(p_start) or (p_end is not null and (not isfinite(p_end) or p_end<=p_start)) or p_active is null or p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'invalid_assignment';end if;
 if p_version=0 and not p_active then raise exception 'invalid_assignment';end if;
 payload:=jsonb_build_object('operation','assignment','id',p_id,'version',p_version,'worker',p_worker,'project',p_project,'start',p_start,'end',p_end,'active',p_active,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':workforce-admin',0));
 select * into receipt from app_private.workforce_admin_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if receipt.payload=payload then return receipt.result;end if;raise exception 'request_conflict';end if;
 select * into old from public.workforce_assignments where company_id=p_company and id=p_id for update;
 if (p_version=0 and found) or (p_version>0 and (not found or old.version<>p_version)) then raise exception 'record_conflict' using errcode='PT409';end if;
 -- An existing assignment's identity is immutable. End/revoke it and create another.
 if p_version>0 then
  if (p_worker,p_project,p_start) is distinct from (old.worker_id,old.project_id,old.starts_at) then raise exception 'assignment_identity_locked';end if;
  if p_active or not old.active then raise exception 'assignment_closed';end if;
  p_end:=coalesce(p_end,now());
  if p_end<=old.starts_at then raise exception 'invalid_assignment';end if;
 end if;
 if not exists(select 1 from public.workers where company_id=p_company and id=p_worker) or not exists(select 1 from public.projects where company_id=p_company and id=p_project) then raise exception 'assignment_unavailable';end if;
 if p_active and (not exists(select 1 from public.workers w join public.workforce_profiles f on f.company_id=w.company_id and f.id=w.id where w.company_id=p_company and w.id=p_worker and w.active and f.enabled) or not exists(select 1 from public.projects where company_id=p_company and id=p_project and status not in ('COMPLETADO','CANCELADO'))) then raise exception 'assignment_unavailable';end if;
 if p_active and exists(select 1 from public.workforce_assignments where company_id=p_company and worker_id=p_worker and project_id=p_project and id<>p_id and active and starts_at<coalesce(p_end,'infinity') and coalesce(ends_at,'infinity')>p_start) then raise exception 'assignment_overlap';end if;
 if p_version=0 then
  insert into public.workforce_assignments(id,company_id,worker_id,project_id,starts_at,ends_at,active,reason,created_by,updated_by) values(p_id,p_company,p_worker,p_project,p_start,p_end,p_active,trim(p_reason),auth.uid(),auth.uid());
 else
  update public.workforce_assignments set starts_at=p_start,ends_at=p_end,active=p_active,reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
 insert into app_private.workforce_admin_requests values(p_company,auth.uid(),p_request,payload,p_id,now());
 return p_id;
end;$$;
-- Deliberately return no pay, email, phone, financial records or authentication IDs.
create function public.workforce_scope(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;team jsonb;projects jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 actor:=app_private.workforce_actor(p_company);
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',f.role,'supervisor_id',f.supervisor_id) order by w.name,w.id),'[]') into team
 from public.workers w join public.workforce_profiles f on f.company_id=w.company_id and f.id=w.id
 where w.company_id=p_company and w.active and f.enabled and app_private.can_view_workforce_worker(p_company,w.id);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id),'[]') into projects from public.projects p where p.company_id=p_company and app_private.can_use_workforce_project(p_company,p.id,now());
 return jsonb_build_object('actor_id',actor.id,'role',case when app_private.is_manager(p_company) then 'ADMIN' else actor.role end,'team',team,'projects',projects);
end;$$;
revoke all on function public.configure_workforce(uuid,uuid,uuid,integer,text,uuid,boolean,text),public.save_workforce_assignment(uuid,uuid,uuid,integer,uuid,uuid,timestamptz,timestamptz,boolean,text),public.workforce_scope(uuid) from public,anon;
grant execute on function public.configure_workforce(uuid,uuid,uuid,integer,text,uuid,boolean,text),public.save_workforce_assignment(uuid,uuid,uuid,integer,uuid,uuid,timestamptz,timestamptz,boolean,text),public.workforce_scope(uuid) to authenticated;

create or replace function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'workforce_profiles' then 'trabajadores' when 'workforce_assignments' then 'trabajadores' when 'web_forms' then 'estimadosweb' when 'web_requests' then 'estimadosweb' when 'designs' then p_data->>'kind' when 'price_books' then 'adm-precios' when 'client_shares' then case p_data->>'kind' when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end when 'assistant_settings' then 'ia' when 'time_entries' then 'horasfix' when 'time_requests' then 'horasfix' when 'time_periods' then 'horasfix' when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;
create or replace function app_private.can_read_time_audit(p_company uuid,p_entity text,p_before jsonb,p_after jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_entity in ('workforce_profiles','workforce_assignments') then app_private.is_manager(p_company) when p_entity not in ('time_entries','time_requests','time_periods') then true
 when app_private.is_manager(p_company) then true
 else app_private.can_read_time_record(p_company,p_entity,(coalesce(p_after,p_before)->>'id')::uuid)
 and (p_entity<>'time_entries' or (
  (p_before is null or app_private.can_read_time_worker(p_company,(p_before->>'worker_id')::uuid))
  and (p_after is null or app_private.can_read_time_worker(p_company,(p_after->>'worker_id')::uuid))
 )) end;
$$;
-- Calendar-day form uses the company's timezone; the core also supports exact instants.
create function public.save_workforce_assignment_days(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_worker uuid,p_project uuid,p_start date,p_end date,p_active boolean,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare tz text;exact_start timestamptz;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 select timezone into tz from public.companies where id=p_company;
 if p_start is null or not isfinite(p_start) or (p_end is not null and (not isfinite(p_end) or p_end<=p_start)) then raise exception 'invalid_assignment';end if;
 exact_start:=p_start::timestamp at time zone tz;
 if p_version>0 then
  select starts_at into exact_start from public.workforce_assignments where company_id=p_company and id=p_id;
  if exact_start is null then raise exception 'record_conflict' using errcode='PT409';end if;
 end if;
 return public.save_workforce_assignment(p_company,p_request,p_id,p_version,p_worker,p_project,exact_start,p_end::timestamp at time zone tz,p_active,p_reason);
end;$$;
revoke all on function public.save_workforce_assignment_days(uuid,uuid,uuid,integer,uuid,uuid,date,date,boolean,text) from public,anon;
grant execute on function public.save_workforce_assignment_days(uuid,uuid,uuid,integer,uuid,uuid,date,date,boolean,text) to authenticated;

commit;
