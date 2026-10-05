-- Read-only hours consultation. Count distinct positive local start dates;
-- closed entries use persisted net minutes, open entries use elapsed seconds.
-- The report never changes approvals, payments, entries or worker visibility.
begin;
create function public.time_summary(
 p_company uuid,p_from date,p_to date,p_project text default null,
 p_worker uuid default null,p_page integer default 1
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text; first_at timestamptz; last_at timestamptz; day_count integer; result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then
  raise exception 'permission_denied' using errcode='42501';
 end if;
 select c.timezone into tz from public.companies c where c.id=p_company;
 if tz is null or p_from is null or p_to is null or not isfinite(p_from)
  or not isfinite(p_to) or p_to<p_from or p_page is null or p_page<1
  or length(p_project)>255 then
  raise exception 'invalid_time_range' using errcode='22023';
 end if;
 first_at:=p_from::timestamp at time zone tz;
 last_at:=(p_to::timestamp+interval '23 hours 59 minutes 59 seconds') at time zone tz;
 -- Match ADT's elapsed-day guard, including its DST boundary behavior.
 day_count:=floor(extract(epoch from last_at-first_at)/86400)+1;
 if day_count>62 then raise exception 'time_range_too_long' using errcode='22023';end if;
 with visible as materialized (
  select e.id,e.worker_id,w.name as worker_name,e.project_id,
   coalesce(p.name,'Sin obra') as project_name,
   (e.starts_at at time zone tz)::date as day,
   case when e.ends_at is null then greatest(0,floor(extract(epoch from now()-e.starts_at)))::bigint
    else e.minutes::bigint*60 end as seconds,
   e.ends_at is null as open
  from public.time_entries e
  join public.workers w on w.company_id=e.company_id and w.id=e.worker_id and w.active
  left join public.projects p on p.company_id=e.company_id and p.id=e.project_id
  where e.company_id=p_company and e.status<>'ANULADO'
   and e.starts_at>=first_at and e.starts_at<((p_to+1)::timestamp at time zone tz)
   and app_private.can_read_time_worker(p_company,e.worker_id)
 ), filtered as materialized (
  select * from visible where seconds>0
   and (nullif(p_project,'') is null or project_name=p_project)
   and (p_worker is null or worker_id=p_worker)
 ), worker_days as (
  select worker_id,worker_name,day,sum(seconds)::bigint as seconds
  from filtered group by worker_id,worker_name,day
 ), worker_projects as (
  select worker_id,min(project_id::text)::uuid as project_id,project_name,count(distinct day)::integer as days,sum(seconds)::bigint as seconds
  from filtered group by worker_id,project_name
 ), worker_daily_projects as (
  select worker_id,day,min(project_id::text)::uuid as project_id,project_name,sum(seconds)::bigint as seconds
  from filtered group by worker_id,day,project_name
 ), worker_totals as materialized (
  select worker_id,worker_name,count(*)::integer as days,sum(seconds)::bigint as seconds
  from worker_days group by worker_id,worker_name
 ), pagination as (
  select count(*)::integer as count,
   least(p_page,greatest(1,ceil(count(*)/20.0)::integer)) as page from worker_totals
 ), page_rows as (
  select * from worker_totals order by worker_name,worker_id
  limit 20 offset ((select page from pagination)-1)*20
 ), project_totals as (
  select min(project_id::text)::uuid as project_id,project_name,count(distinct day)::integer as days,
   count(distinct (worker_id,day))::integer as worker_days,
   count(distinct worker_id)::integer as workers,sum(seconds)::bigint as seconds
  from filtered group by project_name
 )
 select jsonb_build_object(
  'company',p_company,'from',p_from,'to',p_to,'timezone',tz,
  'dates',(select jsonb_agg(p_from+n order by n) from generate_series(0,day_count-1) n),
  'count',(select count from pagination),'page',(select page from pagination),
  'options',jsonb_build_object(
   'projects',coalesce((select jsonb_agg(jsonb_build_object('id',project_id,'name',project_name) order by project_name,project_id)
     from (select min(project_id::text)::uuid as project_id,project_name from visible group by project_name) o),'[]'::jsonb),
   'workers',coalesce((select jsonb_agg(jsonb_build_object('id',worker_id,'name',worker_name) order by worker_name,worker_id)
     from (select distinct worker_id,worker_name from visible) o),'[]'::jsonb)
  ),
  'totals',jsonb_build_object(
   'days',coalesce((select sum(days) from worker_totals),0),
   'seconds',coalesce((select sum(seconds) from worker_totals),0),
   'workers',(select count from pagination),
   'open',(select count(*) from filtered where open)
  ),
  'rows',coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.worker_id,'name',r.worker_name,'days',r.days,'seconds',r.seconds,
    'projects',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.project_id,'name',p.project_name,'days',p.days,'seconds',p.seconds
     ) order by p.project_name,p.project_id) from worker_projects p where p.worker_id=r.worker_id),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(jsonb_build_object(
      'date',d.day,'seconds',d.seconds,
      'projects',(select jsonb_agg(jsonb_build_object('id',q.project_id,'name',q.project_name,'seconds',q.seconds)
       order by q.project_name,q.project_id) from worker_daily_projects q where q.worker_id=d.worker_id and q.day=d.day)
     ) order by d.day) from worker_days d where d.worker_id=r.worker_id),'[]'::jsonb)
   ) order by r.worker_name,r.worker_id) from page_rows r),'[]'::jsonb),
  'projects',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.project_id,'name',p.project_name,'days',p.days,
    'worker_days',p.worker_days,'workers',p.workers,'seconds',p.seconds
   ) order by p.worker_days desc,p.project_name,p.project_id) from project_totals p),'[]'::jsonb)
 ) into result;
 return result;
end;$$;
revoke all on function public.time_summary(uuid,date,date,text,uuid,integer) from public,anon;
grant execute on function public.time_summary(uuid,date,date,text,uuid,integer) to authenticated;
commit;
