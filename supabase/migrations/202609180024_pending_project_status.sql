-- Preserve the original pending state without weakening payment or access controls.
begin;
alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check check(status in ('NUEVO','PENDIENTE','PLANIFICACION','PRODUCCION','INSTALACION','COMPLETADO','CANCELADO'));
create or replace function public.update_project(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects;st text;nm text;sd date;ed date;nt text;
begin
 if not app_private.can_access(p_company,'fin-proyectos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_project';end if;
 -- Lock financial parent first so scheduling cannot race with a payment reversal.
 perform 1 from public.invoices where company_id=p_company and project_id=p_id for update;
 select * into p from public.projects where company_id=p_company and id=p_id for update;
 if not found or p_version is null or p.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 nm:=p_data->>'name';st:=p_data->>'status';sd:=nullif(p_data->>'start_date','')::date;ed:=nullif(p_data->>'end_date','')::date;nt:=p_data->>'notes';
 if nm is null or length(trim(nm)) not between 2 and 255 or st is null or st not in ('NUEVO','PENDIENTE','PLANIFICACION','PRODUCCION','INSTALACION','COMPLETADO','CANCELADO') or nt is null or length(nt)>10000 or (sd is not null and ed is not null and ed<sd) then raise exception 'invalid_project';end if;
 if (st in ('PRODUCCION','INSTALACION','COMPLETADO') and st<>p.status) or (sd is not null and sd is distinct from p.start_date) then
  if not exists(select 1 from public.invoices where company_id=p_company and project_id=p_id and status='OPEN' and paid_amount>0) then raise exception 'deposit_required';end if;
 end if;
 update public.projects set name=trim(nm),status=st,start_date=sd,end_date=ed,notes=nt,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$$;

commit;
