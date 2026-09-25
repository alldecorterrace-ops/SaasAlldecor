-- Read-only search. Invoker rights preserve RLS on permits and project names.
begin;
create function public.search_permits(
 p_company uuid,p_query text default '',p_status text default '',
 p_from date default null,p_to date default null
) returns setof public.work_records
language plpgsql stable security invoker set search_path='' as $$
begin
 if not app_private.can_access(p_company,'permisos','read') then
  raise exception 'permission_denied' using errcode='42501';
 end if;
 if p_query is null or length(p_query)>100 or p_status is null
    or p_status not in ('','PENDIENTE','EN_REVISION','APROBADO','RECHAZADO','VENCIDO','ANULADO')
    or p_from>p_to then
  raise exception 'invalid_filters' using errcode='22023';
 end if;
 return query
 select w.* from public.work_records w
 join public.companies c on c.id=w.company_id
 where w.company_id=p_company and w.kind='permits'
 and (p_status='' or w.status=p_status)
 and (p_from is null or coalesce(nullif(w.data->>'submitted_date','')::date,(w.created_at at time zone c.timezone)::date)>=p_from)
 and (p_to is null or coalesce(nullif(w.data->>'submitted_date','')::date,(w.created_at at time zone c.timezone)::date)<=p_to)
 and (btrim(p_query)='' or strpos(lower(concat_ws(' ',w.name,w.data->>'authority',w.data->>'permit_number',w.data->>'notes',
   (select p.name from public.projects p where p.company_id=w.company_id and p.id=w.project_id))),lower(btrim(p_query)))>0);
end;
$$;
revoke all on function public.search_permits(uuid,text,text,date,date) from public,anon;
grant execute on function public.search_permits(uuid,text,text,date,date) to authenticated;
commit;
