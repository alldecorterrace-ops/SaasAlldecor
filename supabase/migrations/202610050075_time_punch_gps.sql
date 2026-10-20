-- Fresh GPS for both clock actions; existing administrative/history rows remain intact.
begin;
alter table public.time_entries add column gps_in jsonb, add column gps_out jsonb;
alter table public.time_entries add constraint time_gps_objects check ((gps_in is null or jsonb_typeof(gps_in)='object') and (gps_out is null or jsonb_typeof(gps_out)='object'));

-- A recorded location belongs to the original worker; corrections retain it.
create function app_private.preserve_time_gps() returns trigger language plpgsql set search_path='' as $$
begin
 if (old.gps_in is not null or old.gps_out is not null) and new.worker_id is distinct from old.worker_id then raise exception 'clock_worker_locked';end if;
 if (old.gps_in is not null and new.gps_in is distinct from old.gps_in) or (old.gps_out is not null and new.gps_out is distinct from old.gps_out) then raise exception 'clock_gps_locked';end if;
 return new;
end;$$;
revoke all on function app_private.preserve_time_gps() from public,anon,authenticated;
create trigger time_gps_preserve before update on public.time_entries for each row execute function app_private.preserve_time_gps();

create function app_private.punch_gps(p_data jsonb,p_now numeric) returns jsonb
language plpgsql immutable set search_path='' as $$
declare lat double precision;lng double precision;acc double precision;stamp double precision;k text;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_now is null then raise exception 'gps_required';end if;
 foreach k in array array['lat','lng','acc','gps_ts'] loop
  if not (p_data ? k) or jsonb_typeof(p_data->k) not in ('number','string') or trim(p_data->>k) !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then raise exception 'gps_required';end if;
 end loop;
 begin
  lat:=(p_data->>'lat')::double precision;lng:=(p_data->>'lng')::double precision;acc:=(p_data->>'acc')::double precision;stamp:=(p_data->>'gps_ts')::double precision;
 exception when others then raise exception 'gps_required';end;
 if lat not between -90 and 90 or lng not between -180 and 180 or (abs(lat)<0.0001 and abs(lng)<0.0001) or acc<=0 or acc>100 or p_now-stamp not between -10000 and 60000 then raise exception 'gps_required';end if;
 return jsonb_build_object('lat',lat,'lng',lng,'acc',round(acc::numeric),'gps_ts',stamp);
end;$$;
revoke all on function app_private.punch_gps(jsonb,numeric) from public,anon,authenticated;

create function public.punch_time(p_company uuid,p_id uuid,p_action text,p_project uuid,p_gps jsonb) returns uuid
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
  insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,source,gps_in,created_by,updated_by) values(p_id,p_company,w.id,p_project,at_time,'RELOJ',gps,auth.uid(),auth.uid());
 else
  if not found or e.status='ANULADO' or e.source<>'RELOJ' then raise exception 'entry_unavailable';end if;
  if e.ends_at is not null then return e.id;end if;
  perform app_private.assert_time_open(p_company,e.starts_at,at_time);
  update public.time_entries set ends_at=at_time,gps_out=gps,version=version+1,updated_by=auth.uid(),updated_at=at_time where id=e.id;
 end if;
 return p_id;
end;$$;
-- Keep older code callable without allowing a GPS-free bypass.
create or replace function public.punch_time(p_company uuid,p_id uuid,p_action text,p_project uuid default null) returns uuid
language sql security invoker set search_path='' as $$ select public.punch_time(p_company,p_id,p_action,p_project,null::jsonb);$$;
revoke all on function public.punch_time(uuid,uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.punch_time(uuid,uuid,text,uuid,jsonb) to authenticated;
commit;
