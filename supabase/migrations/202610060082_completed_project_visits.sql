-- ADT Campo: paid jobs with no outstanding invoice require a visit reason.
-- Operational catalog only; no invoice, payment, assignment or history rewrite.
begin;
alter table public.time_entries add column visit_reason text,
 add column punch_project_state text;
alter table public.time_entries add constraint time_visit_metadata check (coalesce((
 (punch_project_state is null and visit_reason is null) or
 (punch_project_state in ('activo','asignado') and visit_reason is null) or
 (punch_project_state='terminado' and visit_reason is not null and
  visit_reason in ('limpieza','garantia','reparacion','remodelacion'))
),false));
create function app_private.preserve_time_visit() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.visit_reason,new.punch_project_state) is distinct from (old.visit_reason,old.punch_project_state) then raise exception 'clock_visit_locked';end if;
 return new;
end;$$;
revoke all on function app_private.preserve_time_visit() from public,anon,authenticated;
create trigger time_visit_preserve before update on public.time_entries for each row execute function app_private.preserve_time_visit();

-- Financial eligibility is private. The caller receives only identity/name/state.
-- Operational invoices always have a project FK in this schema, so ADT's
-- ambiguous client-only invoice fallback cannot be needed here.
create function app_private.time_punch_project_state(p_company uuid,p_worker uuid,p_project uuid,p_at timestamptz) returns text
language plpgsql stable security definer set search_path='' as $$
declare paid boolean;outstanding boolean;assigned boolean;actor public.workforce_profiles;
begin
 if p_at is null or not isfinite(p_at) or not exists(select 1 from public.projects where company_id=p_company and id=p_project and status<>'CANCELADO') then return null;end if;
 actor:=app_private.workforce_actor(p_company);
 if not exists(select 1 from public.workers where company_id=p_company and id=p_worker and user_id=auth.uid() and active) or (actor.id is null and not app_private.can_access(p_company,'fin-proyectos','read')) then return null;end if;
 select coalesce(bool_or(paid_amount>0 or payment_status in ('PAID','PARTIAL')),false),coalesce(bool_or(balance_due>0.009),false) into paid,outstanding
 from public.invoices where company_id=p_company and project_id=p_project and status<>'VOID' and payment_status<>'VOID';
 assigned:=coalesce(p_project=app_private.workforce_current_project(p_company,p_worker,p_at),false) or exists(select 1 from public.workforce_assignments where company_id=p_company and worker_id=p_worker and project_id=p_project and active and starts_at<=p_at and (ends_at is null or ends_at>p_at));
 if not paid and not assigned and not app_private.can_access(p_company,'fin-proyectos','read') then return null;end if;
 return case when paid and not outstanding then 'terminado' when paid and outstanding then 'activo' else 'asignado' end;
end;$$;
revoke all on function app_private.time_punch_project_state(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;

create function public.time_punch_projects(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w uuid;result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select id into w from public.workers where company_id=p_company and user_id=auth.uid() and active;
 if not found then raise exception 'worker_login_required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'state',state) order by name,id),'[]') into result from (
  select p.id,p.name,app_private.time_punch_project_state(p_company,w,p.id,statement_timestamp()) as state from public.projects p where p.company_id=p_company
 ) catalog where state is not null;
 return result;
end;$$;
revoke all on function public.time_punch_projects(uuid) from public,anon;
grant execute on function public.time_punch_projects(uuid) to authenticated;

create function public.punch_time(p_company uuid,p_id uuid,p_action text,p_project uuid,p_gps jsonb,p_visit_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare w public.workers;e public.time_entries;gps jsonb;at_time timestamptz;state text;reason text:=nullif(trim(p_visit_reason),'');
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 perform 1 from public.memberships where company_id=p_company and user_id=auth.uid() for share;
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into w from public.workers where company_id=p_company and user_id=auth.uid() and active for share;
 if not found then raise exception 'worker_login_required';end if;
 if p_id is null or p_action is null or p_action not in ('IN','OUT') then raise exception 'invalid_punch';end if;
 at_time:=clock_timestamp();
 gps:=app_private.punch_gps(p_gps,floor(extract(epoch from at_time))*1000);
 select * into e from public.time_entries where company_id=p_company and id=p_id and worker_id=w.id;
 if p_action='IN' then
  if found then
   if e.source='RELOJ' and e.created_by=auth.uid() and e.project_id is not distinct from p_project and e.status<>'ANULADO' and (e.punch_project_state is distinct from 'terminado' or e.visit_reason is not distinct from reason) then return e.id;end if;
   raise exception 'request_conflict';
  end if;
  perform 1 from public.projects where company_id=p_company and id=p_project for share;
  state:=app_private.time_punch_project_state(p_company,w.id,p_project,at_time);
  if state is null then raise exception 'project_unavailable';end if;
  if state='terminado' and (reason is null or reason not in ('limpieza','garantia','reparacion','remodelacion')) then raise exception 'visit_reason_required';end if;
  if state<>'terminado' then reason:=null;end if;
  perform app_private.assert_time_open(p_company,at_time,null);
  if exists(select 1 from public.time_entries where company_id=p_company and worker_id=w.id and status<>'ANULADO' and coalesce(ends_at,'infinity')>at_time) then raise exception 'time_overlap';end if;
  insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,source,gps_in,minute_rule,punch_project_state,visit_reason,notes,created_by,updated_by)
   values(p_id,p_company,w.id,p_project,at_time,'RELOJ',gps,'CAMPO_CLOCK_V1',state,reason,
    case reason when 'limpieza' then 'Proyecto terminado · Limpieza / terminación' when 'garantia' then 'Proyecto terminado · Garantía' when 'reparacion' then 'Proyecto terminado · Reparación' when 'remodelacion' then 'Proyecto terminado · Remodelación' else '' end,auth.uid(),auth.uid());
 else
  if not found or e.status='ANULADO' or e.source<>'RELOJ' then raise exception 'entry_unavailable';end if;
  if e.ends_at is not null then return e.id;end if;
  perform app_private.assert_time_open(p_company,e.starts_at,at_time);
  update public.time_entries set ends_at=at_time,gps_out=gps,version=version+1,updated_by=auth.uid(),updated_at=at_time where id=e.id;
 end if;
 return p_id;
end;$$;
revoke all on function public.punch_time(uuid,uuid,text,uuid,jsonb,text) from public,anon;
grant execute on function public.punch_time(uuid,uuid,text,uuid,jsonb,text) to authenticated;
-- Prior clients retain active clock behavior but cannot bypass a completed visit.
create or replace function public.punch_time(p_company uuid,p_id uuid,p_action text,p_project uuid,p_gps jsonb) returns uuid
language sql security invoker set search_path='' as $$ select public.punch_time(p_company,p_id,p_action,p_project,p_gps,null::text);$$;
notify pgrst,'reload schema';
commit;
