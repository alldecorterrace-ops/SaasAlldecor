begin;
create or replace function public.decide_time_request(p_company uuid,p_id uuid,p_version integer,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare req public.time_requests;e public.time_entries;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select * into req from public.time_requests where company_id=p_company and id=p_id for update;
 if not found or p_version is null or req.version<>p_version or req.status<>'PENDIENTE' then raise exception 'record_conflict' using errcode='40001';end if;
 if p_approve is null or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'reason_required';end if;
 if p_approve then
  select * into e from public.time_entries where company_id=p_company and id=req.entry_id;
  perform public.save_time_entry(p_company,e.id,req.entry_version,jsonb_build_object('worker_id',e.worker_id,'project_id',e.project_id,'starts_at',req.starts_at,'ends_at',req.ends_at,'break_minutes',req.break_minutes,'status','PENDIENTE','notes',e.notes,'reason','Solicitud '||req.id::text||': '||left(req.reason,1900)));
 end if;
 update public.time_requests set status=case when p_approve then 'APROBADA' else 'RECHAZADA' end,decision_note=p_note,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$$;
-- The complete request and decision remain in time_requests and its audit snapshots.
create or replace function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'web_forms' then 'estimadosweb' when 'web_requests' then 'estimadosweb' when 'designs' then p_data->>'kind' when 'price_books' then 'adm-precios' when 'client_shares' then case p_data->>'kind' when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end when 'assistant_settings' then 'ia' when 'time_entries' then 'horasfix' when 'time_requests' then 'horasfix' when 'time_periods' then 'horasfix' when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;
create or replace function public.record_history(p_company uuid,p_entity text,p_id uuid,p_before bigint default null) returns table(id bigint,operation text,created_at timestamptz,actor_id uuid,before_data jsonb,after_data jsonb) language plpgsql stable security definer set search_path='' as $$
declare m text;d jsonb;
begin
 if p_entity='work_records' then select jsonb_build_object('kind',r.kind) into d from public.work_records r where r.company_id=p_company and r.id=p_id;
 elsif p_entity='designs' then select jsonb_build_object('kind',r.kind) into d from public.designs r where r.company_id=p_company and r.id=p_id;
 elsif p_entity='client_shares' then select jsonb_build_object('kind',r.kind) into d from public.client_shares r where r.company_id=p_company and r.id=p_id;end if;
 m:=app_private.audit_module(p_entity,d);
 if m is null or not app_private.can_access(p_company,m,'read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.operation,a.created_at,a.actor_id,a.before_data-'token_hash',a.after_data-'token_hash' from public.audit_events a where a.company_id=p_company and a.entity=p_entity and a.entity_id=p_id::text and (p_before is null or a.id<p_before) order by a.id desc limit 30;
end;$$;
commit;
