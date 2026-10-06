-- ADT Campo Encargado: select/clear the current project of a direct worker.
-- Additive operational history; existing assignments, clocks and costs are intact.
begin;
create table public.workforce_project_choices (
 id uuid primary key, company_id uuid not null, worker_id uuid not null,
 project_id uuid, version integer not null check(version>0),
 chosen_at timestamptz not null default clock_timestamp(),
 chosen_by uuid not null references auth.users(id),
 unique(company_id,id), unique(company_id,worker_id,version),
 foreign key(company_id,worker_id) references public.workers(company_id,id),
 foreign key(company_id,project_id) references public.projects(company_id,id)
);
create index workforce_project_choice_history on public.workforce_project_choices(company_id,worker_id,chosen_at,version);
create table app_private.workforce_project_choice_requests (
 company_id uuid not null references public.companies(id), actor_id uuid not null references auth.users(id),
 request_id uuid not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(company_id,actor_id,request_id)
);
alter table public.workforce_project_choices enable row level security;
revoke all on public.workforce_project_choices,app_private.workforce_project_choice_requests from public,anon,authenticated;
grant select on public.workforce_project_choices to authenticated;
create policy workforce_project_choices_manager_read on public.workforce_project_choices for select to authenticated using(app_private.is_manager(company_id));
create trigger workforce_project_choices_audit after insert on public.workforce_project_choices for each row execute function app_private.audit_change();

create function app_private.workforce_current_project(p_company uuid,p_worker uuid,p_at timestamptz) returns uuid
language sql stable security definer set search_path='' as $$
 select project_id from public.workforce_project_choices where company_id=p_company and worker_id=p_worker and chosen_at<=p_at order by chosen_at desc,version desc limit 1;
$$;
revoke all on function app_private.workforce_current_project(uuid,uuid,timestamptz) from public,anon,authenticated;

create function public.workforce_project_choices_context(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;workers jsonb;projects jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 actor:=app_private.workforce_actor(p_company);
 if not app_private.is_manager(p_company) and (actor.id is null or actor.role<>'FOREMAN') then raise exception 'foreman_required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'project_id',x.project_id,'project_name',p.name,'version',coalesce(x.version,0)) order by w.name,w.id),'[]') into workers
 from public.workers w join public.workforce_profiles f on f.company_id=w.company_id and f.id=w.id
 left join lateral (select project_id,version from public.workforce_project_choices where company_id=w.company_id and worker_id=w.id order by version desc limit 1) x on true
 left join public.projects p on p.company_id=w.company_id and p.id=x.project_id
 where w.company_id=p_company and w.active and f.enabled
 and (app_private.is_manager(p_company) or (f.supervisor_id=actor.id and w.id<>actor.id));
 -- Source `lista` exposes only project identity/name, including completed jobs.
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]') into projects from public.projects where company_id=p_company;
 return jsonb_build_object('workers',workers,'projects',projects);
end;$$;

create function public.choose_workforce_project(p_company uuid,p_request uuid,p_worker uuid,p_version integer,p_project uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;receipt app_private.workforce_project_choice_requests;payload jsonb;v integer;result jsonb;choice uuid;at_time timestamptz;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 -- Serialize with profile/supervisor and administrative assignment changes.
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':workforce-admin',0));
 -- A permission update cannot overtake an accepted command or a cached reply.
 perform 1 from public.memberships where company_id=p_company and user_id=auth.uid() for share;
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 actor:=app_private.workforce_actor(p_company);
 if not app_private.is_manager(p_company) and (actor.id is null or actor.role<>'FOREMAN') then raise exception 'foreman_required' using errcode='42501';end if;
 if p_request is null or p_worker is null or p_version is null or p_version<0 then raise exception 'invalid_project_choice';end if;
 if not exists(select 1 from public.workers w join public.workforce_profiles f on f.company_id=w.company_id and f.id=w.id where w.company_id=p_company and w.id=p_worker and w.active and f.enabled and (app_private.is_manager(p_company) or (f.supervisor_id=actor.id and w.id<>actor.id))) then raise exception 'worker_outside_team' using errcode='42501';end if;
 -- Scope is rechecked before replaying a lost response.
 payload:=jsonb_build_object('worker',p_worker,'version',p_version,'project',p_project);
 select * into receipt from app_private.workforce_project_choice_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if receipt.payload=payload then return receipt.result;end if;raise exception 'request_conflict';end if;
 select coalesce(max(version),0) into v from public.workforce_project_choices where company_id=p_company and worker_id=p_worker;
 if v<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if p_project is not null and not exists(select 1 from public.projects where company_id=p_company and id=p_project) then raise exception 'project_unavailable';end if;
 choice:=gen_random_uuid();at_time:=clock_timestamp();
 insert into public.workforce_project_choices(id,company_id,worker_id,project_id,version,chosen_at,chosen_by) values(choice,p_company,p_worker,p_project,v+1,at_time,auth.uid());
 result:=jsonb_build_object('id',choice,'worker_id',p_worker,'project_id',p_project,'version',v+1);
 insert into app_private.workforce_project_choice_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
