-- Owner excluded AI on 2026-10-06. Manual review preserves approval and costs.
begin;
create or replace function app_private.workforce_review_is_current(p_company uuid,p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare e public.workforce_expenses; j app_private.workforce_receipt_reviews;sha text;tz text;
begin
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_read_workforce_expense_record(p_company,p_id) or e.admin_review_status<>'REVIEWED' or e.admin_reviewed_by is null or e.admin_reviewed_at is null then return false;end if;
 select u.sha256 into sha from public.workforce_receipt_uploads u where u.company_id=p_company and u.id=e.receipt_id and u.expense_id=e.id
 and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||e.id::text||'/'||u.id::text||'.'||u.extension);
 if sha is null then return false;end if;
 select timezone into tz from public.companies where id=p_company;
 if e.review_snapshot->>'mode'='manual-review-v1' then
  return coalesce((e.review_snapshot-array['mode','expense_epoch'])=app_private.receipt_review_snapshot(e)
   and (e.review_snapshot->>'expense_epoch')::numeric=extract(epoch from e.expense_at),false);
 end if;
 if e.review_snapshot->>'mode'='manual-admin-v1' then
  return coalesce(e.review_snapshot->>'receipt'=e.receipt_id::text and e.review_snapshot->>'receipt_sha256'=sha
   and (e.review_snapshot->>'expense_epoch')::numeric=extract(epoch from e.expense_at)
   and (e.review_snapshot->>'amount')::numeric=e.amount and e.review_snapshot->>'project'=e.project_id::text
   and e.review_snapshot->>'pay_method'=e.pay_method and (e.review_snapshot->>'date')::date=(e.expense_at at time zone tz)::date
   and e.review_snapshot->>'category'=e.category and e.review_snapshot->>'description'=e.description,false);
 end if;
 if e.review_snapshot->>'mode'<>'receipt-v4' or e.receipt_review_id is null then return false;end if;
 select * into j from app_private.workforce_receipt_reviews where company_id=p_company and expense_id=p_id and id=e.receipt_review_id;
 return coalesce(found and j.status='DONE' and e.review_snapshot->>'job'=j.id::text
  and (e.review_snapshot-array['mode','job','state'])=app_private.receipt_review_snapshot(e)
  and j.snapshot=app_private.receipt_review_snapshot(e)
  and j.comparison_context=app_private.receipt_review_context(e,coalesce(nullif(j.result->>'date','')::date,(j.snapshot->>'date')::date)),false);
end;$$;
create function public.review_workforce_receipt_manually(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.workforce_expenses;sha text;snapshot jsonb;prior app_private.workforce_expense_requests;payload jsonb;answer jsonb;
begin
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 if p_request is null or p_id is null or p_version is null or p_version<1 or p_note is null or length(trim(p_note)) not between 5 and 500 then raise exception 'invalid_receipt_confirmation';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','receipt_manual','id',p_id,'version',p_version,'note',trim(p_note));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'receipt_review_forbidden' using errcode='42501';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status not in ('SUBMITTED','FOREMAN_APPROVED','OFFICE_APPROVED') then raise exception 'receipt_review_state' using errcode='PT409';end if;
 if e.reimbursed_at is not null then raise exception 'receipt_review_state' using errcode='PT409';end if;
 select u.sha256 into sha from public.workforce_receipt_uploads u where u.company_id=p_company and u.id=e.receipt_id and u.expense_id=e.id
  and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||e.id::text||'/'||u.id::text||'.'||u.extension);
 if sha is null then raise exception 'receipt_unavailable';end if;
 snapshot:=app_private.receipt_review_snapshot(e)||jsonb_build_object('mode','manual-review-v1','expense_epoch',extract(epoch from e.expense_at));
 if not app_private.workforce_review_is_current(p_company,p_id) then
  update public.workforce_expenses set admin_review_status='REVIEWED',admin_reviewed_by=auth.uid(),admin_reviewed_at=now(),
   admin_review_note=trim(p_note),review_snapshot=snapshot,
   version=version+1,updated_at=now() where company_id=p_company and id=p_id returning * into e;
 end if;
 answer:=jsonb_build_object('id',e.id,'version',e.version,'status',e.status,'reviewed',true);
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,answer,now());
 return answer;
end;$$;
revoke all on function public.review_workforce_receipt_manually(uuid,uuid,uuid,integer,text) from public,anon,service_role;
grant execute on function public.review_workforce_receipt_manually(uuid,uuid,uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
