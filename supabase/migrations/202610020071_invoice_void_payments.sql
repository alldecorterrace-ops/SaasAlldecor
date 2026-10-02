-- ADT invoiceVoid retains paid/balance and associates applied payments with the
-- void invoice. This changes future actions only; existing records are untouched.
begin;
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
 check(status in ('APPLIED','ASSOCIATED_TO_VOID_INVOICE','VOID'));

create or replace function public.update_invoice(p_company uuid,p_id uuid,p_version integer,p_date date,p_due date,p_notes text,p_void_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare i public.invoices;
begin
 if not app_private.can_access(p_company,'fin-invoices','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into i from public.invoices where company_id=p_company and id=p_id for update;
 if not found then raise exception 'record_conflict' using errcode='PT409';end if;
 if i.status='VOID' then
  if p_void_reason is not null then return;end if;
  raise exception 'invoice_void';
 end if;
 if p_version is null or i.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if p_void_reason is not null then
  if length(trim(p_void_reason)) not between 1 and 2000 then raise exception 'reason_required';end if;
  -- Invoice lock is always acquired before payment locks, as in record/void_payment.
  -- Preserve invoice financial values, dates, notes, lines and project exactly.
  update public.invoices set status='VOID',payment_status='VOID',void_reason=trim(p_void_reason),
   version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
  update public.payments set status='ASSOCIATED_TO_VOID_INVOICE',void_reason=trim(p_void_reason),
   version=version+1,updated_by=auth.uid(),updated_at=now()
   where company_id=p_company and invoice_id=p_id and status='APPLIED';
 else
  if p_date is null or (p_due is not null and p_due<p_date) or p_notes is null or length(p_notes)>10000 then raise exception 'invalid_invoice';end if;
  update public.invoices set invoice_date=p_date,due_date=p_due,notes=p_notes,
   version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
end;$$;

-- ADT paymentVoid permits reversal of an associated payment and recomputes using
-- only APPLIED rows, even for a void invoice. It does not refund money.
create or replace function app_private.recompute_invoice(p_company uuid,p_invoice uuid)
returns void language plpgsql security definer set search_path='' as $$
declare paid numeric;i public.invoices;
begin
 select * into strict i from public.invoices where company_id=p_company and id=p_invoice for update;
 select coalesce(sum(amount),0) into paid from public.payments where company_id=p_company and invoice_id=p_invoice and status='APPLIED';
 if paid>i.total then raise exception 'overpayment';end if;
 update public.invoices set paid_amount=paid,balance_due=total-paid,
  payment_status=case when status='VOID' then 'VOID' when paid=total then 'PAID' when paid>0 then 'PARTIAL' else 'UNPAID' end,
  version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_invoice;
end;$$;
CREATE OR REPLACE FUNCTION public.void_payment(p_company uuid, p_id uuid, p_version integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.payments;iid uuid;
begin
 if not app_private.can_access(p_company,'fin-invoices','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'reason_required';end if;
 select invoice_id into iid from public.payments where company_id=p_company and id=p_id;
 if iid is null then raise exception 'payment_unavailable';end if;
 -- Always lock invoice before payment, same order as recording a payment.
 perform 1 from public.invoices where company_id=p_company and id=iid for update;
 select * into p from public.payments where company_id=p_company and id=p_id for update;
 if p.status='VOID' then return;end if;
 if p_version is null or p.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 update public.payments set status='VOID',void_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 perform app_private.recompute_invoice(p_company,iid);
end;$function$;

create or replace function public.execute_finance_action(p_company uuid,p_request uuid,p_operation text,p_id uuid,p_version integer,p_data jsonb)
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
  if p_operation='void-invoice' and (p_data->>'reason' is null or length(trim(p_data->>'reason')) not between 1 and 2000) then raise exception 'reason_required';end if;
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

commit;
