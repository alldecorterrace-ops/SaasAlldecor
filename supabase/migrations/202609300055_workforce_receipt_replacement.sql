-- Optional replacement is part of correction/resubmission. Old objects stay immutable.
begin;
create table public.workforce_receipt_changes (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),expense_id uuid not null,
 old_receipt_id uuid not null,new_receipt_id uuid not null,expense_version integer not null check(expense_version>1),
 actor_id uuid not null references auth.users(id),operation text not null check(operation in ('manual_correction','resubmit')),
 reason text not null,created_at timestamptz not null default now(),
 foreign key(company_id,expense_id) references public.workforce_expenses(company_id,id),
 foreign key(company_id,old_receipt_id) references public.workforce_receipt_uploads(company_id,id),
 foreign key(company_id,new_receipt_id) references public.workforce_receipt_uploads(company_id,id),
 unique(company_id,expense_id,expense_version),check(old_receipt_id<>new_receipt_id)
);
alter table public.workforce_receipt_changes enable row level security;
revoke all on public.workforce_receipt_changes from public,anon,authenticated;
grant select on public.workforce_receipt_changes to authenticated;
create policy workforce_receipt_changes_read on public.workforce_receipt_changes for select to authenticated using(exists(select 1 from public.workforce_expenses e where e.company_id=workforce_receipt_changes.company_id and e.id=workforce_receipt_changes.expense_id and app_private.can_read_workforce_expense(e.company_id,e.worker_id)));
create function app_private.can_edit_workforce_receipt(p_company uuid,p_expense uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(app_private.can_access(p_company,'horasfix','write') and exists(select 1 from public.workforce_expenses e where e.company_id=p_company and e.id=p_expense and app_private.can_view_workforce_worker(e.company_id,e.worker_id) and (
  ((app_private.is_manager(p_company) or (app_private.workforce_actor(p_company)).role='OFFICE') and e.status in ('SUBMITTED','FOREMAN_APPROVED','NEEDS_CORRECTION'))
  or ((app_private.workforce_actor(p_company)).id=e.worker_id and e.status='NEEDS_CORRECTION' and e.resubmission_count=0))),false);
$$;
create function app_private.workforce_receipt_used(p_company uuid,p_expense uuid,p_receipt uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workforce_expenses e where e.company_id=p_company and e.id=p_expense and (e.receipt_id=p_receipt or exists(select 1 from public.workforce_receipt_changes c where c.company_id=e.company_id and c.expense_id=e.id and p_receipt in(c.old_receipt_id,c.new_receipt_id))));
$$;
revoke all on function app_private.can_edit_workforce_receipt(uuid,uuid),app_private.workforce_receipt_used(uuid,uuid,uuid) from public,anon;
grant execute on function app_private.can_edit_workforce_receipt(uuid,uuid),app_private.workforce_receipt_used(uuid,uuid,uuid) to authenticated;
drop policy workforce_receipt_creator_read on public.workforce_receipt_uploads;
create policy workforce_receipt_creator_read on public.workforce_receipt_uploads for select to authenticated using(actor_id=auth.uid() and (
 (not exists(select 1 from public.workforce_expenses e where e.id=expense_id) and app_private.can_prepare_workforce_receipt(company_id))
 or app_private.can_edit_workforce_receipt(company_id,expense_id)
 or (app_private.workforce_receipt_used(company_id,expense_id,id) and exists(select 1 from public.workforce_expenses e where e.company_id=workforce_receipt_uploads.company_id and e.id=workforce_receipt_uploads.expense_id and app_private.can_read_workforce_expense(e.company_id,e.worker_id)))));
create or replace function app_private.workforce_receipt_access(p_name text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_action in ('read','write') and exists(select 1 from public.workforce_receipt_uploads u
 where p_name=u.company_id::text||'/'||u.expense_id::text||'/'||u.id::text||'.'||u.extension and (
  (u.actor_id=auth.uid() and not app_private.workforce_receipt_used(u.company_id,u.expense_id,u.id) and (
   (not exists(select 1 from public.workforce_expenses e where e.id=u.expense_id) and app_private.can_prepare_workforce_receipt(u.company_id))
   or app_private.can_edit_workforce_receipt(u.company_id,u.expense_id)))
  or (p_action='read' and app_private.workforce_receipt_used(u.company_id,u.expense_id,u.id) and exists(select 1 from public.workforce_expenses e where e.company_id=u.company_id and e.id=u.expense_id and app_private.can_read_workforce_expense(e.company_id,e.worker_id)))
  )),false);
$$;
create or replace function public.prepare_workforce_receipt(p_company uuid,p_expense uuid,p_sha256 text,p_bytes integer,p_extension text,p_name text)
returns public.workforce_receipt_uploads language plpgsql security definer set search_path='' as $$
declare u public.workforce_receipt_uploads;existing boolean;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'worker_login_required' using errcode='42501';end if;
 if p_expense is null or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 1 and 8388608 or p_extension is null or p_extension not in ('jpg','png','webp','heic','heif') or p_name is null or length(p_name) not between 1 and 200 or p_name ~ '[[:cntrl:]/\\]' then raise exception 'invalid_workforce_receipt';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-upload:'||p_expense::text,0));
 select exists(select 1 from public.workforce_expenses where id=p_expense) into existing;
 if existing and not exists(select 1 from public.workforce_expenses e where e.id=p_expense and e.company_id=p_company and app_private.can_read_workforce_expense(e.company_id,e.worker_id)) then raise exception 'expense_forbidden' using errcode='42501';end if;
 if existing and (p_extension not in ('jpg','png','webp') or p_bytes<400) then raise exception 'invalid_workforce_receipt_replacement';end if;
 select * into u from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_expense and actor_id=auth.uid() and sha256=p_sha256;
 if found then
  if u.bytes<>p_bytes or u.extension<>p_extension or u.original_name<>p_name then raise exception 'receipt_mismatch';end if;
  if (existing and not (app_private.can_edit_workforce_receipt(p_company,p_expense) or app_private.workforce_receipt_used(p_company,p_expense,u.id))) or (not existing and not app_private.can_prepare_workforce_receipt(p_company)) then raise exception 'expense_forbidden' using errcode='42501';end if;
  return u;
 end if;
 if (existing and not app_private.can_edit_workforce_receipt(p_company,p_expense)) or (not existing and not app_private.can_prepare_workforce_receipt(p_company)) then raise exception 'expense_forbidden' using errcode='42501';end if;
 if (select count(*) from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_expense)>=30 then raise exception 'receipt_upload_limit';end if;
 insert into public.workforce_receipt_uploads(company_id,expense_id,actor_id,sha256,bytes,extension,original_name) values(p_company,p_expense,auth.uid(),p_sha256,p_bytes,p_extension,p_name) returning * into u;
 return u;
end;$$;
create function public.workforce_expense_receipt_version(p_company uuid,p_id uuid,p_receipt uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.workforce_expenses;u public.workforce_receipt_uploads;
begin
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_read_workforce_expense(p_company,e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 select * into u from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_id and id=p_receipt and (app_private.workforce_receipt_used(p_company,p_id,id) or (actor_id=auth.uid() and app_private.can_edit_workforce_receipt(p_company,p_id)));
 if not found then raise exception 'receipt_unavailable';end if;
 return jsonb_build_object('id',u.id,'company_id',u.company_id,'expense_id',u.expense_id,'sha256',u.sha256,'bytes',u.bytes,'extension',u.extension,'original_name',u.original_name);
end;$$;
create function public.workforce_receipt_versions(p_company uuid,p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>20 then raise exception 'invalid_receipt_query';end if;
 select coalesce(jsonb_agg(jsonb_build_object('expense_id',e.id,'receipts',(select jsonb_agg(jsonb_build_object('id',u.id,'original_name',u.original_name,'created_at',u.created_at,'current',u.id=e.receipt_id) order by u.created_at,u.id) from public.workforce_receipt_uploads u where u.company_id=e.company_id and u.expense_id=e.id and app_private.workforce_receipt_used(e.company_id,e.id,u.id))) order by e.id),'[]') into result
 from public.workforce_expenses e where e.company_id=p_company and e.id=any(p_ids) and app_private.can_read_workforce_expense(e.company_id,e.worker_id);
 return result;
end;$$;
create function public.correct_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_project uuid,p_general boolean,p_date date,p_amount numeric,p_category text,p_description text,p_pay_method text,p_receipt uuid,p_reason text,p_new_receipt uuid)
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
 if p_new_receipt is not null then payload:=payload||jsonb_build_object('new_receipt',p_new_receipt);end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 if not app_private.can_access(p_company,'horasfix','write') or (not app_private.is_manager(p_company) and coalesce((app_private.workforce_actor(p_company)).role,'')<>'OFFICE') then raise exception 'expense_forbidden' using errcode='42501';end if;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 if not found or not app_private.can_view_workforce_worker(p_company,e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 if not app_private.can_access(p_company,'horasfix','write') or (not app_private.is_manager(p_company) and coalesce((app_private.workforce_actor(p_company)).role,'')<>'OFFICE') then raise exception 'expense_forbidden' using errcode='42501';end if;
 if e.version<>p_version or e.receipt_id<>p_receipt then raise exception 'record_conflict' using errcode='PT409';end if;
 if p_new_receipt is not null and p_new_receipt<>e.receipt_id and not exists(select 1 from public.workforce_receipt_uploads u where u.company_id=p_company and u.expense_id=p_id and u.id=p_new_receipt and u.actor_id=auth.uid() and u.extension in ('jpg','png','webp') and u.bytes>=400 and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||p_id::text||'/'||u.id::text||'.'||u.extension)) then raise exception 'receipt_unavailable';end if;

 if e.status not in ('SUBMITTED','FOREMAN_APPROVED','NEEDS_CORRECTION') then raise exception 'expense_correction_state' using errcode='PT409';end if;
 if not p_general and not exists(select 1 from public.projects where company_id=p_company and id=p_project) then raise exception 'project_unavailable';end if;
 select u.sha256 into sha from public.workforce_receipt_uploads u where u.company_id=p_company and u.id=e.receipt_id and u.expense_id=e.id and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||e.id::text||'/'||u.id::text||'.'||u.extension);
 if sha is null then raise exception 'receipt_unavailable';end if;
 if p_new_receipt is not null then select sha256 into sha from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_id and id=p_new_receipt;end if;
 at_value:=((p_date::timestamp+interval '12 hours') at time zone tz);
 update public.workforce_expenses set receipt_id=coalesce(p_new_receipt,e.receipt_id),project_id=case when p_general then e.project_id else p_project end,allocation=case when p_general then 'GENERAL' else 'PROJECT' end,
 general_by=case when p_general then auth.uid() end,general_worker_id=case when p_general then actor.id end,general_at=case when p_general then now() end,general_reason=case when p_general then trim(p_reason) end,
 amount=round(p_amount,2),expense_at=at_value,category=p_category,description=trim(p_description),pay_method=p_pay_method,pay_method_set_by=auth.uid(),pay_method_set_at=now(),
 status='SUBMITTED',foreman_worker_id=null,foreman_by=null,foreman_at=null,foreman_reason=null,office_worker_id=null,office_by=null,office_at=null,office_reason=null,
 admin_review_status='REVIEWED',admin_reviewed_by=auth.uid(),admin_reviewed_at=now(),admin_review_note=trim(p_reason),
 review_snapshot=jsonb_build_object('mode','manual-admin-v1','date',p_date,'expense_epoch',extract(epoch from at_value),'amount',round(p_amount,2),'category',p_category,'description',trim(p_description),'project',case when p_general then e.project_id else p_project end,'pay_method',p_pay_method,'receipt',coalesce(p_new_receipt,e.receipt_id),'receipt_sha256',sha),
 version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 result:=jsonb_build_object('id',p_id,'version',p_version+1,'status','SUBMITTED','admin_review_status','REVIEWED');
 if p_new_receipt is not null then result:=result||jsonb_build_object('receipt_id',p_new_receipt);if p_new_receipt<>e.receipt_id then insert into public.workforce_receipt_changes(company_id,expense_id,old_receipt_id,new_receipt_id,expense_version,actor_id,operation,reason) values(p_company,p_id,e.receipt_id,p_new_receipt,p_version+1,auth.uid(),'manual_correction',trim(p_reason));end if;end if;
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
create or replace function public.correct_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_project uuid,p_general boolean,p_date date,p_amount numeric,p_category text,p_description text,p_pay_method text,p_receipt uuid,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$ select public.correct_workforce_expense(p_company,p_request,p_id,p_version,p_project,p_general,p_date,p_amount,p_category,p_description,p_pay_method,p_receipt,p_reason,null::uuid);$$;
revoke all on function public.correct_workforce_expense(uuid,uuid,uuid,integer,uuid,boolean,date,numeric,text,text,text,uuid,text,uuid) from public,anon;
grant execute on function public.correct_workforce_expense(uuid,uuid,uuid,integer,uuid,boolean,date,numeric,text,text,text,uuid,text,uuid) to authenticated;
create function public.resubmit_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_project uuid,p_general boolean,p_date date,p_amount numeric,p_category text,p_description text,p_pay_method text,p_receipt uuid,p_new_receipt uuid)
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
 if p_new_receipt is not null then payload:=payload||jsonb_build_object('new_receipt',p_new_receipt);end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 actor:=app_private.workforce_actor(p_company);
 if not app_private.can_access(p_company,'horasfix','write') or actor.id is null or actor.id<>e.worker_id then raise exception 'expense_resubmit_forbidden' using errcode='42501';end if;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 actor:=app_private.workforce_actor(p_company);
 if not found or not app_private.can_access(p_company,'horasfix','write') or actor.id is null or e.worker_id<>actor.id then raise exception 'expense_resubmit_forbidden' using errcode='42501';end if;
 if e.version<>p_version or e.receipt_id<>p_receipt then raise exception 'record_conflict' using errcode='PT409';end if;
 if p_new_receipt is not null and p_new_receipt<>e.receipt_id and not exists(select 1 from public.workforce_receipt_uploads u where u.company_id=p_company and u.expense_id=p_id and u.id=p_new_receipt and u.actor_id=auth.uid() and u.extension in ('jpg','png','webp') and u.bytes>=400 and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||p_id::text||'/'||u.id::text||'.'||u.extension)) then raise exception 'receipt_unavailable';end if;

 if e.status<>'NEEDS_CORRECTION' then raise exception 'expense_resubmit_state' using errcode='PT409';end if;
 if e.resubmission_count<>0 then raise exception 'expense_resubmit_limit' using errcode='PT409';end if;
 at_value:=((p_date::timestamp+interval '12 hours') at time zone tz);
 if not p_general and not exists(select 1 from public.projects where company_id=p_company and id=p_project) then raise exception 'project_unavailable';end if;
 if not exists(select 1 from public.workforce_receipt_uploads u where u.company_id=p_company and u.id=e.receipt_id and u.expense_id=e.id and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||e.id::text||'/'||u.id::text||'.'||u.extension)) then raise exception 'receipt_unavailable';end if;
 update public.workforce_expenses set receipt_id=coalesce(p_new_receipt,e.receipt_id),project_id=case when p_general then e.project_id else p_project end,allocation=case when p_general then 'GENERAL' else 'PROJECT' end,
 general_by=case when p_general then auth.uid() end,general_worker_id=case when p_general then actor.id end,general_at=case when p_general then now() end,general_reason=case when p_general then 'El trabajador reenvia como gasto general.' end,
 amount=round(p_amount,2),expense_at=at_value,category=p_category,description=trim(p_description),pay_method=p_pay_method,pay_method_set_by=auth.uid(),pay_method_set_at=now(),
 status='SUBMITTED',foreman_worker_id=null,foreman_by=null,foreman_at=null,foreman_reason=null,office_worker_id=null,office_by=null,office_at=null,office_reason=null,
 admin_review_status='PENDING',admin_reviewed_by=null,admin_reviewed_at=null,admin_review_note=null,review_snapshot=null,
 resubmission_count=1,resubmitted_by=auth.uid(),resubmitted_at=now(),version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 result:=jsonb_build_object('id',p_id,'version',p_version+1,'status','SUBMITTED','resubmission_count',1);
 if p_new_receipt is not null then result:=result||jsonb_build_object('receipt_id',p_new_receipt);if p_new_receipt<>e.receipt_id then insert into public.workforce_receipt_changes(company_id,expense_id,old_receipt_id,new_receipt_id,expense_version,actor_id,operation,reason) values(p_company,p_id,e.receipt_id,p_new_receipt,p_version+1,auth.uid(),'resubmit','El trabajador sustituyó el recibo al reenviar.');end if;end if;
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
create or replace function public.resubmit_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_project uuid,p_general boolean,p_date date,p_amount numeric,p_category text,p_description text,p_pay_method text,p_receipt uuid)
returns jsonb language sql security invoker set search_path='' as $$ select public.resubmit_workforce_expense(p_company,p_request,p_id,p_version,p_project,p_general,p_date,p_amount,p_category,p_description,p_pay_method,p_receipt,null::uuid);$$;
revoke all on function public.resubmit_workforce_expense(uuid,uuid,uuid,integer,uuid,boolean,date,numeric,text,text,text,uuid,uuid) from public,anon;
grant execute on function public.resubmit_workforce_expense(uuid,uuid,uuid,integer,uuid,boolean,date,numeric,text,text,text,uuid,uuid) to authenticated;
revoke all on function public.workforce_expense_receipt_version(uuid,uuid,uuid),public.workforce_receipt_versions(uuid,uuid[]) from public,anon;
grant execute on function public.workforce_expense_receipt_version(uuid,uuid,uuid),public.workforce_receipt_versions(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
