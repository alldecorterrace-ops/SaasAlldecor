-- Match Campo clock-out rounding for new clock shifts without rewriting history.
begin;
alter table public.time_entries add column minute_rule text
 check(minute_rule in ('CAMPO_CLOCK_V1','LEGACY_FLOOR_V1'));
-- DROP EXPRESSION retains the stored values. The same transaction installs the
-- server calculation before any future write; no column or row is dropped.
alter table public.time_entries alter column minutes drop expression;

create function app_private.time_entry_minutes(
 p_start timestamptz,p_end timestamptz,p_break integer,p_rule text
) returns integer language sql immutable set search_path='' as $$
 select case when p_end is null then null
  when p_rule='CAMPO_CLOCK_V1' then greatest(0,
   greatest(1,round((floor(extract(epoch from p_end))-floor(extract(epoch from p_start)))/60)::integer)-p_break)
  else greatest(0,floor(extract(epoch from (p_end-p_start))/60)::integer-p_break) end;
$$;
revoke all on function app_private.time_entry_minutes(timestamptz,timestamptz,integer,text) from public,anon,authenticated;

create function app_private.compute_time_minutes() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.minute_rule is distinct from old.minute_rule then raise exception 'clock_minute_rule_locked';end if;
  -- Existing manual correction semantics remain independent of clock-out.
  -- A note, project, status change or retry alone does not discard clock rounding.
  if old.minute_rule='CAMPO_CLOCK_V1' and (
   (old.ends_at is not null and (new.starts_at,new.ends_at,new.break_minutes) is distinct from (old.starts_at,old.ends_at,old.break_minutes))
   or (old.ends_at is null and new.ends_at is not null and new.gps_out is null)
  ) then new.minute_rule:='LEGACY_FLOOR_V1';end if;
 end if;
 new.minutes:=app_private.time_entry_minutes(new.starts_at,new.ends_at,new.break_minutes,new.minute_rule);
 return new;
end;$$;
revoke all on function app_private.compute_time_minutes() from public,anon,authenticated;
create trigger time_minutes_compute before insert or update on public.time_entries
 for each row execute function app_private.compute_time_minutes();

create or replace function public.punch_time(p_company uuid,p_id uuid,p_action text,p_project uuid,p_gps jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare w public.workers;e public.time_entries;gps jsonb;at_time timestamptz;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select * into w from public.workers where company_id=p_company and user_id=auth.uid() and active;
 if not found then raise exception 'worker_login_required';end if;
 if p_id is null or p_action is null or p_action not in ('IN','OUT') then raise exception 'invalid_punch';end if;
 at_time:=clock_timestamp();
 gps:=app_private.punch_gps(p_gps,floor(extract(epoch from at_time))*1000);
 select * into e from public.time_entries where company_id=p_company and id=p_id and worker_id=w.id;
 if p_action='IN' then
  if found then
   if e.source='RELOJ' and e.created_by=auth.uid() and e.project_id is not distinct from p_project and e.status<>'ANULADO' then return e.id;end if;
   raise exception 'request_conflict';
  end if;
  if p_project is null or not exists(select 1 from public.projects where company_id=p_company and id=p_project and status not in ('COMPLETADO','CANCELADO')) or not (app_private.can_access(p_company,'fin-proyectos','read') or app_private.can_use_workforce_project(p_company,p_project,at_time)) then raise exception 'project_unavailable';end if;
  perform app_private.assert_time_open(p_company,at_time,null);
  if exists(select 1 from public.time_entries where company_id=p_company and worker_id=w.id and status<>'ANULADO' and coalesce(ends_at,'infinity')>at_time) then raise exception 'time_overlap';end if;
  insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,source,gps_in,minute_rule,created_by,updated_by) values(p_id,p_company,w.id,p_project,at_time,'RELOJ',gps,'CAMPO_CLOCK_V1',auth.uid(),auth.uid());
 else
  if not found or e.status='ANULADO' or e.source<>'RELOJ' then raise exception 'entry_unavailable';end if;
  if e.ends_at is not null then return e.id;end if;
  perform app_private.assert_time_open(p_company,e.starts_at,at_time);
  update public.time_entries set ends_at=at_time,gps_out=gps,version=version+1,updated_by=auth.uid(),updated_at=at_time where id=e.id;
 end if;
 return p_id;
end;$$;
-- The existing GPS-free signature remains blocked by migration 075.
-- No grants, policies, memberships, history rows or financial records change.
commit;
