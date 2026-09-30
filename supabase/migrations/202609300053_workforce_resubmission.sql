-- Returned is distinct from rejected. No AI result, imports or payments are created.
begin;
alter table public.workforce_expenses drop constraint workforce_expenses_status_check;
alter table public.workforce_expenses add constraint workforce_expenses_status_check check(status in ('SUBMITTED','FOREMAN_APPROVED','OFFICE_APPROVED','REJECTED','NEEDS_CORRECTION')),
 add column correction_note text,
 add column returned_at timestamptz,
 add column resubmission_count integer not null default 0 check(resubmission_count between 0 and 1),
 add column resubmitted_by uuid references auth.users(id),
 add column resubmitted_at timestamptz,
 add constraint workforce_return_reason check(status<>'NEEDS_CORRECTION' or (correction_note is not null and length(trim(correction_note)) between 5 and 1000 and returned_at is not null)),
 add constraint workforce_resubmission_actor check((resubmission_count=0 and resubmitted_by is null and resubmitted_at is null) or (resubmission_count=1 and resubmitted_by is not null and resubmitted_at is not null));
create or replace function public.correct_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_project uuid,p_general boolean,p_date date,p_amount numeric,p_category text,p_description text,p_pay_method text,p_receipt uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;e public.workforce_expenses;prior app_private.workforce_expense_requests;payload jsonb;result jsonb;role_name text;tz text;at_value timestamptz;sha text;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 actor:=app_private.workforce_actor(p_company);
 role_name:=case when app_private.is_manager(p_company) then 'ADMIN' else actor.role end;
 if role_name is null or role_name not in ('OFFICE','ADMIN') then raise exception 'expense_forbidden' using errcode='42501';end if;
 select timezone into tz from public.companies where id=p_company;
 if p_request is null or p_id is null or p_version is null or p_version<1 or p_general is null or (not p_general and p_project is null) or (p_general and p_project is not null) or p_date is null or not isfinite(p_date) or p_date>(now() at time zone tz)::date or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<=0 or round(p_amount,2)>20000 or p_category is null or p_category not in ('FUEL','MATERIALS','TOOLS','PARKING','TOLLS','OTHER') or p_description is null or length(trim(p_description))>500 or p_pay_method is null or p_pay_method not in ('propio','empresa','efectivo_empresa') or p_receipt is null or p_reason is null or length(trim(p_reason)) not between 5 and 500 then raise exception 'invalid_workforce_correction';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_view_workforce_worker(p_company,e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','manual_correction','id',p_id,'version',p_version,'project',p_project,'general',p_general,'date',p_date,'amount',round(p_amount,2),'category',p_category,'description',trim(p_description),'pay_method',p_pay_method,'receipt',p_receipt,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 if not app_private.can_access(p_company,'horasfix','write') or (not app_private.is_manager(p_company) and coalesce((app_private.workforce_actor(p_company)).role,'')<>'OFFICE') then raise exception 'expense_forbidden' using errcode='42501';end if;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 if not found or not app_private.can_view_workforce_worker(p_company,e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 if not app_private.can_access(p_company,'horasfix','write') or (not app_private.is_manager(p_company) and coalesce((app_private.workforce_actor(p_company)).role,'')<>'OFFICE') then raise exception 'expense_forbidden' using errcode='42501';end if;
 if e.version<>p_version or e.receipt_id<>p_receipt then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status not in ('SUBMITTED','FOREMAN_APPROVED','NEEDS_CORRECTION') then raise exception 'expense_correction_state' using errcode='PT409';end if;
 if not p_general and not exists(select 1 from public.projects where company_id=p_company and id=p_project) then raise exception 'project_unavailable';end if;
 select u.sha256 into sha from public.workforce_receipt_uploads u where u.company_id=p_company and u.id=e.receipt_id and u.expense_id=e.id and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||e.id::text||'/'||u.id::text||'.'||u.extension);
 if sha is null then raise exception 'receipt_unavailable';end if;
 at_value:=((p_date::timestamp+interval '12 hours') at time zone tz);
 update public.workforce_expenses set project_id=case when p_general then e.project_id else p_project end,allocation=case when p_general then 'GENERAL' else 'PROJECT' end,
 general_by=case when p_general then auth.uid() end,general_worker_id=case when p_general then actor.id end,general_at=case when p_general then now() end,general_reason=case when p_general then trim(p_reason) end,
 amount=round(p_amount,2),expense_at=at_value,category=p_category,description=trim(p_description),pay_method=p_pay_method,pay_method_set_by=auth.uid(),pay_method_set_at=now(),
 status='SUBMITTED',foreman_worker_id=null,foreman_by=null,foreman_at=null,foreman_reason=null,office_worker_id=null,office_by=null,office_at=null,office_reason=null,
 admin_review_status='REVIEWED',admin_reviewed_by=auth.uid(),admin_reviewed_at=now(),admin_review_note=trim(p_reason),
 review_snapshot=jsonb_build_object('mode','manual-admin-v1','date',p_date,'expense_epoch',extract(epoch from at_value),'amount',round(p_amount,2),'category',p_category,'description',trim(p_description),'project',case when p_general then e.project_id else p_project end,'pay_method',p_pay_method,'receipt',e.receipt_id,'receipt_sha256',sha),
 version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 result:=jsonb_build_object('id',p_id,'version',p_version+1,'status','SUBMITTED','admin_review_status','REVIEWED');
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
revoke all on function public.correct_workforce_expense(uuid,uuid,uuid,integer,uuid,boolean,date,numeric,text,text,text,uuid,text) from public,anon;
grant execute on function public.correct_workforce_expense(uuid,uuid,uuid,integer,uuid,boolean,date,numeric,text,text,text,uuid,text) to authenticated;
create function public.resubmit_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_project uuid,p_general boolean,p_date date,p_amount numeric,p_category text,p_description text,p_pay_method text,p_receipt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;e public.workforce_expenses;prior app_private.workforce_expense_requests;payload jsonb;result jsonb;tz text;at_value timestamptz;
begin
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null or not app_private.can_access(p_company,'horasfix','write') then raise exception 'worker_login_required' using errcode='42501';end if;
 select timezone into tz from public.companies where id=p_company;
 if p_request is null or p_id is null or p_version is null or p_version<1 or p_general is null or (not p_general and p_project is null) or (p_general and p_project is not null) or p_date is null or not isfinite(p_date) or p_date>(now() at time zone tz)::date or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<=0 or round(p_amount,2)>20000 or p_category is null or p_category not in ('FUEL','MATERIALS','TOOLS','PARKING','TOLLS','OTHER') or p_description is null or length(trim(p_description))>500 or p_pay_method is null or p_pay_method not in ('propio','empresa','efectivo_empresa') or p_receipt is null then raise exception 'invalid_workforce_resubmission';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or e.worker_id<>actor.id then raise exception 'expense_resubmit_forbidden' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','resubmit','id',p_id,'version',p_version,'project',p_project,'general',p_general,'date',p_date,'amount',round(p_amount,2),'category',p_category,'description',trim(p_description),'pay_method',p_pay_method,'receipt',p_receipt);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 actor:=app_private.workforce_actor(p_company);
 if not app_private.can_access(p_company,'horasfix','write') or actor.id is null or actor.id<>e.worker_id then raise exception 'expense_resubmit_forbidden' using errcode='42501';end if;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 actor:=app_private.workforce_actor(p_company);
 if not found or not app_private.can_access(p_company,'horasfix','write') or actor.id is null or e.worker_id<>actor.id then raise exception 'expense_resubmit_forbidden' using errcode='42501';end if;
 if e.version<>p_version or e.receipt_id<>p_receipt then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status<>'NEEDS_CORRECTION' then raise exception 'expense_resubmit_state' using errcode='PT409';end if;
 if e.resubmission_count<>0 then raise exception 'expense_resubmit_limit' using errcode='PT409';end if;
 at_value:=((p_date::timestamp+interval '12 hours') at time zone tz);
 if not p_general and not app_private.can_use_workforce_project(p_company,p_project,at_value) then raise exception 'project_not_assigned' using errcode='42501';end if;
 if not exists(select 1 from public.workforce_receipt_uploads u where u.company_id=p_company and u.id=e.receipt_id and u.expense_id=e.id and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||e.id::text||'/'||u.id::text||'.'||u.extension)) then raise exception 'receipt_unavailable';end if;
 update public.workforce_expenses set project_id=case when p_general then e.project_id else p_project end,allocation=case when p_general then 'GENERAL' else 'PROJECT' end,
 general_by=case when p_general then auth.uid() end,general_worker_id=case when p_general then actor.id end,general_at=case when p_general then now() end,general_reason=case when p_general then 'El trabajador reenvia como gasto general.' end,
 amount=round(p_amount,2),expense_at=at_value,category=p_category,description=trim(p_description),pay_method=p_pay_method,pay_method_set_by=auth.uid(),pay_method_set_at=now(),
 status='SUBMITTED',foreman_worker_id=null,foreman_by=null,foreman_at=null,foreman_reason=null,office_worker_id=null,office_by=null,office_at=null,office_reason=null,
 admin_review_status='PENDING',admin_reviewed_by=null,admin_reviewed_at=null,admin_review_note=null,review_snapshot=null,
 resubmission_count=1,resubmitted_by=auth.uid(),resubmitted_at=now(),version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 result:=jsonb_build_object('id',p_id,'version',p_version+1,'status','SUBMITTED','resubmission_count',1);
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
revoke all on function public.resubmit_workforce_expense(uuid,uuid,uuid,integer,uuid,boolean,date,numeric,text,text,text,uuid) from public,anon;
grant execute on function public.resubmit_workforce_expense(uuid,uuid,uuid,integer,uuid,boolean,date,numeric,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
