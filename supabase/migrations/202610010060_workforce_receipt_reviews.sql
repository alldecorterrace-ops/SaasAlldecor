-- Durable receipt analysis and separate human confirmation. No imports or payments.
begin;
create table app_private.workforce_receipt_reviews (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, expense_id uuid not null,
 actor_id uuid not null references auth.users(id), request_id uuid not null, receipt_id uuid not null,
 receipt_sha256 text not null check(receipt_sha256 ~ '^[a-f0-9]{64}$'),
 expense_version integer not null check(expense_version>0), snapshot jsonb not null,
 prompt_version text not null default 'receipt-v4' check(prompt_version='receipt-v4'),
 status text not null check(status in ('RUNNING','DONE','ERROR','STALE')),
 claim uuid not null default gen_random_uuid(), lease_until timestamptz not null,
 provider text, model text, provider_request text, result jsonb, comparison_context jsonb, error_code text,
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 unique(company_id,id), unique(company_id,actor_id,request_id),
 foreign key(company_id,expense_id) references public.workforce_expenses(company_id,id),
 foreign key(company_id,receipt_id) references public.workforce_receipt_uploads(company_id,id),
 check((status='RUNNING' and completed_at is null) or (status<>'RUNNING' and completed_at is not null)),
 check(status<>'DONE' or (result is not null and result->>'state' in ('OK','DUDA','MAL')))
);
alter table app_private.workforce_receipt_reviews enable row level security;
revoke all on app_private.workforce_receipt_reviews from public,anon,authenticated,service_role;
create index workforce_review_duplicate on app_private.workforce_receipt_reviews(company_id,receipt_sha256) where status='DONE';
create index workforce_review_history on app_private.workforce_receipt_reviews(company_id,expense_id,created_at desc);
alter table public.workforce_expenses add column receipt_review_id uuid,
 add column receipt_review_attention text check(receipt_review_attention is null or receipt_review_attention='ADMIN_CORRECTION'),
 add foreign key(company_id,receipt_review_id) references app_private.workforce_receipt_reviews(company_id,id);

create function app_private.receipt_review_snapshot(e public.workforce_expenses) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('company',e.company_id,'expense',e.id,'worker',e.worker_id,'project',e.project_id,
 'date',(e.expense_at at time zone c.timezone)::date,'amount',e.amount,'category',e.category,
 'description',e.description,'payer',e.pay_method,'allocation',e.allocation,'receipt',e.receipt_id,'receipt_sha256',u.sha256)
 from public.companies c join public.workforce_receipt_uploads u on u.company_id=c.id and u.id=e.receipt_id where c.id=e.company_id;
$$;
create function app_private.receipt_review_context(e public.workforce_expenses,p_date date) returns jsonb
language sql stable security definer set search_path='' as $$
 with local_day as (
  select (p_date::timestamp at time zone c.timezone) starts_at,
   ((p_date+1)::timestamp at time zone c.timezone) ends_at from public.companies c where c.id=e.company_id
 ), worked as (
  select distinct p.id,p.name from public.time_entries t join local_day d on true
  join public.projects p on p.company_id=t.company_id and p.id=t.project_id
  where t.company_id=e.company_id and t.worker_id=e.worker_id and t.status<>'ANULADO'
   and t.starts_at>=d.starts_at-interval '24 hours' and t.starts_at<d.ends_at
   and coalesce(t.ends_at,least(now(),t.starts_at+interval '20 hours'))>=d.starts_at
 )
 select jsonb_build_object('amount',e.amount,'expense_date',(e.expense_at at time zone c.timezone)::date,
 'project_id',e.project_id,'pay_method',e.pay_method,
 'worked_projects',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]') from worked))
 from public.companies c where c.id=e.company_id;
$$;
-- Corrections invalidate only the active pointer. All completed evidence stays immutable.
create function app_private.invalidate_receipt_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (NEW.worker_id,NEW.project_id,NEW.expense_at,NEW.amount,NEW.category,NEW.description,NEW.pay_method,NEW.allocation,NEW.receipt_id)
 is distinct from (OLD.worker_id,OLD.project_id,OLD.expense_at,OLD.amount,OLD.category,OLD.description,OLD.pay_method,OLD.allocation,OLD.receipt_id) or NEW.resubmission_count is distinct from OLD.resubmission_count then
  NEW.receipt_review_id:=null; NEW.receipt_review_attention:=null;
  if not (NEW.admin_review_status='REVIEWED' and NEW.review_snapshot is distinct from OLD.review_snapshot and NEW.review_snapshot->>'mode'='manual-admin-v1') then
   NEW.admin_review_status:='PENDING'; NEW.admin_reviewed_by:=null; NEW.admin_reviewed_at:=null;
   NEW.admin_review_note:=null; NEW.review_snapshot:=null;
  end if;
  update app_private.workforce_receipt_reviews set status='STALE',completed_at=clock_timestamp(),error_code='expense_changed'
  where company_id=OLD.company_id and expense_id=OLD.id and status='RUNNING';
 end if;
 return NEW;
