-- Durable receipts for finance writes. Additive, no business imports or charges.
begin;
create table app_private.finance_requests (
 company_id uuid not null references public.companies(id),
 actor_id uuid not null references auth.users(id), request_id uuid not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(company_id,actor_id,request_id)
);
alter table app_private.finance_requests enable row level security;
revoke all on app_private.finance_requests from public,anon,authenticated;
create function public.execute_finance_action(p_company uuid,p_request uuid,p_operation text,p_id uuid,p_version integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior app_private.finance_requests;payload jsonb;result jsonb;result_id uuid;result_version integer;module text;
begin
 module:=case when p_operation='project' then 'fin-proyectos' when p_operation='approve' then 'fin-estimados' else 'fin-invoices' end;
 if auth.uid() is null or not app_private.can_access(p_company,module,'write')
 or (p_operation='approve' and (not app_private.can_access(p_company,'fin-invoices','write') or not app_private.can_access(p_company,'fin-proyectos','write')))
 then raise exception 'permission_denied' using errcode='42501';end if;
 if p_request is null or p_id is null or p_version is null or p_version<1 or p_operation is null
 or p_operation not in ('approve','payment','void-payment','invoice','void-invoice','project')
 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_finance_request';end if;
 payload:=jsonb_build_object('operation',p_operation,'id',p_id,'version',p_version,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':finance-request:'||auth.uid()::text||':'||p_request::text,0));
 select * into prior from app_private.finance_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then
  if prior.payload<>payload then raise exception 'request_conflict' using errcode='PT409';end if;
  return prior.result;
 end if;
 if p_operation='approve' then
  result_id:=public.approve_estimate(p_company,p_id,p_version,(p_data->>'date')::date,p_data->>'name',p_data->>'note');
  select version into result_version from public.invoices where company_id=p_company and id=result_id;
 elsif p_operation='payment' then
  result_id:=public.record_payment(p_company,(p_data->>'payment_id')::uuid,p_id,p_version,p_data-'payment_id');
  select version into result_version from public.payments where company_id=p_company and id=result_id;
 elsif p_operation='void-payment' then
  perform public.void_payment(p_company,p_id,p_version,p_data->>'reason');
  result_id:=p_id;
  select version into result_version from public.payments where company_id=p_company and id=p_id;
 elsif p_operation in ('invoice','void-invoice') then
  perform public.update_invoice(p_company,p_id,p_version,(p_data->>'date')::date,nullif(p_data->>'due','')::date,
   p_data->>'notes',case when p_operation='void-invoice' then p_data->>'reason' else null end);
  result_id:=p_id;
  select version into result_version from public.invoices where company_id=p_company and id=p_id;
 else
  perform public.update_project(p_company,p_id,p_version,p_data);
  result_id:=p_id;
  select version into result_version from public.projects where company_id=p_company and id=p_id;
 end if;
 result:=jsonb_build_object('id',result_id,'version',result_version,'operation',p_operation);
 insert into app_private.finance_requests(company_id,actor_id,request_id,payload,result) values(p_company,auth.uid(),p_request,payload,result);
 return result;
end;$$;
revoke all on function public.execute_finance_action(uuid,uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.execute_finance_action(uuid,uuid,text,uuid,integer,jsonb) to authenticated;
commit;
