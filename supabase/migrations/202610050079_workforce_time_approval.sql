-- Campo Encargado: approve an unchanged closed shift of the direct team.
-- Correction proposals retain their existing, separate decision workflow.
begin;
create table app_private.workforce_time_approvals (
 company_id uuid not null references public.companies(id),
 actor_id uuid not null references auth.users(id), request_id uuid not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(company_id,actor_id,request_id)
);
alter table app_private.workforce_time_approvals enable row level security;
revoke all on app_private.workforce_time_approvals from public,anon,authenticated;

create function app_private.can_review_workforce_time(p_company uuid,p_worker uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;
begin
 if app_private.is_manager(p_company) then
  return exists(select 1 from public.workers where company_id=p_company and id=p_worker and active);
 end if;
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null or actor.role<>'FOREMAN' or actor.id=p_worker then return false;end if;
 return exists(select 1 from public.workers w
  join public.workforce_profiles f on f.company_id=w.company_id and f.id=w.id
  where w.company_id=p_company and w.id=p_worker and w.active and f.enabled and f.supervisor_id=actor.id);
end;$$;
revoke all on function app_private.can_review_workforce_time(uuid,uuid) from public,anon,authenticated;

create function public.workforce_time_review(
 p_company uuid,p_from date,p_to date,p_worker uuid default null,p_page integer default 1
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;manager boolean;tz text;first_at timestamptz;last_at timestamptz;result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then
  raise exception 'permission_denied' using errcode='42501';
 end if;
 manager:=app_private.is_manager(p_company);
 actor:=app_private.workforce_actor(p_company);
 if not manager and (actor.id is null or actor.role<>'FOREMAN') then
  raise exception 'foreman_required' using errcode='42501';
 end if;
 select timezone into tz from public.companies where id=p_company;
 if tz is null or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
  or p_to<p_from or p_page is null or p_page<1 or p_page>100000 then
  raise exception 'invalid_time_range' using errcode='22023';
 end if;
 first_at:=p_from::timestamp at time zone tz;
 last_at:=(p_to::timestamp+interval '23 hours 59 minutes 59 seconds') at time zone tz;
 if floor(extract(epoch from last_at-first_at)/86400)+1>62 then
  raise exception 'time_range_too_long' using errcode='22023';
 end if;
 with visible as materialized (
  select e.id,e.version,e.worker_id,w.name as worker_name,coalesce(p.name,'Sin obra') as project_name,
   to_char(e.starts_at at time zone tz,'YYYY-MM-DD HH24:MI') as starts_local,
   case when e.ends_at is not null then to_char(e.ends_at at time zone tz,'YYYY-MM-DD HH24:MI') end as ends_local,
   e.minutes,e.status,e.ends_at is null as open,
   exists(select 1 from public.time_periods t where t.company_id=e.company_id and t.locked
    and e.starts_at<((t.week_start+7)::timestamp at time zone tz)
    and coalesce(e.ends_at,e.starts_at+interval '1 microsecond')>(t.week_start::timestamp at time zone tz)) as locked,
   exists(select 1 from public.time_requests r where r.company_id=e.company_id and r.entry_id=e.id and r.status='PENDIENTE') as correction_pending
  from public.time_entries e join public.workers w on w.company_id=e.company_id and w.id=e.worker_id
  left join public.projects p on p.company_id=e.company_id and p.id=e.project_id
  where e.company_id=p_company and e.status<>'ANULADO'
   and app_private.can_review_workforce_time(p_company,e.worker_id)
   and e.starts_at>=first_at and e.starts_at<((p_to+1)::timestamp at time zone tz)
   and (p_worker is null or e.worker_id=p_worker)
 ), pagination as (
  select count(*)::integer as count,least(p_page,greatest(1,ceil(count(*)/20.0)::integer)) as page from visible
 ), page_rows as (
  select * from visible order by starts_local,worker_name,id limit 20 offset ((select page from pagination)-1)*20
 )
 select jsonb_build_object(
  'company',p_company,'from',p_from,'to',p_to,'timezone',tz,
  'role',case when manager then 'ADMIN' else 'FOREMAN' end,
  'count',(select count from pagination),'page',(select page from pagination),
  'rows',coalesce((select jsonb_agg(jsonb_build_object(
   'id',r.id,'version',r.version,'worker_id',r.worker_id,'worker_name',r.worker_name,
   'project_name',r.project_name,'starts_local',r.starts_local,'ends_local',r.ends_local,
   'minutes',r.minutes,'status',r.status,'open',r.open,'locked',r.locked,'correction_pending',r.correction_pending,
   'can_approve',not r.open and not r.locked and not r.correction_pending and r.status='PENDIENTE'
    and app_private.can_access(p_company,'horasfix','write')
  ) order by r.starts_local,r.worker_name,r.id) from page_rows r),'[]'::jsonb)
 ) into result;
 return result;
end;$$;

create function public.approve_workforce_time(p_company uuid,p_request uuid,p_entry uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.time_entries;actor public.workforce_profiles;receipt app_private.workforce_time_approvals;payload jsonb;result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','write') then
  raise exception 'permission_denied' using errcode='42501';
 end if;
 if p_request is null or p_entry is null or p_version is null or p_version<1 then
  raise exception 'invalid_time_approval' using errcode='22023';
 end if;
 -- Serialize with both hierarchy changes and the existing hours commands.
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':workforce-admin',0));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 if not app_private.can_access(p_company,'horasfix','write') then
  raise exception 'permission_denied' using errcode='42501';
 end if;
 actor:=app_private.workforce_actor(p_company);
 if not app_private.is_manager(p_company) and (actor.id is null or actor.role<>'FOREMAN') then
  raise exception 'foreman_required' using errcode='42501';
 end if;
 select * into e from public.time_entries where company_id=p_company and id=p_entry for update;
 if not found then raise exception 'entry_unavailable' using errcode='42501';end if;
 -- Lock identity/active state as well; neither a reassignment nor a disabled
 -- profile may be bypassed through a previously successful request receipt.
 perform 1 from public.workers where company_id=p_company and id in (e.worker_id,actor.id) order by id for share;
 if not app_private.can_review_workforce_time(p_company,e.worker_id) then
  raise exception 'entry_unavailable' using errcode='42501';
 end if;
 payload:=jsonb_build_object('entry',p_entry,'version',p_version);
 select * into receipt from app_private.workforce_time_approvals
  where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then
  if receipt.payload=payload then return receipt.result;end if;
  raise exception 'request_conflict' using errcode='PT409';
 end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status='ANULADO' then raise exception 'entry_unavailable' using errcode='PT409';end if;
 if e.ends_at is null then raise exception 'shift_open' using errcode='PT409';end if;
 perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);
 if exists(select 1 from public.time_requests where company_id=p_company and entry_id=e.id and status='PENDIENTE') then
  raise exception 'correction_pending' using errcode='PT409';
 end if;
 if e.status='APROBADO' then raise exception 'shift_already_approved' using errcode='PT409';end if;
 update public.time_entries set status='APROBADO',version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
  where company_id=p_company and id=e.id returning * into e;
 -- Audit trigger records the actor and before/after state. Preserve reason,
 -- notes, clock endpoints, minute rule, GPS, worker, project and paid minutes.
 result:=jsonb_build_object('entry',e.id,'version',e.version,'minutes',e.minutes,'status',e.status);
 insert into app_private.workforce_time_approvals(company_id,actor_id,request_id,payload,result)
  values(p_company,auth.uid(),p_request,payload,result);
 return result;
end;$$;
revoke all on function public.workforce_time_review(uuid,date,date,uuid,integer),public.approve_workforce_time(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.workforce_time_review(uuid,date,date,uuid,integer),public.approve_workforce_time(uuid,uuid,uuid,integer) to authenticated;
commit;