end;$$;
create trigger workforce_receipt_review_invalidate before update on public.workforce_expenses
 for each row execute function app_private.invalidate_receipt_review();

create function public.prepare_workforce_receipt_review(p_company uuid,p_request uuid,p_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.workforce_expenses;j app_private.workforce_receipt_reviews;prior app_private.workforce_expense_requests;payload jsonb;answer jsonb;
begin
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 if p_request is null or p_id is null or p_version is null or p_version<1 then raise exception 'invalid_receipt_review';end if;
 -- Request lock precedes the expense lock, matching correction/archive RPCs.
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','receipt_review','id',p_id,'version',p_version);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then
  if prior.payload<>payload then raise exception 'request_conflict' using errcode='PT409';end if;
  select * into j from app_private.workforce_receipt_reviews where company_id=p_company and id=(prior.result->>'job')::uuid;
  return jsonb_build_object('job',j.id,'claimed',false,'status',j.status,'version',e.version);
 end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status not in ('SUBMITTED','FOREMAN_APPROVED','OFFICE_APPROVED') then raise exception 'receipt_review_state' using errcode='PT409';end if;
 select * into j from app_private.workforce_receipt_reviews where company_id=p_company and id=e.receipt_review_id for update;
 if found and j.snapshot=app_private.receipt_review_snapshot(e) and
 ((j.status='DONE' and j.comparison_context=app_private.receipt_review_context(e,coalesce(nullif(j.result->>'date','')::date,(j.snapshot->>'date')::date)))
 or (j.status='RUNNING' and j.lease_until>clock_timestamp())) then
  answer:=jsonb_build_object('job',j.id,'claimed',false,'status',j.status,'version',e.version);
 else
  if j.status='RUNNING' then
   update app_private.workforce_receipt_reviews set status='ERROR',completed_at=clock_timestamp(),error_code='review_timeout' where id=j.id;
  end if;
  insert into app_private.workforce_receipt_reviews(company_id,expense_id,actor_id,request_id,receipt_id,receipt_sha256,expense_version,snapshot,status,lease_until)
  values(p_company,p_id,auth.uid(),p_request,e.receipt_id,app_private.receipt_review_snapshot(e)->>'receipt_sha256',e.version+1,
   app_private.receipt_review_snapshot(e),'RUNNING',clock_timestamp()+interval '130 seconds') returning * into j;
  update public.workforce_expenses set receipt_review_id=j.id,receipt_review_attention=null,version=version+1,updated_at=now(),
   admin_review_status='PENDING',admin_reviewed_by=null,admin_reviewed_at=null,admin_review_note=null,review_snapshot=null
   where company_id=p_company and id=p_id;
  answer:=jsonb_build_object('job',j.id,'claimed',true,'status',j.status,'claim',j.claim,'version',e.version+1);
 end if;
 -- Claim never goes into the idempotent response: replays cannot run a provider twice.
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,answer-'claim',now());
 return answer;