revoke all on function public.workforce_project_choices_context(uuid),public.choose_workforce_project(uuid,uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.workforce_project_choices_context(uuid),public.choose_workforce_project(uuid,uuid,uuid,integer,uuid) to authenticated;
create or replace function app_private.can_use_workforce_project(p_company uuid,p_project uuid,p_at timestamptz) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;
begin
 if p_at is null or not isfinite(p_at) or not exists(select 1 from public.projects where company_id=p_company and id=p_project and status not in ('COMPLETADO','CANCELADO')) then return false;end if;
 if app_private.is_manager(p_company) then return true;end if;
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null then return false;end if;
 return actor.role='OFFICE' or coalesce(p_project=app_private.workforce_current_project(p_company,actor.id,p_at),false) or exists(select 1 from public.workforce_assignments a where a.company_id=p_company
 and a.worker_id=actor.id and a.project_id=p_project and a.active and a.starts_at<=p_at and (a.ends_at is null or a.ends_at>p_at));
end;$$;
create or replace function public.workforce_scope(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;team jsonb;projects jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 actor:=app_private.workforce_actor(p_company);
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',f.role,'supervisor_id',f.supervisor_id) order by w.name,w.id),'[]') into team
 from public.workers w join public.workforce_profiles f on f.company_id=w.company_id and f.id=w.id
 where w.company_id=p_company and w.active and f.enabled and app_private.can_view_workforce_worker(p_company,w.id);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id),'[]') into projects from public.projects p where p.company_id=p_company and app_private.can_use_workforce_project(p_company,p.id,statement_timestamp());
 return jsonb_build_object('actor_id',actor.id,'role',case when app_private.is_manager(p_company) then 'ADMIN' else actor.role end,'team',team,'projects',projects,'preferred_project_id',app_private.workforce_current_project(p_company,actor.id,statement_timestamp()));
end;$$;
create or replace function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'workforce_project_choices' then 'horasfix' when 'pricing_settings' then 'adm-precios' when 'labor_rates' then 'gastos' when 'labor_project_terms' then 'gastos' when 'labor_settings' then 'gastos' when 'labor_expense_links' then 'gastos' when 'workforce_expenses' then 'horasfix' when 'workforce_profiles' then 'trabajadores' when 'workforce_assignments' then 'trabajadores' when 'web_forms' then 'estimadosweb' when 'web_requests' then 'estimadosweb' when 'designs' then p_data->>'kind' when 'price_books' then 'adm-precios' when 'client_shares' then case p_data->>'kind' when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end when 'assistant_settings' then 'ia' when 'time_field_proposals' then 'horasfix' when 'time_field_declarations' then 'horasfix' when 'time_entries' then 'horasfix' when 'time_requests' then 'horasfix' when 'time_periods' then 'horasfix' when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;
create or replace function app_private.can_read_time_audit(p_company uuid,p_entity text,p_before jsonb,p_after jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_entity='workforce_project_choices' then app_private.is_manager(p_company) or app_private.can_view_workforce_worker(p_company,(coalesce(p_after,p_before)->>'worker_id')::uuid) when p_entity in ('time_field_proposals','time_field_declarations') then
 app_private.is_manager(p_company) or exists(select 1 from public.time_entries e where e.company_id=p_company
 and e.id=(coalesce(p_after,p_before)->>'entry_id')::uuid and e.worker_id=(coalesce(p_after,p_before)->>'worker_id')::uuid
 and app_private.can_read_time_worker(p_company,e.worker_id)) when p_entity in ('labor_rates','labor_project_terms','labor_settings','labor_expense_links') then app_private.can_read_labor(p_company) when p_entity='workforce_expenses' then app_private.can_read_workforce_expense_record(p_company,(coalesce(p_after,p_before)->>'id')::uuid) when p_entity in ('workforce_profiles','workforce_assignments') then app_private.is_manager(p_company) when p_entity not in ('time_entries','time_requests','time_periods') then true
 when app_private.is_manager(p_company) then true
 else app_private.can_read_time_record(p_company,p_entity,(coalesce(p_after,p_before)->>'id')::uuid)
 and (p_entity<>'time_entries' or (
  (p_before is null or app_private.can_read_time_worker(p_company,(p_before->>'worker_id')::uuid))
  and (p_after is null or app_private.can_read_time_worker(p_company,(p_after->>'worker_id')::uuid))
 )) end;
$$;
notify pgrst,'reload schema';
commit;
