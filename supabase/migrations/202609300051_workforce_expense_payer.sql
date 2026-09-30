-- Explicit payer for new Workforce submissions; historical unknown values remain unknown.
-- No business imports, inferred debt, reimbursement, or accounting copies.
begin;
alter table public.workforce_expenses
 add column pay_method text,
 add column pay_method_set_by uuid references auth.users(id),
 add column pay_method_set_at timestamptz,
 add constraint workforce_expense_payer_check check (
  (pay_method is null and pay_method_set_by is null and pay_method_set_at is null)
  or (pay_method is not null and pay_method in ('propio','empresa','efectivo_empresa') and pay_method_set_by is not null and pay_method_set_at is not null)
 );
create function public.submit_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_project uuid,p_at timestamptz,p_amount numeric,p_category text,p_description text,p_receipt uuid,p_pay_method text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;u public.workforce_receipt_uploads;prior app_private.workforce_expense_requests;payload jsonb;result jsonb;
begin
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null or not app_private.can_access(p_company,'horasfix','write') then raise exception 'worker_login_required' using errcode='42501';end if;
 if p_pay_method is null or p_pay_method not in ('propio','empresa','efectivo_empresa') then raise exception 'invalid_workforce_payer';end if;
 if p_request is null or p_id is null or p_at is null or not isfinite(p_at) or p_at<now()-interval '90 days' or p_at>now()+interval '5 minutes' or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<=0 or round(p_amount,2)>10000 or p_category is null or p_category not in ('FUEL','MATERIALS','TOOLS','PARKING','TOLLS','OTHER') or p_description is null or length(trim(p_description))>1000 then raise exception 'invalid_workforce_expense';end if;
 if not app_private.can_use_workforce_project(p_company,p_project,p_at) then raise exception 'project_not_assigned' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','submit','id',p_id,'worker',actor.id,'project',p_project,'at',p_at,'amount',round(p_amount,2),'category',p_category,'description',trim(p_description),'receipt',p_receipt,'pay_method',p_pay_method);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-upload:'||p_id::text,0));
 if exists(select 1 from public.workforce_expenses where id=p_id) then raise exception 'record_conflict' using errcode='PT409';end if;
 select * into u from public.workforce_receipt_uploads where company_id=p_company and id=p_receipt and expense_id=p_id and actor_id=auth.uid();
 if not found or not exists(select 1 from storage.objects where bucket_id='workforce-receipts' and name=p_company::text||'/'||p_id::text||'/'||u.id::text||'.'||u.extension) then raise exception 'receipt_unavailable';end if;
 insert into public.workforce_expenses(id,company_id,worker_id,project_id,expense_at,amount,category,description,receipt_id,created_by,pay_method,pay_method_set_by,pay_method_set_at)
 values(p_id,p_company,actor.id,p_project,p_at,round(p_amount,2),p_category,trim(p_description),u.id,auth.uid(),p_pay_method,auth.uid(),now());
 result:=jsonb_build_object('id',p_id,'version',1,'status','SUBMITTED','pay_method',p_pay_method);
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
create or replace function public.submit_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_project uuid,p_at timestamptz,p_amount numeric,p_category text,p_description text,p_receipt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;u public.workforce_receipt_uploads;prior app_private.workforce_expense_requests;payload jsonb;result jsonb;
begin
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null or not app_private.can_access(p_company,'horasfix','write') then raise exception 'worker_login_required' using errcode='42501';end if;
 if p_request is null or p_id is null or p_at is null or not isfinite(p_at) or p_at<now()-interval '90 days' or p_at>now()+interval '5 minutes' or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<=0 or round(p_amount,2)>10000 or p_category is null or p_category not in ('FUEL','MATERIALS','TOOLS','PARKING','TOLLS','OTHER') or p_description is null or length(trim(p_description))>1000 then raise exception 'invalid_workforce_expense';end if;
 if not app_private.can_use_workforce_project(p_company,p_project,p_at) then raise exception 'project_not_assigned' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','submit','id',p_id,'worker',actor.id,'project',p_project,'at',p_at,'amount',round(p_amount,2),'category',p_category,'description',trim(p_description),'receipt',p_receipt);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 raise exception 'invalid_workforce_payer';
end;$$;
revoke all on function public.submit_workforce_expense(uuid,uuid,uuid,uuid,timestamptz,numeric,text,text,uuid,text) from public,anon;
grant execute on function public.submit_workforce_expense(uuid,uuid,uuid,uuid,timestamptz,numeric,text,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