end;$$;
create function public.workforce_receipt_review_context(p_company uuid,p_job uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.workforce_expenses;j app_private.workforce_receipt_reviews;
begin
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 select * into j from app_private.workforce_receipt_reviews where company_id=p_company and id=p_job and actor_id=auth.uid();
 if not found then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=j.expense_id;
 if j.status<>'RUNNING' or e.receipt_review_id is distinct from j.id or e.version<>j.expense_version or j.snapshot<>app_private.receipt_review_snapshot(e) or p_date is null then raise exception 'receipt_review_stale' using errcode='PT409';end if;
 return app_private.receipt_review_context(e,p_date);
end;$$;

-- Only the private server executor can persist a model response. Authenticated
-- callers cannot forge a verdict, actor, receipt hash or execution result.
create function public.finish_workforce_receipt_review(p_company uuid,p_job uuid,p_claim uuid,p_context jsonb,p_result jsonb,
 p_provider text,p_model text,p_provider_request text,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.workforce_expenses;j app_private.workforce_receipt_reviews;dupe uuid;fingerprint text;project_date date;
 previous_actor text:=current_setting('request.jwt.claim.sub',true);valid boolean;answer jsonb;
begin
 select * into j from app_private.workforce_receipt_reviews where company_id=p_company and id=p_job;
 if not found or p_claim is distinct from j.claim then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=j.expense_id for update;
 select * into j from app_private.workforce_receipt_reviews where company_id=p_company and id=p_job for update;
 if p_claim is distinct from j.claim then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 if j.status<>'RUNNING' then return jsonb_build_object('job',j.id,'status',j.status,'version',e.version);end if;
 valid:=exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=j.actor_id and m.active and m.role in ('owner','admin'));
 if not valid or e.receipt_review_id is distinct from j.id or e.version<>j.expense_version or j.snapshot<>app_private.receipt_review_snapshot(e)
 or e.status not in ('SUBMITTED','FOREMAN_APPROVED','OFFICE_APPROVED') or j.lease_until<clock_timestamp() then
  update app_private.workforce_receipt_reviews set status='STALE',completed_at=clock_timestamp(),error_code='expense_or_access_changed' where id=j.id;
  return jsonb_build_object('job',j.id,'status','STALE','version',e.version);
 end if;
 if p_error is not null then
  if p_error not in ('provider_unavailable','invalid_extraction','receipt_unavailable','receipt_mismatch','heic_conversion_required','review_timeout') then raise exception 'invalid_receipt_review';end if;
  update app_private.workforce_receipt_reviews set status='ERROR',completed_at=clock_timestamp(),error_code=p_error where id=j.id;
  return jsonb_build_object('job',j.id,'status','ERROR','version',e.version);
 end if;
 if p_result is null or jsonb_typeof(p_result)<>'object' or p_result->>'state' is null or p_result->>'state' not in ('OK','DUDA','MAL')
 or coalesce(length(p_result->>'note'),0) not between 5 and 400 or p_provider is null or p_provider not in ('anthropic','openai','synthetic-reference')
 or p_model is null or length(p_model) not between 1 and 140 or p_provider_request is null or length(p_provider_request) not between 1 and 200
 or coalesce(p_result->>'card_last4','')!~'^([0-9]{4})?$' then raise exception 'invalid_receipt_review';end if;
 begin
  project_date:=coalesce(nullif(p_result->>'date','')::date,(j.snapshot->>'date')::date);
 exception when others then raise exception 'invalid_receipt_review';end;
 if p_context is distinct from app_private.receipt_review_context(e,project_date) then
  update app_private.workforce_receipt_reviews set status='STALE',completed_at=clock_timestamp(),error_code='workday_changed' where id=j.id;
  return jsonb_build_object('job',j.id,'status','STALE','version',e.version);
 end if;
 fingerprint:=coalesce(p_result->>'invoice_fingerprint','');
 if fingerprint<>'' and fingerprint!~'^[a-f0-9]{64}$' then raise exception 'invalid_receipt_review';end if;
 -- Serialize duplicate decisions within the tenant; simultaneous receipts cannot
 -- both finish as unique. The first finished result remains part of the evidence.
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':receipt-duplicate-check',0));
 select r.expense_id into dupe from app_private.workforce_receipt_reviews r
 where r.company_id=p_company and r.expense_id<>e.id and r.status='DONE'
 and (r.receipt_sha256=j.receipt_sha256 or (fingerprint<>'' and r.result->>'invoice_fingerprint'=fingerprint))
 order by r.created_at,r.id limit 1;
 if dupe is not null then
  p_result:=jsonb_set(p_result,'{state}',to_jsonb(case when p_result->>'state'='MAL' then 'MAL' else 'DUDA' end::text));
  p_result:=jsonb_set(p_result,'{note}',to_jsonb(left((p_result->>'note')||' Posible recibo duplicado: '||dupe::text||'.',400)));
 end if;
 p_result:=p_result||jsonb_build_object('duplicate_of',dupe);
 update app_private.workforce_receipt_reviews set status='DONE',result=p_result,comparison_context=p_context,provider=p_provider,model=p_model,
  provider_request=p_provider_request,completed_at=clock_timestamp() where id=j.id;
 perform set_config('request.jwt.claim.sub',j.actor_id::text,true);
 -- Never return an approved expense or automatically approve/reimburse.
 update public.workforce_expenses set
  status=case when e.status='SUBMITTED' and p_result->>'state' in ('DUDA','MAL') and e.resubmission_count=0 then 'NEEDS_CORRECTION' else e.status end,
  correction_note=case when e.status='SUBMITTED' and p_result->>'state' in ('DUDA','MAL') then p_result->>'note' else e.correction_note end,
  returned_at=case when e.status='SUBMITTED' and p_result->>'state' in ('DUDA','MAL') and e.resubmission_count=0 then now() else e.returned_at end,
  receipt_review_attention=case when e.status='SUBMITTED' and p_result->>'state' in ('DUDA','MAL') and e.resubmission_count=1 then 'ADMIN_CORRECTION' else null end,
  version=version+1,updated_at=now()
 where company_id=p_company and id=e.id returning * into e;
 perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
 answer:=jsonb_build_object('job',j.id,'status','DONE','version',e.version,'expense_status',e.status);
 return answer;
