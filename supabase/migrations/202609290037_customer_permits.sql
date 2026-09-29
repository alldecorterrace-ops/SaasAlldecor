-- Read-only dossier projection. Existing roles, RLS and private Storage remain unchanged.
begin;
create index if not exists work_records_project_kind on public.work_records(company_id,project_id,kind);
create index if not exists work_attachments_record_active on public.work_attachments(company_id,record_id,active,created_at desc,id);
create or replace function public.customer_permits(p_company uuid,p_customer uuid,p_section text,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_section is null or p_section not in ('permisos','documentos') or p_page is null or p_page not between 1 and 100000 then raise exception 'invalid_customer_permits';end if;
 if not app_private.can_access(p_company,'clientes','read') or not app_private.can_access(p_company,'fin-proyectos','read') or not app_private.can_access(p_company,'permisos','read')
 or not exists(select 1 from public.customers where company_id=p_company and id=p_customer)
 then raise exception 'permission_denied' using errcode='42501';end if;
 with permits as materialized (
  select w.id,w.name,w.status,w.data,w.updated_at,p.id project_id,p.name project_name
  from public.work_records w join public.projects p on p.company_id=w.company_id and p.id=w.project_id
  where w.company_id=p_company and p.customer_id=p_customer and w.kind='permits' and w.status<>'ANULADO'
 ), entries as materialized (
  select w.id,w.updated_at as sort_date,jsonb_build_object('kind','permit','id',w.id,'name',w.name,'status',w.status,
   'project_id',w.project_id,'project_name',w.project_name,'authority',coalesce(w.data->>'authority',''),
   'number',coalesce(w.data->>'permit_number',''),'submitted_date',nullif(w.data->>'submitted_date',''),
   'approved_date',nullif(w.data->>'approved_date',''),'expiration_date',nullif(w.data->>'expiration_date',''),
   'documents',(select count(*)::integer from public.work_attachments f where f.company_id=p_company and f.record_id=w.id and f.active)) item
  from permits w where p_section='permisos'
  union all
  select f.id,f.created_at,jsonb_build_object('kind','document','id',f.id,'name',f.name,'permit_id',w.id,'permit_name',w.name,
   'project_id',w.project_id,'project_name',w.project_name,'created_at',f.created_at)
  from public.work_attachments f join permits w on w.id=f.record_id
  where p_section='documentos' and f.company_id=p_company and f.active
 ), summary as (select count(*)::integer count from entries), pagination as (
  select count,least(p_page,greatest(1,(count+19)/20)) page from summary
 ), page_rows as (select * from entries order by sort_date desc,id limit 20 offset (select (page-1)*20 from pagination))
 select jsonb_build_object('count',s.count,'page',s.page,'rows',coalesce((select jsonb_agg(item order by sort_date desc,id) from page_rows),'[]'::jsonb)) into result from pagination s;
 return result;
end;$$;
-- Resolve one authorized active file at request time. No public or bearer link is issued.
create or replace function public.customer_permit_file(p_company uuid,p_customer uuid,p_attachment uuid)
returns table(path text,name text,record_id uuid) language plpgsql stable security invoker set search_path='' as $$
begin
 if not app_private.can_access(p_company,'clientes','read') or not app_private.can_access(p_company,'fin-proyectos','read') or not app_private.can_access(p_company,'permisos','read')
 or not exists(select 1 from public.customers where company_id=p_company and id=p_customer)
 then raise exception 'permission_denied' using errcode='42501';end if;
 return query select f.path,f.name,w.id from public.work_attachments f
 join public.work_records w on w.company_id=f.company_id and w.id=f.record_id
 join public.projects p on p.company_id=w.company_id and p.id=w.project_id
 where f.company_id=p_company and f.id=p_attachment and f.active and w.kind='permits' and w.status<>'ANULADO' and p.customer_id=p_customer;
end;$$;
revoke all on function public.customer_permits(uuid,uuid,text,integer),public.customer_permit_file(uuid,uuid,uuid) from public,anon;
grant execute on function public.customer_permits(uuid,uuid,text,integer),public.customer_permit_file(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
