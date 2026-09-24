-- Workers see their own hours. Team delegation needs its own explicit scope;
-- an ordinary module permission is not authorization to read another worker.
begin;
create function app_private.can_read_time_worker(p_company uuid,p_worker uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.can_access(p_company,'horasfix','read') and (
  app_private.is_manager(p_company) or exists(
   select 1 from public.workers w where w.company_id=p_company and w.id=p_worker
   and w.user_id=auth.uid() and w.active
  )
 );
$$;

create function app_private.can_read_time_record(p_company uuid,p_entity text,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.can_access(p_company,'horasfix','read') and (
  app_private.is_manager(p_company) or case p_entity
   when 'time_entries' then exists(select 1 from public.time_entries e
    where e.company_id=p_company and e.id=p_id
    and app_private.can_read_time_worker(p_company,e.worker_id))
   when 'time_requests' then exists(select 1 from public.time_requests r
    join public.time_entries e on e.company_id=r.company_id and e.id=r.entry_id
    where r.company_id=p_company and r.id=p_id and r.created_by=auth.uid()
    and app_private.can_read_time_worker(p_company,e.worker_id))
   else false end
 );
$$;

-- A reassigned entry must not expose the previous worker's audit snapshots.
-- Check both the present assignment and each side of the historical change.
create function app_private.can_read_time_audit(p_company uuid,p_entity text,p_before jsonb,p_after jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_entity not in ('time_entries','time_requests','time_periods') then true
 when app_private.is_manager(p_company) then true
 else app_private.can_read_time_record(p_company,p_entity,(coalesce(p_after,p_before)->>'id')::uuid)
 and (p_entity<>'time_entries' or (
  (p_before is null or app_private.can_read_time_worker(p_company,(p_before->>'worker_id')::uuid))
  and (p_after is null or app_private.can_read_time_worker(p_company,(p_after->>'worker_id')::uuid))
 )) end;
$$;

revoke all on function app_private.can_read_time_worker(uuid,uuid),app_private.can_read_time_record(uuid,text,uuid),app_private.can_read_time_audit(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function app_private.can_read_time_worker(uuid,uuid),app_private.can_read_time_record(uuid,text,uuid) to authenticated;

alter policy time_entries_read on public.time_entries using(app_private.can_read_time_worker(company_id,worker_id));
alter policy time_requests_read on public.time_requests using(app_private.can_read_time_record(company_id,'time_requests',id));
alter policy time_periods_read on public.time_periods using(app_private.is_manager(company_id));

create or replace function public.record_history(p_company uuid,p_entity text,p_id uuid,p_before bigint default null)
returns table(id bigint,operation text,created_at timestamptz,actor_id uuid,before_data jsonb,after_data jsonb)
language plpgsql stable security definer set search_path='' as $$
declare m text;d jsonb;
begin
 if p_entity='work_records' then select jsonb_build_object('kind',r.kind) into d from public.work_records r where r.company_id=p_company and r.id=p_id;
 elsif p_entity='designs' then select jsonb_build_object('kind',r.kind) into d from public.designs r where r.company_id=p_company and r.id=p_id;
 elsif p_entity='client_shares' then select jsonb_build_object('kind',r.kind) into d from public.client_shares r where r.company_id=p_company and r.id=p_id;end if;
 m:=app_private.audit_module(p_entity,d);
 if m is null or not app_private.can_access(p_company,m,'read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.operation,a.created_at,a.actor_id,a.before_data-'token_hash',a.after_data-'token_hash'
 from public.audit_events a where a.company_id=p_company and a.entity=p_entity and a.entity_id=p_id::text
 and (p_before is null or a.id<p_before)
 and app_private.can_read_time_audit(p_company,a.entity,a.before_data,a.after_data)
 order by a.id desc limit 30;
end;$$;

create or replace function public.activity_feed(p_company uuid,p_before bigint default null)
returns table(id bigint,entity text,entity_id text,operation text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'activity','read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.entity,a.entity_id,a.operation,a.created_at from public.audit_events a
 where a.company_id=p_company and (p_before is null or a.id<p_before)
 and (app_private.is_manager(p_company) or app_private.can_access(p_company,app_private.audit_module(a.entity,coalesce(a.after_data,a.before_data)),'read'))
 and app_private.can_read_time_audit(p_company,a.entity,a.before_data,a.after_data)
 order by a.id desc limit 50;
end;$$;
commit;
