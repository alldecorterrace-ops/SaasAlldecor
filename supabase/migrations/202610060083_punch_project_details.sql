-- Campo's existing clock catalog: operational client/address/date, no finances.
-- Replaces only a read RPC. Does not change rows, RLS, clock eligibility or grants.
begin;
create or replace function public.time_punch_projects(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w uuid;result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select id into w from public.workers where company_id=p_company and user_id=auth.uid() and active;
 if not found then raise exception 'worker_login_required';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'name',name,'state',state,
  'customer_name',customer_name,'project_date',project_date,'address',address
 ) order by name,id),'[]') into result from (
  select p.id,p.name,p.project_date,
   coalesce(btrim(c.full_name),'') as customer_name,
   btrim(regexp_replace(concat_ws(', ',nullif(btrim(c.address),''),nullif(btrim(c.city),''),nullif(btrim(c.postal_code),'')),',\s*EE\.?\s*UU\.?','','gi'),' ,') as address,
   app_private.time_punch_project_state(p_company,w,p.id,statement_timestamp()) as state
  from public.projects p
  left join public.customers c on c.company_id=p.company_id and c.id=p.customer_id
  where p.company_id=p_company
 ) catalog where state is not null;
 return result;
end;$$;
notify pgrst,'reload schema';
commit;