end;$$;
create function public.confirm_workforce_receipt_review(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_job uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.workforce_expenses;j app_private.workforce_receipt_reviews;prior app_private.workforce_expense_requests;payload jsonb;answer jsonb;
begin
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 if p_request is null or p_id is null or p_version is null or p_version<1 or p_job is null or p_note is null or length(trim(p_note)) not between 5 and 500 then raise exception 'invalid_receipt_confirmation';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','receipt_confirm','id',p_id,'version',p_version,'job',p_job,'note',trim(p_note));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status not in ('SUBMITTED','FOREMAN_APPROVED','OFFICE_APPROVED') then raise exception 'receipt_review_state' using errcode='PT409';end if;
 select * into j from app_private.workforce_receipt_reviews where company_id=p_company and id=p_job and expense_id=p_id;
 if not found or j.status<>'DONE' or e.receipt_review_id is distinct from j.id or j.snapshot<>app_private.receipt_review_snapshot(e) then raise exception 'receipt_review_stale' using errcode='PT409';end if;
 if j.comparison_context is distinct from app_private.receipt_review_context(e,coalesce(nullif(j.result->>'date','')::date,(j.snapshot->>'date')::date)) then raise exception 'receipt_review_stale' using errcode='PT409';end if;
 if e.admin_review_status<>'REVIEWED' then
  update public.workforce_expenses set admin_review_status='REVIEWED',admin_reviewed_by=auth.uid(),admin_reviewed_at=now(),
   admin_review_note=trim(p_note),review_snapshot=j.snapshot||jsonb_build_object('mode','receipt-v4','job',j.id,'state',j.result->>'state'),
   version=version+1,updated_at=now() where company_id=p_company and id=p_id returning * into e;
 end if;
 answer:=jsonb_build_object('id',e.id,'version',e.version,'status',e.status,'reviewed',true);
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,answer,now());
 return answer;
end;$$;
create function public.workforce_receipt_reviews(p_company uuid,p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>20 then raise exception 'invalid_receipt_review';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'expense_id',j.expense_id,'receipt_id',j.receipt_id,
 'receipt_sha256',j.receipt_sha256,'expense_version',j.expense_version,'prompt_version',j.prompt_version,'status',j.status,
 'lease_until',j.lease_until,'current',e.receipt_review_id=j.id and j.snapshot=app_private.receipt_review_snapshot(e) and
 (j.status<>'DONE' or j.comparison_context=app_private.receipt_review_context(e,coalesce(nullif(j.result->>'date','')::date,(j.snapshot->>'date')::date))),
 'actor_id',j.actor_id,'created_at',j.created_at,'completed_at',j.completed_at,'provider',j.provider,
 'model',j.model,'result',j.result,'error_code',j.error_code) order by j.created_at desc,j.id),'[]')
 from app_private.workforce_receipt_reviews j join public.workforce_expenses e on e.company_id=j.company_id and e.id=j.expense_id
 where j.company_id=p_company and j.expense_id=any(p_ids) and app_private.can_read_workforce_expense_record(e.company_id,e.id));
end;$$;
revoke all on function app_private.receipt_review_snapshot(public.workforce_expenses),app_private.receipt_review_context(public.workforce_expenses,date),
 app_private.invalidate_receipt_review() from public,anon,authenticated,service_role;
revoke all on function public.prepare_workforce_receipt_review(uuid,uuid,uuid,integer),
 public.workforce_receipt_review_context(uuid,uuid,date),public.confirm_workforce_receipt_review(uuid,uuid,uuid,integer,uuid,text),
 public.workforce_receipt_reviews(uuid,uuid[]) from public,anon,service_role;
grant execute on function public.prepare_workforce_receipt_review(uuid,uuid,uuid,integer),
 public.workforce_receipt_review_context(uuid,uuid,date),public.confirm_workforce_receipt_review(uuid,uuid,uuid,integer,uuid,text),
 public.workforce_receipt_reviews(uuid,uuid[]) to authenticated;
revoke all on function public.finish_workforce_receipt_review(uuid,uuid,uuid,jsonb,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_workforce_receipt_review(uuid,uuid,uuid,jsonb,jsonb,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
